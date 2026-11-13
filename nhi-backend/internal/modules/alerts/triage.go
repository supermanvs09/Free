package alerts

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/scope"
)

// Alert statuses. "open" is new and unowned work; the badge counts it.
const (
	StatusOpen       = "open"
	StatusInProgress = "in_progress"
	StatusResolved   = "resolved"
	StatusDismissed  = "dismissed"
)

var validStatus = map[string]bool{StatusOpen: true, StatusInProgress: true, StatusResolved: true, StatusDismissed: true}

// Triage is the human side of an alert: who owns it and where it stands.
type Triage struct {
	Status     string     `json:"status"`
	Assignee   string     `json:"assignee,omitempty"`
	AssignedBy string     `json:"assigned_by,omitempty"`
	AssignedAt *time.Time `json:"assigned_at,omitempty"`
	UpdatedBy  string     `json:"updated_by,omitempty"`
	UpdatedAt  *time.Time `json:"updated_at,omitempty"`
	Comments   int        `json:"comments"`
	// Reopened: it was resolved or dismissed, then got worse again.
	Reopened bool `json:"reopened,omitempty"`
}

// Activity is one entry of an alert's history.
type Activity struct {
	ID        int64     `json:"id"`
	Actor     string    `json:"actor"`
	Action    string    `json:"action"` // assigned | unassigned | status | comment
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

const (
	tTriage   = "alert_triage"
	tActivity = "alert_activity"
)

// ensured remembers the schemas whose triage tables exist (created on first
// use, like the remediation tables; migrations/tenant/012_alert_triage.sql is
// the same DDL for scripted setups).
var ensured sync.Map

func ensureTables(ctx context.Context, s *scope.DataScope) error {
	if _, ok := ensured.Load(s.Schema); ok {
		return nil
	}
	ddl := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s (
  tenant_id   TEXT        NOT NULL,
  alert_key   TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  assignee    TEXT,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, alert_key)
);
CREATE TABLE IF NOT EXISTS %[2]s (
  id         BIGSERIAL   PRIMARY KEY,
  tenant_id  TEXT        NOT NULL,
  alert_key  TEXT        NOT NULL,
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_activity_key_idx ON %[2]s (tenant_id, alert_key, created_at);`,
		s.Table(tTriage), s.Table(tActivity))
	if _, err := s.DB.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("create alert triage tables: %w", err)
	}
	ensured.Store(s.Schema, true)
	return nil
}

// triageFor loads the triage rows and comment counts for keys.
func triageFor(ctx context.Context, s *scope.DataScope, keys []string) (map[string]Triage, error) {
	out := map[string]Triage{}
	if len(keys) == 0 {
		return out, nil
	}
	if err := ensureTables(ctx, s); err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT t.alert_key, t.status, COALESCE(t.assignee,''), COALESCE(t.assigned_by,''), t.assigned_at,
			COALESCE(t.updated_by,''), t.updated_at,
			(SELECT count(*) FROM %[2]s a WHERE a.tenant_id = t.tenant_id AND a.alert_key = t.alert_key AND a.action = 'comment')
		FROM %[1]s t WHERE t.tenant_id = $1 AND t.alert_key = ANY($2)`, s.Table(tTriage), s.Table(tActivity)), s.TenantID, pq.Array(keys))
	if err != nil {
		return nil, fmt.Errorf("load triage: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var t Triage
		var at sql.NullTime
		var up time.Time
		if err := rows.Scan(&k, &t.Status, &t.Assignee, &t.AssignedBy, &at, &t.UpdatedBy, &up, &t.Comments); err != nil {
			return nil, err
		}
		if at.Valid {
			t.AssignedAt = &at.Time
		}
		t.UpdatedAt = &up
		out[k] = t
	}
	return out, rows.Err()
}

// TriageChange is one bulk update. A nil field is left as it is; an empty
// Assignee unassigns.
type TriageChange struct {
	Keys     []string `json:"keys"`
	Status   *string  `json:"status"`
	Assignee *string  `json:"assignee"`
	Note     string   `json:"note"`
}

// applyTriage writes a change for every key and records it in the history.
func applyTriage(ctx context.Context, s *scope.DataScope, actor string, c TriageChange) error {
	if err := ensureTables(ctx, s); err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	logAct := func(key, action, detail string) error {
		_, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO %s (tenant_id, alert_key, actor, action, detail) VALUES ($1,$2,$3,$4,$5)`, s.Table(tActivity)),
			s.TenantID, key, actor, action, detail)
		return err
	}
	for _, key := range c.Keys {
		var cur Triage
		var assignee sql.NullString
		err := tx.QueryRowContext(ctx, fmt.Sprintf(`SELECT status, assignee FROM %s WHERE tenant_id = $1 AND alert_key = $2 FOR UPDATE`, s.Table(tTriage)), s.TenantID, key).Scan(&cur.Status, &assignee)
		if err == sql.ErrNoRows {
			cur.Status = StatusOpen
			if _, err := tx.ExecContext(ctx, fmt.Sprintf(`INSERT INTO %s (tenant_id, alert_key, status, updated_by) VALUES ($1,$2,'open',$3) ON CONFLICT DO NOTHING`, s.Table(tTriage)), s.TenantID, key, actor); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		cur.Assignee = assignee.String
		if c.Assignee != nil && strings.TrimSpace(*c.Assignee) != cur.Assignee {
			who := strings.TrimSpace(*c.Assignee)
			if _, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET assignee = NULLIF($3,''), assigned_by = $4, assigned_at = now(), updated_by = $4, updated_at = now()
				WHERE tenant_id = $1 AND alert_key = $2`, s.Table(tTriage)), s.TenantID, key, who, actor); err != nil {
				return err
			}
			action := "assigned"
			if who == "" {
				action = "unassigned"
			}
			if err := logAct(key, action, who); err != nil {
				return err
			}
			/* Taking an unowned alert moves it out of "new". */
			if who != "" && cur.Status == StatusOpen && c.Status == nil {
				st := StatusInProgress
				if _, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET status = $3 WHERE tenant_id = $1 AND alert_key = $2`, s.Table(tTriage)), s.TenantID, key, st); err != nil {
					return err
				}
				if err := logAct(key, "status", st); err != nil {
					return err
				}
			}
		}
		if c.Status != nil && *c.Status != cur.Status {
			if _, err := tx.ExecContext(ctx, fmt.Sprintf(`UPDATE %s SET status = $3, updated_by = $4, updated_at = now() WHERE tenant_id = $1 AND alert_key = $2`, s.Table(tTriage)), s.TenantID, key, *c.Status, actor); err != nil {
				return err
			}
			if err := logAct(key, "status", *c.Status); err != nil {
				return err
			}
		}
		if note := strings.TrimSpace(c.Note); note != "" {
			if err := logAct(key, "comment", note); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func activityFor(ctx context.Context, s *scope.DataScope, key string) ([]Activity, error) {
	if err := ensureTables(ctx, s); err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, fmt.Sprintf(`SELECT id, actor, action, COALESCE(detail,''), created_at FROM %s
		WHERE tenant_id = $1 AND alert_key = $2 ORDER BY created_at DESC, id DESC LIMIT 200`, s.Table(tActivity)), s.TenantID, key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Activity{}
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.Actor, &a.Action, &a.Detail, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
