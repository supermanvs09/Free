package credentialexposure

import (
	"context"
	"errors"
	"fmt"
	"time"

	"nhi-backend-api/internal/platform/scope"
)

var (
	ErrDecisionFindingNotFound  = errors.New("finding not found")
	ErrDecisionFindingAmbiguous = errors.New("finding id exists in more than one platform table")
)

type DecisionRepository struct{}

func NewDecisionRepository() *DecisionRepository { return &DecisionRepository{} }

// Save writes a person's label on one finding. deep labels a deep-scan
// finding (secscan_deep_findings, or secscan_deep_findings_* before the
// scanner's table merge), as the scanner's "deep": true does.
func (r *DecisionRepository) Save(ctx context.Context, resolved *scope.DataScope, findingID, decision, decidedBy string, deep bool) error {
	cat, err := loadCatalog(ctx, resolved)
	if err != nil {
		return err
	}
	kind := kindFindings
	if deep {
		kind = kindDeepFindings
	}
	tables := cat.platformTables(kind)
	if len(tables) == 0 {
		return ErrDecisionFindingNotFound
	}
	schema := resolved.QSchema()
	tx, err := resolved.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin finding decision: %w", err)
	}
	defer tx.Rollback()
	// Which platform table holds it: exactly one may. After the scanner's
	// merge every platform names the same table, so each is checked once.
	var found []string
	seen := map[string]bool{}
	for _, pt := range tables {
		if seen[pt.table] {
			continue
		}
		seen[pt.table] = true
		var exists bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM `+schema+`.`+pt.table+` WHERE finding_id=$1)`, findingID).Scan(&exists); err != nil {
			return fmt.Errorf("locate finding for decision: %w", err)
		}
		if exists {
			found = append(found, pt.table)
		}
	}
	switch len(found) {
	case 0:
		return ErrDecisionFindingNotFound
	case 1:
	default:
		return ErrDecisionFindingAmbiguous
	}
	query := `UPDATE ` + schema + `.` + found[0] + ` SET analyst_decision=$1,analyst_decided_at=$2,analyst_decided_by=$3 WHERE finding_id=$4`
	res, err := tx.ExecContext(ctx, query, decision, dashboardTimestamp(time.Now()), decidedBy, findingID)
	if err != nil {
		return fmt.Errorf("save analyst decision: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("verify analyst decision update: %w", err)
	}
	if n != 1 {
		return ErrDecisionFindingNotFound
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit analyst decision: %w", err)
	}
	return nil
}
