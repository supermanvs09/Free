package alerts

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"nhi-backend-api/internal/modules/credentialexposure"
	"nhi-backend-api/internal/modules/genome/anomalylist"
	"nhi-backend-api/internal/platform/scope"
)

// Sources of alerts.
const (
	SourcePosture  = "posture"
	SourceGenome   = "genome"
	SourceExposure = "exposure"
)

// Alert is one item of the unified inbox, whatever raised it.
type Alert struct {
	Key         string    `json:"key"`
	Source      string    `json:"source"`
	Severity    string    `json:"severity"` // critical | high | medium | low
	Title       string    `json:"title"`
	Summary     string    `json:"summary"`
	Subject     string    `json:"subject"`
	SubjectType string    `json:"subject_type"`
	AccountID   string    `json:"account_id,omitempty"`
	DetectedAt  time.Time `json:"detected_at"`
	Count       int       `json:"count"`
	Link        string    `json:"link"`
	// Source-specific facts for the preview.
	ScoreBefore *int              `json:"score_before,omitempty"`
	ScoreNow    *int              `json:"score_now,omitempty"`
	Facts       map[string]string `json:"facts,omitempty"`
}

// InboxSummary is the header of the page and the badge.
type InboxSummary struct {
	Total        int             `json:"total"`
	BySource     map[string]int  `json:"by_source"`
	BySeverity   map[string]int  `json:"by_severity"`
	Badge        int             `json:"badge"`
	LastSync     *time.Time      `json:"last_sync"`
	PreviousSync *time.Time      `json:"previous_sync"`
	Available    map[string]bool `json:"available"`
}

type Inbox struct {
	Summary InboxSummary `json:"summary"`
	Alerts  []Alert      `json:"alerts"`
}

// GenomeLister is the genome anomaly list (anomalylist.Service).
type GenomeLister interface {
	List(ctx context.Context, userID, tenantID, dbName string, p anomalylist.Params) (*anomalylist.Response, *string, error)
}

func severityRank(s string) int {
	switch strings.ToLower(s) {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	}
	return 0
}

func normSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical":
		return "critical"
	case "high":
		return "high"
	case "medium", "moderate":
		return "medium"
	case "low", "info", "informational":
		return "low"
	}
	return "medium"
}

func dropSeverity(d ScoreDrop) string {
	fell := -d.Delta
	crossed := d.BandBefore != "" && !strings.EqualFold(d.BandBefore, d.BandNow)
	switch {
	case fell >= 20 || (crossed && strings.EqualFold(d.BandNow, "critical")):
		return "critical"
	case fell >= 10 || crossed:
		return "high"
	}
	return "medium"
}

