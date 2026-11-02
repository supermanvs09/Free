package policydoc

import (
	"net/url"
	"strings"
	"testing"
)

func TestParseURLEncodedAndSingleStatement(t *testing.T) {
	raw := `{"Version":"2012-10-17","Statement":{"Effect":"Allow","Action":"s3:*","Resource":"*"}}`
	d, err := Parse(url.QueryEscape(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Statements) != 1 || Actions(d.Statements[0])[0] != "s3:*" {
		t.Fatalf("unexpected parse: %+v", d.Statements)
	}
}

func TestMatch(t *testing.T) {
	cases := []struct {
		p, v string
		want bool
	}{
		{"*", "s3:GetObject", true},
		{"s3:*", "s3:GetObject", true},
		{"s3:Get*", "s3:PutObject", false},
		{"S3:getobject", "s3:GetObject", true},
		{"ec2:Describe?nstances", "ec2:DescribeInstances", true},
		{"iam:*", "s3:GetObject", false},
	}
	for _, c := range cases {
		if got := Match(c.p, c.v); got != c.want {
			t.Errorf("Match(%q,%q)=%v want %v", c.p, c.v, got, c.want)
		}
	}
}

func TestScopeToUsage(t *testing.T) {
	d, _ := Parse(`{"Version":"2012-10-17","Statement":[
		{"Effect":"Allow","Action":"*","Resource":"*"},
		{"Effect":"Allow","Action":["s3:*"],"Resource":"arn:aws:s3:::b/*"},
		{"Effect":"Allow","Action":"kms:Decrypt","Resource":"*"},
		{"Effect":"Deny","Action":"iam:*","Resource":"*"}]}`)
	used := []string{"s3:GetObject", "s3:PutObject", "dynamodb:*"}
	got, manual := ScopeToUsage(d, used, false)
	if len(manual) != 0 {
		t.Fatalf("manual: %v", manual)
	}
	if len(got.Statements) != 4 {
		t.Fatalf("statements: %s", got.JSON())
	}
	first := Actions(got.Statements[0])
	if strings.Join(first, ",") != "dynamodb:*,s3:GetObject,s3:PutObject" {
		t.Fatalf("first statement actions: %v", first)
	}
	if strings.Join(Actions(got.Statements[1]), ",") != "s3:GetObject,s3:PutObject" {
		t.Fatalf("second statement actions: %v", Actions(got.Statements[1]))
	}
	if strings.Join(Actions(got.Statements[2]), ",") != "kms:Decrypt" {
		t.Fatalf("explicit action must be kept when pruneUnused=false")
	}
	pruned, _ := ScopeToUsage(d, used, true)
	if len(pruned.Statements) != 3 { // kms:Decrypt statement dropped
		t.Fatalf("pruned: %s", pruned.JSON())
	}
	// every used action must still be covered
	for _, u := range []string{"s3:GetObject", "s3:PutObject"} {
		if !Covered(u, got.AllowedActions()) {
			t.Errorf("%s lost", u)
		}
	}
}

func TestDiff(t *testing.T) {
	a, _ := Parse(`{"Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}`)
	b, _ := Parse(`{"Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"*"}]}`)
	d := Diff(a, b)
	if len(d) != 2 || d[0].Change != "removed" || d[1].Change != "added" {
		t.Fatalf("diff: %+v", d)
	}
	if len(Diff(a, a)) != 0 {
		t.Fatal("identical documents must not differ")
	}
}
