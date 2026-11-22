package reports

import (
	"bytes"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"nhi-backend-api/internal/platform/httpx"
	"nhi-backend-api/internal/platform/logging"
	"nhi-backend-api/internal/platform/middleware"
	"nhi-backend-api/internal/platform/scope"
)

// Module serves the Reports page:
//
//	GET /reports/posture/preview?class=&severity=          what the report would hold (JSON)
//	GET /reports/posture/export?format=pdf|csv&class=&severity=&include=
//
// class: all | human | nhi. severity: comma list of critical,high,medium,low
// (absent: all). include: comma list of about,fix,severity (absent: all).
// The download path contains /export, so it needs the export permission and
// is written to the audit log like every other export.
type Module struct {
	resolver *scope.Resolver
}

func New(resolver *scope.Resolver) *Module { return &Module{resolver: resolver} }

func (m *Module) Register(r *mux.Router) {
	r.HandleFunc("/reports/posture/preview", m.preview).Methods(http.MethodGet)
	r.HandleFunc("/reports/posture/export", m.export).Methods(http.MethodGet)
}

var (
	previewAllowed = map[string]struct{}{"class": {}, "severity": {}}
	exportAllowed  = map[string]struct{}{"class": {}, "severity": {}, "include": {}, "format": {}}
)

func fail(w http.ResponseWriter, status int, msg, code string) {
	httpx.SendJSONResponse(w, status, httpx.APIResponse{Success: false, Message: msg, Error: code})
}

// options reads and validates the report options; ok is false after a 400.
func options(w http.ResponseWriter, r *http.Request) (PostureOptions, bool) {
	q := r.URL.Query()
	o := PostureOptions{Class: ClassAll, IncludeInfo: true, IncludeFix: true, IncludeSev: true}
	switch c := strings.ToLower(strings.TrimSpace(q.Get("class"))); c {
	case "", ClassAll:
	case ClassHuman, ClassNHI:
		o.Class = c
	default:
		fail(w, http.StatusBadRequest, "class must be all, human or nhi", "INVALID_CLASS")
		return o, false
	}
	if raw := strings.TrimSpace(q.Get("severity")); raw != "" {
		seen := map[string]bool{}
		for _, s := range strings.Split(strings.ToLower(raw), ",") {
			s = strings.TrimSpace(s)
			if s == "" || seen[s] {
				continue
			}
			if sevRank(s) == len(Severities) {
				fail(w, http.StatusBadRequest, "severity must be a comma list of critical, high, medium, low", "INVALID_SEVERITY")
				return o, false
			}
			seen[s] = true
		}
		for _, s := range Severities { // keep report order
			if seen[s] {
				o.Severities = append(o.Severities, s)
			}
		}
		if len(o.Severities) == 0 {
			fail(w, http.StatusBadRequest, "choose at least one severity", "INVALID_SEVERITY")
			return o, false
		}
	}
	if raw, present := q["include"]; present {
		o.IncludeInfo, o.IncludeFix, o.IncludeSev = false, false, false
		for _, part := range strings.Split(strings.ToLower(strings.Join(raw, ",")), ",") {
			switch strings.TrimSpace(part) {
			case "":
			case "about":
				o.IncludeInfo = true
			case "fix":
				o.IncludeFix = true
			case "severity":
				o.IncludeSev = true
			default:
				fail(w, http.StatusBadRequest, "include must be a comma list of about, fix, severity", "INVALID_INCLUDE")
				return o, false
			}
		}
	}
	return o, true
}

func (m *Module) load(w http.ResponseWriter, r *http.Request, o PostureOptions) (*PostureReport, bool) {
	claims := middleware.GetClaims(r)
	if claims == nil {
		fail(w, http.StatusUnauthorized, "Unauthorized", "UNAUTHORIZED")
		return nil, false
	}
	// Like the Posture page, the report covers every connected account.
	resolved, err := m.resolver.ResolveTenant(r.Context(), claims.UserID, claims.TenantID, claims.DBName)
	if err != nil {
		logging.FromContext(r.Context()).Error("posture report scope failed", "err", err)
		fail(w, http.StatusInternalServerError, "Could not open your workspace", "REPORT_FAILED")
		return nil, false
	}
	rep, err := LoadPosture(r.Context(), resolved, o)
	if err != nil {
		logging.FromContext(r.Context()).Error("posture report failed", "err", err)
		fail(w, http.StatusInternalServerError, "Could not build the report", "REPORT_FAILED")
		return nil, false
	}
	return rep, true
}

// PreviewData is what the Reports page shows before the download.
type PreviewData struct {
	IdentitiesScored  int            `json:"identities_scored"`
	IdentitiesFailing int            `json:"identities_failing"`
	FailingChecks     int            `json:"failing_checks"`
	BySeverity        map[string]int `json:"by_severity"`
	Accounts          int            `json:"accounts"`
	AverageScore      *float64       `json:"average_score"`
}

func (m *Module) preview(w http.ResponseWriter, r *http.Request) {
	if httpx.RejectUnknownQuery(w, r, previewAllowed) {
		return
	}
	o, ok := options(w, r)
	if !ok {
		return
	}
	rep, ok := m.load(w, r, o)
	if !ok {
		return
	}
	by := map[string]int{}
	for _, s := range Severities {
		by[s] = rep.BySeverity[s]
	}
	httpx.SendJSONResponse(w, http.StatusOK, httpx.APIResponse{Success: true, Message: "Report preview", Data: PreviewData{
		IdentitiesScored: rep.ScoredCount, IdentitiesFailing: rep.FailingCount, FailingChecks: rep.CheckCount,
		BySeverity: by, Accounts: rep.AccountsCovered, AverageScore: rep.AverageScore,
	}})
}

func (m *Module) export(w http.ResponseWriter, r *http.Request) {
	if httpx.RejectUnknownQuery(w, r, exportAllowed) {
		return
	}
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "pdf"
	}
	if format != "pdf" && format != "csv" {
		fail(w, http.StatusBadRequest, "format must be pdf or csv", "INVALID_FORMAT")
		return
	}
	o, ok := options(w, r)
	if !ok {
		return
	}
	rep, ok := m.load(w, r, o)
	if !ok {
		return
	}
	// Built in memory first so a failure is an error response, not a cut file.
	var buf bytes.Buffer
	var err error
	ctype := "text/csv; charset=utf-8"
	if format == "pdf" {
		ctype = "application/pdf"
		err = WritePosturePDF(&buf, rep)
	} else {
		buf.WriteString("\ufeff") // so Excel opens the UTF-8 file correctly
		err = WritePostureCSV(&buf, rep)
	}
	if err != nil {
		logging.FromContext(r.Context()).Error("posture report render failed", "err", err, "format", format)
		fail(w, http.StatusInternalServerError, "Could not build the report", "REPORT_FAILED")
		return
	}
	name := "posture-report-" + o.Class + "-" + time.Now().UTC().Format("2006-01-02") + "." + format
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "private, no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buf.Bytes())
}
