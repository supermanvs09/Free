package awsintegration

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"

	"nhi-backend-api/internal/platform/database"
)

// Approving from the e-mail. The "approval needed" e-mail carries one link per
// approver. The link opens a page (never decides by itself: mail scanners open
// every link) where the approver approves or rejects. The token travels in the
// URL fragment, which no server or proxy ever sees, and is posted in a request
// body; only its hash is stored, a link works once, and it expires.

// approvalLinkTTL is how long an e-mailed link stays usable. After that the
// request is decided in the tenant-onboarding tool.
const approvalLinkTTL = 72 * time.Hour

// maxLinkNote bounds the note an approver may leave.
const maxLinkNote = 1000

var (
	// ErrApprovalLinkInvalid: no such link (or a token of the wrong shape).
	ErrApprovalLinkInvalid = errors.New("approval link is not valid")
	// ErrApprovalLinkExpired: the link is older than approvalLinkTTL.
	ErrApprovalLinkExpired = errors.New("approval link has expired")
	// ErrApprovalLinkUsed: this link already decided something.
	ErrApprovalLinkUsed = errors.New("approval link was already used")
)

// ApprovalDecidedError: somebody decided the request first (in the e-mail or in
// the tenant-onboarding tool), or the company removed the account meanwhile.
type ApprovalDecidedError struct{ Status, By string }

func (e *ApprovalDecidedError) Error() string {
	return "approval request already " + e.Status
}

// ApprovalLinkView is what a link opens: the request, whose link it is, and
// where the request stands.
type ApprovalLinkView struct {
	ApprovalID   int64
	Email        string
	ExpiresAt    time.Time
	Expired      bool
	Used         bool
	Status       string // pending | approved | rejected | withdrawn
	Domain       string
	Workspace    string
	AccountID    string
	RoleARN      string
	Regions      []string
	RequestedBy  string
	RequestedAt  time.Time
	DecidedBy    string
	DecidedAt    *time.Time
	DecisionNote string
}

// linkTokenLen is the length of a base64url-encoded 32-byte token.
const linkTokenLen = 43

func newLinkToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("random token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashLinkToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// wellFormedToken rejects garbage before it reaches the database.
func wellFormedToken(token string) bool {
	if len(token) != linkTokenLen {
		return false
	}
	for _, c := range token {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return false
		}
	}
	return true
}

