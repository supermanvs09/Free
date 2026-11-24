package reports

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"
)

type sampleRule struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Severity string   `json:"severity"`
	Area     string   `json:"area"`
	Fix      string   `json:"fix"`
	Risk     string   `json:"risk"`
	About    string   `json:"about"`
	Controls []string `json:"controls"`
}

// sampleReport is a realistic posture report built from the engine's real
// checks (testdata/sample_rules.json) over an invented organisation: six AWS
// accounts and about 320 identities. Every page it prints says SAMPLE DATA.
func sampleReport(t testing.TB, identities int) *PostureReport {
	raw, err := os.ReadFile("testdata/sample_rules.json")
	if err != nil {
		t.Fatal(err)
	}
	var rules []sampleRule
	if err := json.Unmarshal(raw, &rules); err != nil {
		t.Fatal(err)
	}
	r := rand.New(rand.NewSource(7))
	now := time.Date(2026, 11, 24, 9, 12, 0, 0, time.UTC)
	asOf := now.Add(-38 * time.Minute)
	rep := &PostureReport{
		GeneratedAt: now, Options: PostureOptions{Class: ClassAll, IncludeInfo: true, IncludeFix: true, IncludeSev: true, Population: true},
		BySeverity: map[string]int{}, PreparedFor: "Bimasugam", GeneratedBy: "admin@bimasugam",
		DataAsOf: &asOf, SLA: DefaultSLA(),
	}
	rep.ReportID = NewReportID(rep.PreparedFor, now)

	accounts := []struct{ id, name string }{
		{"411520983021", "bimasugam-payments-prod"}, {"583104772615", "bimasugam-core-prod"}, {"209847561203", "bimasugam-data-platform"},
		{"730261948557", "bimasugam-shared-services"}, {"662019384410", "bimasugam-staging"}, {"118473920566", "bimasugam-sandbox"},
	}
	// Weighted pick of checks: severe ones rarer, a few very common.
	common := []string{}
	for _, ru := range rules {
		common = append(common, ru.ID)
	}
	byID := map[string]sampleRule{}
	for _, ru := range rules {
		byID[ru.ID] = ru
	}
	hot := pickN(r, rules, 26) // the checks that fail in this estate
	weight := map[string]float64{}
	for i, ru := range hot {
		w := 1.1 / float64(i+2)
		switch ru.Severity {
		case "critical":
			w *= 0.3
		case "high":
			w *= 0.55
		case "medium":
			w *= 1.5
		case "low":
			w *= 2.4
		}
		weight[ru.ID] = w
	}
	penalty := map[string]float64{"critical": 30, "high": 16, "medium": 9, "low": 4}
	kinds := []struct{ typ, prefix string; human bool }{
		{"lambda_function", "lambda", false}, {"ecs_task", "ecs-task", false}, {"ec2_instance", "ec2", false},
		{"iam_role", "role", false}, {"iam_user", "svc", false}, {"codebuild_project", "codebuild", false}, {"iam_user", "", true},
	}
	words := []string{"payments", "settlement", "ledger", "orders", "fraud-scoring", "kyc", "reporting", "etl", "ingest", "notifications", "billing", "risk-engine", "statements", "auth", "gateway", "exports", "reconcile", "backup", "audit-sink", "metrics"}
	people := []string{"a.mehta", "j.okafor", "l.chen", "m.rossi", "s.ivanova", "d.kim", "p.nair", "r.alvarez", "t.berg", "e.dubois", "k.tanaka", "n.hassan"}

	var scores []float64
	bySev := map[string]map[string]int{}
	acctScores := map[string][]float64{}
	var humanScores, nhiScores []float64
	for i := 0; i < identities; i++ {
		a := accounts[weightedIndex(r, []float64{0.26, 0.24, 0.18, 0.13, 0.12, 0.07})]
		kind := kinds[weightedIndex(r, []float64{0.26, 0.17, 0.12, 0.2, 0.08, 0.07, 0.1})]
		var name string
		if kind.human {
			name = people[r.Intn(len(people))] + fmt.Sprintf("-%s", []string{"admin", "dev", "ops", "ro"}[r.Intn(4)])
		} else {
			name = fmt.Sprintf("%s-%s-%s", kind.prefix, words[r.Intn(len(words))], []string{"prod", "worker", "api", "job", "sync", "svc"}[r.Intn(6)])
			if r.Intn(3) == 0 {
				name += fmt.Sprintf("-%02d", r.Intn(20))
			}
		}
		id := ReportIdentity{ID: fmt.Sprintf("id-%04d", i), Name: name, Type: kind.typ, Human: kind.human, AccountID: a.id, Account: a.name,
			ARN: fmt.Sprintf("arn:aws:iam::%s:role/%s", a.id, name)}
		if kind.human {
			id.ARN = fmt.Sprintf("arn:aws:iam::%s:user/%s", a.id, name)
		}
		lost := 0.0
		riskier := 1.0
		if a.name == "bimasugam-sandbox" || a.name == "bimasugam-staging" {
			riskier = 1.5
		}
		for _, ru := range hot {
			if r.Float64() < weight[ru.ID]*riskier {
				// Ages: most recent, a long tail up to eight months.
				age := 1 + int(r.ExpFloat64()*45)
				if age > 240 {
					age = 240 - r.Intn(30)
				}
				since := now.Add(-time.Duration(age) * 24 * time.Hour)
				owner := ""
				if r.Float64() < 0.6 {
					owner = []string{"Platform Engineering", "Payments SRE", "Data Platform", "Identity & Access", "DevOps"}[r.Intn(5)]
				}
				pts := penalty[ru.Severity]
				lost += pts
				id.Checks = append(id.Checks, ReportCheck{
					RuleID: ru.ID, Check: ru.Name, Title: name + ": " + ru.Name, Severity: ru.Severity, Area: ru.Area,
					Found: foundText(ru, name, a.id), About: ru.About, Fix: ru.Fix, RuleFix: ru.Fix, Risk: ru.Risk,
					Controls: ru.Controls, Points: pts, FailingSince: &since, Owner: owner,
				})
			}
		}
		score := 100 - lost
		if score < 0 {
			score = 0
		}
		s := score
		id.Score = &s
		id.Band = bandFor(s)
		if !kind.human && r.Float64() < 0.8 {
			id.Reach = &Reach{Resources: 3 + int(r.ExpFloat64()*60), CrossAccount: map[bool]int{true: 1 + r.Intn(3), false: 0}[r.Float64() < 0.15], Secrets: r.Float64() < 0.3}
		}
		scores = append(scores, s)
		acctScores[a.id] = append(acctScores[a.id], s)
		if kind.human {
			humanScores = append(humanScores, s)
		} else {
			nhiScores = append(nhiScores, s)
		}
		sort.SliceStable(id.Checks, func(x, y int) bool { return sevRank(id.Checks[x].Severity) < sevRank(id.Checks[y].Severity) })
		rep.Population = append(rep.Population, id)
		if len(id.Checks) > 0 {
			rep.Identities = append(rep.Identities, id)
			for _, c := range id.Checks {
				rep.BySeverity[c.Severity]++
				rep.CheckCount++
			}
		}
	}
	_ = common
	_ = bySev
	rep.ScoredCount = len(scores)
	avg := mean(scores)
	rep.AverageScore = &avg
	change := 4.6
	rep.Change30d = &change
	rep.FleetScore = true
	rep.FailingCount = len(rep.Identities)
	rep.AccountsCovered = len(accounts)
	bands := map[string]int{}
	for _, s := range scores {
		bands[bandFor(s)]++
	}
	for _, b := range Bands {
		rep.Bands = append(rep.Bands, BandCount{Band: b, Count: bands[b]})
	}
	h, n := mean(humanScores), mean(nhiScores)
	rep.Classes = []ClassRow{{Human: false, Scored: len(nhiScores), Average: &n}, {Human: true, Scored: len(humanScores), Average: &h}}
	for _, a := range accounts {
		m := mean(acctScores[a.id])
		rep.Accounts = append(rep.Accounts, AccountRow{ID: a.id, Name: a.name, Scored: len(acctScores[a.id]), Average: &m, BySev: map[string]int{}})
	}
	sort.SliceStable(rep.Population, func(i, j int) bool { return *rep.Population[i].Score < *rep.Population[j].Score })
	// 30 days of daily scores ending at today's average, with a dip.
	for d := 29; d >= 0; d-- {
		v := avg - change*float64(d)/29 + 1.6*float64((d*7)%5-2)/2
		if d == 12 {
			v -= 3.5
		}
		rep.Trend = append(rep.Trend, TrendPoint{Day: now.AddDate(0, 0, -d).Truncate(24 * time.Hour), Score: round1(v)})
	}
	rep.Trend[len(rep.Trend)-1].Score = round1(avg)
	summarise(rep)

	// What changed: this 30-day period against the one before.
	hist := &History{Days: 30}
	hist.Current = PeriodStats{Start: now.AddDate(0, 0, -30), End: now,
		NewBySev: map[string]int{"critical": 9, "high": 96, "medium": 141, "low": 22}, ResolvedBySev: map[string]int{"critical": 12, "high": 131, "medium": 118, "low": 15},
		MedianDays: map[string]float64{"critical": 9.5, "high": 24, "medium": 61, "low": 88}, FixedInSLA: map[string]int{"critical": 10, "high": 102, "medium": 97, "low": 15}, Accepted: 4}
	hist.Previous = PeriodStats{Start: now.AddDate(0, 0, -60), End: now.AddDate(0, 0, -30),
		NewBySev: map[string]int{"critical": 14, "high": 122, "medium": 160, "low": 30}, ResolvedBySev: map[string]int{"critical": 8, "high": 87, "medium": 95, "low": 11},
		MedianDays: map[string]float64{"critical": 17, "high": 36, "medium": 74, "low": 102}, FixedInSLA: map[string]int{"critical": 4, "high": 51, "medium": 71, "low": 11}, Accepted: 2}
	for _, p := range []*PeriodStats{&hist.Current, &hist.Previous} {
		for _, sv := range Severities {
			p.New += p.NewBySev[sv]
			p.Resolved += p.ResolvedBySev[sv]
		}
	}
	rep.History = hist
	until := func(d int) *time.Time { t := now.AddDate(0, 0, d); return &t }
	ago := func(d int) *time.Time { t := now.AddDate(0, 0, -d); return &t }
	rep.Exceptions = []Exception{
		{"Cross-acct trust without ExternalId", "high", "role-vendor-backup-sync", "bimasugam-shared-services", "Vendor does not support ExternalId; compensating control: SCP limits the role to the backup bucket.", "Identity & Access", ago(41), until(49)},
		{"Wildcard resource (Resource:*)", "medium", "lambda-metrics-export", "bimasugam-data-platform", "CloudWatch PutMetricData does not support resource-level permissions.", "Data Platform", ago(73), nil},
		{"Multiple active access keys", "medium", "svc-jenkins-legacy", "bimasugam-core-prod", "Key rotation in progress; second key retired after the December release.", "DevOps", ago(12), until(18)},
		{"Unused IAM role", "low", "role-dr-failover", "bimasugam-core-prod", "Disaster-recovery role; used only during failover tests.", "Platform Engineering", ago(120), until(60)},
		{"Off-hours activity", "low", "ecs-task-reconcile-job", "bimasugam-payments-prod", "Nightly reconciliation runs at 02:00 UTC by design.", "Payments SRE", ago(9), nil},
	}
	return rep
}

