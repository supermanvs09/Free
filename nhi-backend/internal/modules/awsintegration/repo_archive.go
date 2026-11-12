package awsintegration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/database"
)

// Removing an AWS account keeps its data unless the admin asks for it to be
// deleted for good: every row the account owns is MOVED into an archive table
// of the same tenant schema (removed__<table>), and the accounts row with it.
// Moving, rather than flagging, means no page, query or worker needs to know
// about removed accounts - the data is simply not in the live tables. When
// the same AWS account is connected again, RestoreAccount moves it back.

const archivePrefix = "removed__"

// archiveTable is the archive's name for table, within Postgres's 63-byte limit.
func archiveTable(table string) string {
	name := archivePrefix + table
	if len(name) <= 63 {
		return name
	}
	sum := sha256.Sum256([]byte(table))
	return name[:54] + "_" + hex.EncodeToString(sum[:4])
}

// archivePlan is every (table, rows) to move, in the order they must leave
// the live tables: rows of tables that reference a moved row through a
// foreign key go first (a cascading delete would otherwise drop them; a
// restricting one would refuse). Restore runs it backwards, parents first.
func archivePlan(ctx context.Context, tx *sql.Tx, schema string, withAccounts bool) ([]selection, error) {
	sels, err := accountSelections(ctx, tx, schema, withAccounts)
	if err != nil {
		return nil, err
	}
	var plan []selection
	seen := map[selection]bool{}
	var visit func(sel selection, depth int) error
	visit = func(sel selection, depth int) error {
		if seen[sel] || depth > 4 {
			return nil
		}
		seen[sel] = true
		children, err := referencingTables(ctx, tx, schema, sel.table)
		if err != nil {
			return err
		}
		for _, c := range children {
			where := "(" + quoteCols(c.cols) + ") IN (SELECT " + quoteCols(c.refCols) + " FROM " +
				database.Table(schema, sel.table) + " WHERE " + sel.where + ")"
			if err := visit(selection{c.table, where}, depth+1); err != nil {
				return err
			}
		}
		plan = append(plan, sel)
		return nil
	}
	for _, sel := range sels {
		if err := visit(sel, 0); err != nil {
			return nil, err
		}
	}
	return plan, nil
}

type fkChild struct {
	table         string
	cols, refCols []string
}

// referencingTables are the tables of schema with a foreign key to table.
func referencingTables(ctx context.Context, tx *sql.Tx, schema, table string) ([]fkChild, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT ch.relname,
		       ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
		             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.i)::text[],
		       ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(n, i)
		             JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.i)::text[]
		  FROM pg_constraint con
		  JOIN pg_class ch ON ch.oid = con.conrelid
		  JOIN pg_class pa ON pa.oid = con.confrelid
		  JOIN pg_namespace n ON n.oid = pa.relnamespace
		 WHERE con.contype = 'f' AND con.conparentid = 0 AND n.nspname = $1 AND pa.relname = $2
		   AND ch.relnamespace = pa.relnamespace AND NOT ch.relispartition AND ch.relname <> pa.relname
		 ORDER BY ch.relname`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("foreign keys to %s: %w", table, err)
	}
	defer rows.Close()
	var out []fkChild
	for rows.Next() {
		var c fkChild
		if err := rows.Scan(&c.table, pq.Array(&c.cols), pq.Array(&c.refCols)); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func quoteCols(cols []string) string {
	q := make([]string, len(cols))
	for i, c := range cols {
		q[i] = `"` + strings.ReplaceAll(c, `"`, `""`) + `"`
	}
	return strings.Join(q, ", ")
}

// tableColumns are the columns of schema.table; insertable leaves out
// generated columns, which cannot be written.
func tableColumns(ctx context.Context, tx *sql.Tx, schema, table string, insertable bool) (names, types []string, err error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT a.attname, format_type(a.atttypid, a.atttypmod)
		  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped AND (NOT $3 OR a.attgenerated = '')
		 ORDER BY a.attnum`, schema, table, insertable)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var n, t string
		if err := rows.Scan(&n, &t); err != nil {
			return nil, nil, err
		}
		names, types = append(names, n), append(types, t)
	}
	return names, types, rows.Err()
}

// ensureArchive creates removed__<table> like the live table and adds any
// column the live table gained since.
func ensureArchive(ctx context.Context, tx *sql.Tx, schema, table string) error {
	arc := database.Table(schema, archiveTable(table))
	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS `+arc+` (LIKE `+database.Table(schema, table)+` INCLUDING DEFAULTS)`); err != nil {
		return err
	}
	names, types, err := tableColumns(ctx, tx, schema, table, false)
	if err != nil {
		return err
	}
	for i, n := range names {
		if _, err := tx.ExecContext(ctx, `ALTER TABLE `+arc+` ADD COLUMN IF NOT EXISTS `+quoteCols([]string{n})+` `+types[i]); err != nil {
			return err
		}
	}
	return nil
}

