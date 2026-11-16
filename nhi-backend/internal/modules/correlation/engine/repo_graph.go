package engine

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/lib/pq"
)

// errGraphMissing stops loading when the nhi_* tables are absent in a schema.
var errGraphMissing = errors.New("graph tables missing")

// LoadGraphData reads the additive fetcher's nhi_* tables (see the PG
// collector's migrations/007_nhi_graph_tables.sql): from the tenant schema, or
// from the older <schema>_nhigraph when they are not there yet. Without them it
// returns GraphData with Available false, so the engine works as before.
func (r *PGRepo) LoadGraphData(ctx context.Context, ds *Scope) (*GraphData, error) {
	if ds == nil || ds.DB == nil {
		return &GraphData{}, nil
	}
	for _, schema := range ds.GraphSchemas() {
		d, err := r.loadGraphFrom(ctx, ds, schema)
		if err != nil {
			return nil, err
		}
		if d.Available {
			return d, nil
		}
	}
	return &GraphData{}, nil
}

func (r *PGRepo) loadGraphFrom(ctx context.Context, ds *Scope, schema string) (*GraphData, error) {
	table := func(name string) string { return QualifiedTable(schema, name) }
	d := &GraphData{
		Available:   true,
		Policies:    map[string][]ResourcePolicy{},
		KMSGrants:   map[string][]KMSGrant{},
		KeyManagers: map[string]string{},
		LinksFrom:   map[string][]GraphLink{},
		LastUsed:    map[string]map[string]*time.Time{},
	}
	accounts := pq.Array(ds.AccountIDs)
	const inScope = `(cardinality($1::text[]) = 0 OR account_id = ANY($1::text[]))`

	query := func(name, q string, args []any, scan func(*sql.Rows) error) error {
		rows, err := ds.DB.QueryContext(ctx, q, args...)
		if err != nil {
			if isMissingTable(err) {
				return errGraphMissing
			}
			return fmt.Errorf("load graph %s: %w", name, err)
		}
		defer rows.Close()
		for rows.Next() {
			if err := scan(rows); err != nil {
				return fmt.Errorf("scan graph %s: %w", name, err)
			}
		}
		return rows.Err()
	}

	badDocs := 0
	steps := []func() error{
		func() error {
			q := fmt.Sprintf(`SELECT account_id, resource_arn, policy_type, COALESCE(policy_name, ''), document::text
				FROM %s WHERE %s`, table("nhi_resource_policies"), inScope)
			return query("resource policies", q, []any{accounts}, func(rows *sql.Rows) error {
				var acct, res, typ, name, doc string
				if err := rows.Scan(&acct, &res, &typ, &name, &doc); err != nil {
					return err
				}
				if typ == "kms_grant" {
					var g struct {
						Grantee    string   `json:"grantee_principal"`
						Operations []string `json:"operations"`
					}
					if json.Unmarshal([]byte(doc), &g) != nil || g.Grantee == "" {
						badDocs++
						return nil
					}
					d.KMSGrants[res] = append(d.KMSGrants[res], KMSGrant{KeyARN: res, Grantee: g.Grantee, Operations: g.Operations})
					return nil
				}
				stmts, err := ParseResourcePolicy([]byte(doc))
				if err != nil {
					badDocs++
					return nil
				}
				d.Policies[res] = append(d.Policies[res], ResourcePolicy{ResourceARN: res, AccountID: acct,
					PolicyType: typ, PolicyName: name, Statements: stmts})
				return nil
			})
		},
		func() error {
			q := fmt.Sprintf(`SELECT resource_arn, COALESCE(attributes->>'key_manager', '')
				FROM %s WHERE service = 'kms' AND %s`, table("nhi_resources"), inScope)
			return query("kms keys", q, []any{accounts}, func(rows *sql.Rows) error {
				var arn, mgr string
				if err := rows.Scan(&arn, &mgr); err != nil {
					return err
				}
				d.KeyManagers[arn] = strings.ToUpper(mgr)
				return nil
			})
		},
		func() error {
			q := fmt.Sprintf(`SELECT link_type, from_arn, to_arn FROM %s WHERE %s`, table("nhi_resource_links"), inScope)
			return query("links", q, []any{accounts}, func(rows *sql.Rows) error {
				var l GraphLink
				if err := rows.Scan(&l.Type, &l.From, &l.To); err != nil {
					return err
				}
				d.LinksFrom[l.From] = append(d.LinksFrom[l.From], l)
				return nil
			})
		},
		func() error {
			// Not limited to the scope's accounts: SCPs are read from the
			// management account and apply to the member accounts.
			q := fmt.Sprintf(`SELECT account_id, policy_id, COALESCE(name, ''), document::text, targets::text
				FROM %s WHERE policy_type = 'SERVICE_CONTROL_POLICY'`, table("nhi_org_policies"))
			return query("scps", q, nil, func(rows *sql.Rows) error {
				var p SCPolicy
				var doc, targets string
				if err := rows.Scan(&p.FromAccount, &p.ID, &p.Name, &doc, &targets); err != nil {
					return err
				}
				stmts, err := ParsePolicyDocument([]byte(doc))
				if err != nil || json.Unmarshal([]byte(targets), &p.Targets) != nil {
					badDocs++
					return nil
				}
				p.Statements = stmts
				d.SCPs = append(d.SCPs, p)
				return nil
			})
		},
		func() error {
			q := fmt.Sprintf(`SELECT role_arn, service_namespace, last_authenticated FROM %s WHERE %s`,
				table("nhi_service_last_accessed"), inScope)
			return query("last accessed", q, []any{accounts}, func(rows *sql.Rows) error {
				var role, svc string
				var last sql.NullTime
				if err := rows.Scan(&role, &svc, &last); err != nil {
					return err
				}
				if d.LastUsed[role] == nil {
					d.LastUsed[role] = map[string]*time.Time{}
				}
				if last.Valid {
					t := last.Time
					d.LastUsed[role][strings.ToLower(svc)] = &t
				} else {
					d.LastUsed[role][strings.ToLower(svc)] = nil
				}
				return nil
			})
		},
		func() error {
			q := fmt.Sprintf(`SELECT DISTINCT ON (account_id, source, region) account_id, source, region, status, COALESCE(message, '')
				FROM %s WHERE %s ORDER BY account_id, source, region, finished_at DESC`, table("nhi_fetch_status"), inScope)
			return query("fetch status", q, []any{accounts}, func(rows *sql.Rows) error {
				var s FetchStatus
				if err := rows.Scan(&s.AccountID, &s.Source, &s.Region, &s.Status, &s.Message); err != nil {
					return err
				}
				d.Status = append(d.Status, s)
				return nil
			})
		},
	}
	for _, step := range steps {
		if err := step(); err != nil {
			if errors.Is(err, errGraphMissing) {
				return &GraphData{}, nil
			}
			return nil, err
		}
	}
	if badDocs > 0 {
		log.Printf("WARNING: graph data: %d unparseable policy document(s) skipped", badDocs)
	}
	return d, nil
}
