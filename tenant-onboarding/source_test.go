package main

import (
	"strings"
	"testing"
)

func TestDescribeSourceNamesTheDatabaseWithoutCredentials(t *testing.T) {
	got := describeSource("postgres://app:s3cret@db.example.com:5432/nhi_db?sslmode=require", "nhi_global")
	if got != "nhi_db on db.example.com:5432, schema nhi_global" {
		t.Fatalf("got %q", got)
	}
	if strings.Contains(got, "s3cret") || strings.Contains(got, "app") {
		t.Fatal("credentials leaked")
	}
	if got := describeSource("", "nhi_global"); got != "schema nhi_global" {
		t.Fatalf("no URL: %q", got)
	}
}
