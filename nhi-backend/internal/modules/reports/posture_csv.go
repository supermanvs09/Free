package reports

import (
	"encoding/csv"
	"io"
	"strconv"
	"strings"
)

// WritePostureCSV writes one row per failing check: flat, so it can be
// sorted and filtered in a spreadsheet. Optional columns follow the options.
func WritePostureCSV(w io.Writer, rep *PostureReport) error {
	cw := csv.NewWriter(w)
	o := rep.Options
	header := []string{"Identity", "Type", "Human or non-human", "Account", "Score", "Band"}
	if o.IncludeSev {
		header = append(header, "Severity")
	}
	header = append(header, checkColumns...)
	if o.IncludeInfo {
		header = append(header, "What the check looks at")
	}
	if o.IncludeFix {
		header = append(header, "How to fix")
	}
	header = append(header, "Area", "Failing since", "ARN")
	if err := cw.Write(header); err != nil {
		return err
	}
	for _, id := range rep.Identities {
		kind := "Non-human"
		if id.Human {
			kind = "Human"
		}
		for _, c := range id.Checks {
			row := []string{safeCell(id.Name), safeCell(typeLabel(id.Type)), kind, safeCell(accountLabel(id)), scoreText(id.Score), bandLabel(id.Band)}
			if o.IncludeSev {
				row = append(row, SeverityLabel(c.Severity))
			}
			row = append(row, safeCell(c.Check), safeCell(c.RuleID), safeCell(c.Title), safeCell(c.Found))
			if o.IncludeInfo {
				row = append(row, safeCell(c.About))
			}
			if o.IncludeFix {
				row = append(row, safeCell(c.Fix))
			}
			since := ""
			if c.FailingSince != nil {
				since = c.FailingSince.UTC().Format("2006-01-02")
			}
			row = append(row, AreaLabel(c.Area), since, safeCell(id.ARN))
			if err := cw.Write(row); err != nil {
				return err
			}
		}
	}
	cw.Flush()
	return cw.Error()
}

// checkColumns name the check twice: the check itself, the same on every
// identity so it can be grouped and filtered on, and the problem as found on
// this identity.
var checkColumns = []string{"Check", "Check ID", "Problem on this identity", "What was found"}

// safeCell stops spreadsheet formula injection: a cell that starts with
// =, +, -, @, tab or carriage return is prefixed with a quote.
func safeCell(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func scoreText(v *float64) string {
	if v == nil {
		return ""
	}
	return strconv.Itoa(int(*v + 0.5))
}

func bandLabel(b string) string {
	if b == "" {
		return ""
	}
	return strings.ToUpper(b[:1]) + strings.ToLower(b[1:])
}

func accountLabel(id ReportIdentity) string {
	switch {
	case id.Account != "" && id.AccountID != "" && id.Account != id.AccountID:
		return id.Account + " (" + id.AccountID + ")"
	case id.AccountID != "":
		return id.AccountID
	}
	return id.Account
}

// typeLabel turns stored identity types into words: ec2_instance -> EC2 instance.
func typeLabel(t string) string {
	known := map[string]string{
		"ec2_instance": "EC2 instance", "lambda_function": "Lambda function", "ecs_task": "ECS task", "batch_job": "Batch job",
		"IAM_USER": "IAM user", "iam_user": "IAM user", "iam_role": "IAM role", "IAM_ROLE": "IAM role", "eks_pod": "EKS pod",
	}
	if v, ok := known[t]; ok {
		return v
	}
	s := strings.TrimSpace(strings.ReplaceAll(t, "_", " "))
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + strings.ToLower(s[1:])
}