func foundText(ru sampleRule, name, acct string) string {
	switch ru.Area {
	case "least_privilege":
		return fmt.Sprintf("%s is allowed %s; 0 of the granted actions were used in the last 90 days.", name, []string{"iam:*", "s3:* on *", "AdministratorAccess", "kms:* on *"}[len(name)%4])
	case "credential_hygiene":
		return fmt.Sprintf("Access key AKIA%s…%s is %d days old and was last rotated never.", acct[:4], name[len(name)-2:], 120+len(name)*3)
	case "trust_access":
		return fmt.Sprintf("Trust policy of %s allows arn:aws:iam::%s:root without a condition.", name, acct)
	case "escalation":
		return fmt.Sprintf("%s can pass a role with broader permissions (iam:PassRole on *).", name)
	case "exposure":
		return fmt.Sprintf("%s runs on a resource reachable from 0.0.0.0/0.", name)
	}
	return fmt.Sprintf("%s: %s.", name, ru.Name)
}

func pickN(r *rand.Rand, rules []sampleRule, n int) []sampleRule {
	var crit, rest []sampleRule
	for _, ru := range rules {
		if ru.Severity == "critical" {
			crit = append(crit, ru)
		} else {
			rest = append(rest, ru)
		}
	}
	r.Shuffle(len(crit), func(i, j int) { crit[i], crit[j] = crit[j], crit[i] })
	r.Shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })
	out := append([]sampleRule{}, crit[:3]...)
	out = append(out, rest[:n-3]...)
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func weightedIndex(r *rand.Rand, w []float64) int {
	x := r.Float64()
	for i, v := range w {
		if x < v {
			return i
		}
		x -= v
	}
	return len(w) - 1
}