// inbox gathers every source and summarises. Read-only: it reflects what is
// wrong now, and an alert leaves the list when its cause clears.
// canExposure: exposure findings (paths, authors, masked values) go only to
// roles that may read them on the Credential exposure page.
func (h *Handler) inbox(ctx context.Context, ds *scope.DataScope, userID, tenantID, dbName string, canExposure bool) (*Inbox, error) {
	out := &Inbox{Alerts: []Alert{}, Summary: InboxSummary{BySource: map[string]int{}, BySeverity: map[string]int{}, Available: map[string]bool{}}}

	// Posture: identities whose score fell at the latest sync.
	drops, err := h.repo.ScoreDrops(ctx, ds)
	if err != nil {
		return nil, err
	}
	out.Summary.Available[SourcePosture] = true
	for _, d := range drops {
		before, now := d.ScoreBefore, d.ScoreNow
		title := fmt.Sprintf("Score dropped %d points", -d.Delta)
		summary := d.TopReason
		if summary == "" {
			summary = "Score recalculated lower at the latest sync."
		} else if d.NewFailing > 1 {
			summary = fmt.Sprintf("%s, and %d more", d.TopReason, d.NewFailing-1)
		}
		out.Alerts = append(out.Alerts, Alert{
			Key: SourcePosture + ":" + d.IdentityID, Source: SourcePosture, Severity: dropSeverity(d), Title: title, Summary: summary,
			Subject: d.IdentityName, SubjectType: d.IdentityType, AccountID: d.AccountID, DetectedAt: d.DetectedAt, Count: d.NewFailing,
			Link: "/alerts/identities/" + url.PathEscape(d.IdentityID), ScoreBefore: &before, ScoreNow: &now,
			Facts: map[string]string{"band_before": d.BandBefore, "band_now": d.BandNow, "top_points": fmt.Sprint(d.TopPoints)},
		})
	}
	latest, previous, err := h.repo.LastSyncs(ctx, ds)
	if err != nil {
		return nil, err
	}
	if !latest.IsZero() {
		out.Summary.LastSync = &latest
	}
	if !previous.IsZero() {
		out.Summary.PreviousSync = &previous
	}

	// Genome: one alert per identity with open anomalies.
	if h.genome != nil {
		type agg struct {
			a     Alert
			kinds map[string]int
			worst int
		}
		byID := map[string]*agg{}
		cursor := ""
		ok := true
		for page := 0; page < 10; page++ {
			res, next, err := h.genome.List(ctx, userID, tenantID, dbName, anomalylist.Params{State: "open", Limit: 100, Cursor: cursor})
			if err != nil {
				slog.Default().Info("alerts: genome anomalies unavailable", "err", err)
				ok = false
				break
			}
			for _, it := range res.Items {
				id := it.Identity.SourceType + "|" + it.Identity.IdentityName
				g := byID[id]
				if g == nil {
					name := it.Identity.DisplayName
					if name == "" {
						name = it.Identity.IdentityName
					}
					g = &agg{kinds: map[string]int{}, a: Alert{Key: SourceGenome + ":" + id, Source: SourceGenome, Subject: name, SubjectType: it.Identity.SourceType,
						Facts: map[string]string{"source_type": it.Identity.SourceType, "identity_name": it.Identity.IdentityName, "monitored": strconv.FormatBool(it.Identity.Monitored)}}}
					byID[id] = g
				}
				g.a.Count++
				g.kinds[it.Dimension]++
				if it.DetectedAt.After(g.a.DetectedAt) {
					g.a.DetectedAt = it.DetectedAt
					g.a.Facts["latest"] = it.WhatChanged
				}
				sev := "medium"
				if it.Severity != nil {
					sev = normSeverity(*it.Severity)
				}
				if r := severityRank(sev); r > g.worst {
					g.worst, g.a.Severity = r, sev
					g.a.Facts["worst_dimension"] = it.Dimension
				}
			}
			if next == nil || *next == "" {
				break
			}
			cursor = *next
		}
		out.Summary.Available[SourceGenome] = ok
		for _, g := range byID {
			if g.a.Severity == "" {
				g.a.Severity = "medium"
			}
			dims := make([]string, 0, len(g.kinds))
			for k := range g.kinds {
				dims = append(dims, strings.ReplaceAll(k, "_", " "))
			}
			sort.Strings(dims)
			g.a.Title = fmt.Sprintf("Behaviour departed from its baseline (%d)", g.a.Count)
			g.a.Summary = fmt.Sprintf("%d %s: %s", len(dims), plural(len(dims), "kind", "kinds"), strings.Join(dims, ", "))
			out.Alerts = append(out.Alerts, g.a)
		}
	}

	// Credential exposure: each live-looking credential found in code.
	if h.exposure != nil && canExposure {
		items, _, err := h.exposure.List(ctx, ds, credentialexposure.FindingsFilter{Limit: exposureLimit})
		if err != nil {
			slog.Default().Info("alerts: credential exposure unavailable", "err", err)
		} else {
			out.Summary.Available[SourceExposure] = true
			for _, f := range items {
				t, _ := parseTime(f.CreatedAt)
				sev := normSeverity(f.RiskTier)
				if f.RiskTier == "" {
					sev = normSeverity(f.Severity)
				}
				out.Alerts = append(out.Alerts, Alert{
					Key: SourceExposure + ":" + f.FindingID, Source: SourceExposure, Severity: sev,
					Title: humanize(f.Detector) + " exposed in code", Summary: fmt.Sprintf("%s/%s:%d", f.Repository, f.FilePath, f.LineNumber),
					Subject: f.Repository, SubjectType: f.Platform, DetectedAt: t, Count: 1,
					Link:  "/exposure?search=" + url.QueryEscape(f.FilePath),
					Facts: map[string]string{"author": f.Author, "redacted": f.Redacted, "verification": f.VerificationStatus, "file": f.FilePath, "line": fmt.Sprint(f.LineNumber), "branch": f.Branch, "commit": f.CommitID},
				})
			}
		}
	}

	sort.SliceStable(out.Alerts, func(i, j int) bool {
		a, b := out.Alerts[i], out.Alerts[j]
		if ra, rb := severityRank(a.Severity), severityRank(b.Severity); ra != rb {
			return ra > rb
		}
		return a.DetectedAt.After(b.DetectedAt)
	})
	s := &out.Summary
	for _, a := range out.Alerts {
		s.Total++
		s.BySource[a.Source]++
		s.BySeverity[a.Severity]++
	}
	s.Badge = s.Total
	return out, nil
}

func plural(n int, one, many string) string {
	if n == 1 {
		return one
	}
	return many
}

func humanize(s string) string {
	t := strings.ReplaceAll(strings.TrimSpace(s), "_", " ")
	if t == "" {
		return "Secret"
	}
	return strings.ToUpper(t[:1]) + t[1:]
}