// ArchiveAccount moves the account's rows, and its accounts row, into the
// archive tables. Tables that refuse are left as they are and reported with
// purgeSkipped. It returns the rows moved per table.
func (r *AWSIntegrationRepository) ArchiveAccount(ctx context.Context, tenantID, schema, accountID string) (map[string]int64, error) {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := lockAccount(ctx, tx, accountID); err != nil {
		return nil, err
	}
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+database.Table(schema, accountsTable)+`
		WHERE tenant_id = $1::uuid AND account_id = $2 AND `+connectionRow+`)`, tenantID, accountID).Scan(&exists); err != nil {
		return nil, fmt.Errorf("look up aws account: %w", missingSchema(err))
	}
	if !exists {
		return nil, ErrAWSAccountNotFound
	}
	plan, err := archivePlan(ctx, tx, schema, true)
	if err != nil {
		return nil, err
	}
	moved := map[string]int64{}
	for _, sel := range plan {
		n, skipped, err := inSavepoint(ctx, tx, func() (int64, error) {
			if err := ensureArchive(ctx, tx, schema, sel.table); err != nil {
				return 0, err
			}
			names, _, err := tableColumns(ctx, tx, schema, sel.table, false)
			if err != nil {
				return 0, err
			}
			cols := quoteCols(names)
			if _, err := tx.ExecContext(ctx, `INSERT INTO `+database.Table(schema, archiveTable(sel.table))+` (`+cols+`)
				SELECT `+cols+` FROM `+database.Table(schema, sel.table)+` WHERE `+sel.where, accountID); err != nil {
				return 0, err
			}
			res, err := tx.ExecContext(ctx, `DELETE FROM `+database.Table(schema, sel.table)+` WHERE `+sel.where, accountID)
			if err != nil {
				return 0, err
			}
			return res.RowsAffected()
		})
		if err != nil {
			return nil, fmt.Errorf("archive %s: %w", sel.table, err)
		}
		if sel.table == accountsTable && (skipped || n == 0) {
			return nil, fmt.Errorf("archive the accounts row: it could not be moved")
		}
		if skipped {
			moved[purgeSkipped+sel.table] = -1
		} else if n > 0 {
			moved[sel.table] += n
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return moved, nil
}

// RestoreAccount moves an archived account's data back into the live tables
// (the accounts row is not restored: the new connection has its own). Rows
// already back in a live table are kept as they are. Nothing archived: nothing
// done, nil map.
func (r *AWSIntegrationRepository) RestoreAccount(ctx context.Context, schema, accountID string) (map[string]int64, error) {
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return nil, err
	}
	var archived bool
	err = db.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, database.Table(schema, archiveTable(accountsTable))).Scan(&archived)
	if err != nil || !archived {
		return nil, err
	}
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM `+database.Table(schema, archiveTable(accountsTable))+` WHERE account_id::text = $1)`, accountID).Scan(&archived); err != nil || !archived {
		return nil, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := lockAccount(ctx, tx, accountID); err != nil {
		return nil, err
	}
	plan, err := archivePlan(ctx, tx, schema, false)
	if err != nil {
		return nil, err
	}
	restored := map[string]int64{}
	for i := len(plan) - 1; i >= 0; i-- {
		sel := plan[i]
		var has bool
		if err := tx.QueryRowContext(ctx, `SELECT to_regclass($1) IS NOT NULL`, database.Table(schema, archiveTable(sel.table))).Scan(&has); err != nil {
			return nil, err
		}
		if !has {
			continue
		}
		n, skipped, err := inSavepoint(ctx, tx, func() (int64, error) {
			live, _, err := tableColumns(ctx, tx, schema, sel.table, true)
			if err != nil {
				return 0, err
			}
			arcCols, _, err := tableColumns(ctx, tx, schema, archiveTable(sel.table), false)
			if err != nil {
				return 0, err
			}
			inArc := map[string]bool{}
			for _, c := range arcCols {
				inArc[c] = true
			}
			var common []string
			for _, c := range live {
				if inArc[c] {
					common = append(common, c)
				}
			}
			cols := quoteCols(common)
			res, err := tx.ExecContext(ctx, `INSERT INTO `+database.Table(schema, sel.table)+` (`+cols+`) OVERRIDING SYSTEM VALUE
				SELECT `+cols+` FROM `+database.Table(schema, archiveTable(sel.table))+` WHERE `+sel.where+` ON CONFLICT DO NOTHING`, accountID)
			if err != nil {
				return 0, err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+database.Table(schema, archiveTable(sel.table))+` WHERE `+sel.where, accountID); err != nil {
				return 0, err
			}
			return res.RowsAffected()
		})
		if err != nil {
			return nil, fmt.Errorf("restore %s: %w", sel.table, err)
		}
		if skipped {
			restored[purgeSkipped+sel.table] = -1
		} else if n > 0 {
			restored[sel.table] += n
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM `+database.Table(schema, archiveTable(accountsTable))+` WHERE account_id::text = $1`, accountID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return restored, nil
}