func mean(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range v {
		s += x
	}
	return round1(s / float64(len(v)))
}

// TestSamples renders every design from the sample report. With
// REPORT_SAMPLES_DIR set it also writes the files there.
func TestSamples(t *testing.T) {
	rep := sampleReport(t, 320)
	out := os.Getenv("REPORT_SAMPLES_DIR")
	designs := []struct {
		file  string
		write func(io.Writer, *PostureReport) error
	}{
		{"A-executive-brief.pdf", WriteBriefPDF},
		{"B-audit-dossier.pdf", WriteDossierPDF},
		{"C-remediation-plan.pdf", WritePlanPDF},
		{"A-executive-workbook.xlsx", WriteExecutiveXLSX},
		{"B-audit-register.xlsx", WriteRegisterXLSX},
		{"C-analyst-model.xlsx", WriteAnalystXLSX},
	}
	t.Logf("avg %.1f, %d of %d failing, findings %v, bands %v", *rep.AverageScore, rep.FailingCount, rep.ScoredCount, rep.BySeverity, rep.Bands)
	for _, d := range designs {
		var buf bytes.Buffer
		if err := d.write(&buf, rep); err != nil {
			t.Fatalf("%s: %v", d.file, err)
		}
		t.Logf("%s: %d KB", d.file, buf.Len()/1024)
		if out != "" {
			if err := os.WriteFile(filepath.Join(out, d.file), buf.Bytes(), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
}

// TestDesignsLarge renders every design for a large estate and an empty one.
func TestDesignsLarge(t *testing.T) {
	designs := map[string]func(io.Writer, *PostureReport) error{
		"brief": WriteBriefPDF, "dossier": WriteDossierPDF, "plan": WritePlanPDF,
		"exec.xlsx": WriteExecutiveXLSX, "register.xlsx": WriteRegisterXLSX, "analyst.xlsx": WriteAnalystXLSX,
	}
	for _, size := range []int{6500, 0} {
		rep := sampleReport(t, size)
		for name, write := range designs {
			start := time.Now()
			var buf bytes.Buffer
			if err := write(&buf, rep); err != nil {
				t.Fatalf("%d identities, %s: %v", size, name, err)
			}
			t.Logf("%d identities, %s: %d KB in %s", size, name, buf.Len()/1024, time.Since(start).Round(time.Millisecond))
		}
	}
}