// CreateApprovalLinks issues one single-use token per recipient of request
// approvalID and returns them keyed by the address given. Only their hashes are
// stored. An address listed twice (in any letter case) gets one token.
func (r *AWSIntegrationRepository) CreateApprovalLinks(ctx context.Context, approvalID int64, emails []string, ttl time.Duration) (map[string]string, error) {
	db, err := r.pool()
	if err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	table := database.Table(r.globalSchema, "connection_approval_links")
	out := make(map[string]string, len(emails))
	byLower := map[string]string{}
	for _, email := range emails {
		key := strings.ToLower(strings.TrimSpace(email))
		if key == "" {
			continue
		}
		if token, ok := byLower[key]; ok {
			out[email] = token
			continue
		}
		token, err := newLinkToken()
		if err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO `+table+` (approval_id, email, token_hash, expires_at)
			VALUES ($1, $2, $3, now() + ($4 * interval '1 second'))`,
			approvalID, strings.TrimSpace(email), hashLinkToken(token), int64(ttl/time.Second)); err != nil {
			return nil, fmt.Errorf("store approval link: %w", err)
		}
		byLower[key] = token
		out[email] = token
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit approval links: %w", err)
	}
	return out, nil
}

const linkViewColumns = `l.approval_id, l.email, l.expires_at, l.expires_at <= now(), l.used_at IS NOT NULL,
	a.status, a.tenant_domain, a.db_name, a.account_id, a.role_arn, a.regions, a.requested_by, a.requested_at,
	COALESCE(a.decided_by, ''), a.decided_at, a.decision_note`

func scanLinkView(row interface{ Scan(...any) error }) (*ApprovalLinkView, error) {
	var v ApprovalLinkView
	var decided sql.NullTime
	err := row.Scan(&v.ApprovalID, &v.Email, &v.ExpiresAt, &v.Expired, &v.Used,
		&v.Status, &v.Domain, &v.Workspace, &v.AccountID, &v.RoleARN, pq.Array(&v.Regions), &v.RequestedBy, &v.RequestedAt,
		&v.DecidedBy, &decided, &v.DecisionNote)
	if err != nil {
		return nil, err
	}
	if decided.Valid {
		t := decided.Time
		v.DecidedAt = &t
	}
	return &v, nil
}

// ApprovalLinkInfo reads what a link opens. It changes nothing.
func (r *AWSIntegrationRepository) ApprovalLinkInfo(ctx context.Context, token string) (*ApprovalLinkView, error) {
	if !wellFormedToken(token) {
		return nil, ErrApprovalLinkInvalid
	}
	db, err := r.pool()
	if err != nil {
		return nil, err
	}
	v, err := scanLinkView(db.QueryRowContext(ctx, `SELECT `+linkViewColumns+`
		FROM `+database.Table(r.globalSchema, "connection_approval_links")+` l
		JOIN `+database.Table(r.globalSchema, "connection_approvals")+` a ON a.id = l.approval_id
		WHERE l.token_hash = $1`, hashLinkToken(token)))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrApprovalLinkInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("read approval link: %w", err)
	}
	return v, nil
}

// DecideByLink approves or rejects the request a link belongs to, exactly as
// the tenant-onboarding tool does (the two share the lock on the account, so
// they cannot interleave): the account's approval is recorded and the request
// closed in one transaction. Approving does not connect the account; its events
// check does that. The decision is recorded as the address the link went to.
func (r *AWSIntegrationRepository) DecideByLink(ctx context.Context, token string, approve bool, note string) (*ApprovalLinkView, error) {
	if !wellFormedToken(token) {
		return nil, ErrApprovalLinkInvalid
	}
	hash := hashLinkToken(token)
	pool, err := r.pool()
	if err != nil {
		return nil, err
	}
	links := database.Table(r.globalSchema, "connection_approval_links")
	approvals := database.Table(r.globalSchema, "connection_approvals")

	// The workspace is named by the request, so find it before opening the
	// transaction that touches that workspace's accounts.
	var schema string
	err = pool.QueryRowContext(ctx, `SELECT a.db_name FROM `+links+` l JOIN `+approvals+` a ON a.id = l.approval_id
		WHERE l.token_hash = $1`, hash).Scan(&schema)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrApprovalLinkInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("read approval link: %w", err)
	}
	db, err := r.accountsDB(ctx, schema)
	if err != nil {
		return nil, err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var linkID, approvalID int64
	var email string
	var expired, used bool
	err = tx.QueryRowContext(ctx, `SELECT id, approval_id, email, expires_at <= now(), used_at IS NOT NULL
		FROM `+links+` WHERE token_hash = $1 FOR UPDATE`, hash).Scan(&linkID, &approvalID, &email, &expired, &used)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrApprovalLinkInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("lock approval link: %w", err)
	}
	var status, accountID, decidedBy string
	err = tx.QueryRowContext(ctx, `SELECT status, account_id, COALESCE(decided_by, '') FROM `+approvals+`
		WHERE id = $1 FOR UPDATE`, approvalID).Scan(&status, &accountID, &decidedBy)
	if err != nil {
		return nil, fmt.Errorf("lock approval: %w", err)
	}
	switch {
	case status != "pending":
		return nil, &ApprovalDecidedError{Status: status, By: decidedBy}
	case used:
		return nil, ErrApprovalLinkUsed
	case expired:
		return nil, ErrApprovalLinkExpired
	}
	// The same lock the tenant-onboarding tool and every account write take.
	if err := lockAccount(ctx, tx, accountID); err != nil {
		return nil, err
	}
	accounts := database.Table(schema, accountsTable)
	who := "approver " + email
	var res sql.Result
	if approve {
		// Approved, not connected: the events check runs next and connects the
		// account when its first event arrives (the same statement as the
		// tenant-onboarding tool's approve).
		res, err = tx.ExecContext(ctx, `UPDATE `+accounts+` SET
				approval_status = 'approved', approved_at = now(), approved_by = $2, approval_note = $3,
				account_status = CASE WHEN is_connected THEN 'active' ELSE 'pending' END,
				updated_at = now()
			WHERE account_id = $1`, accountID, who, note)
	} else {
		res, err = tx.ExecContext(ctx, `UPDATE `+accounts+` SET
				approval_status = 'rejected', approved_at = now(), approved_by = $2, approval_note = $3,
				account_status = 'rejected', is_connected = false, updated_at = now()
			WHERE account_id = $1`, accountID, who, note)
	}
	if err != nil {
		return nil, fmt.Errorf("update account: %w", missingSchema(err))
	}
	outcome := "rejected"
	if approve {
		outcome = "approved"
	}
	decider := email + " (e-mail link)"
	if n, _ := res.RowsAffected(); n == 0 {
		// The company removed the account after asking: nothing to decide.
		if _, err := tx.ExecContext(ctx, `UPDATE `+approvals+`
			SET status = 'withdrawn', decided_at = now(), decided_by = 'account removed' WHERE id = $1`, approvalID); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE `+links+` SET used_at = now() WHERE id = $1`, linkID); err != nil {
			return nil, err
		}
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		return nil, &ApprovalDecidedError{Status: "withdrawn", By: "account removed"}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+approvals+`
		SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`,
		approvalID, outcome, decider, note); err != nil {
		return nil, fmt.Errorf("record decision: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE `+links+` SET used_at = now() WHERE id = $1`, linkID); err != nil {
		return nil, fmt.Errorf("close approval link: %w", err)
	}
	view, err := scanLinkView(tx.QueryRowContext(ctx, `SELECT `+linkViewColumns+`
		FROM `+links+` l JOIN `+approvals+` a ON a.id = l.approval_id WHERE l.id = $1`, linkID))
	if err != nil {
		return nil, fmt.Errorf("read decision: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit decision: %w", err)
	}
	return view, nil
}
