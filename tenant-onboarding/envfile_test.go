package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseEnvLine(t *testing.T) {
	good := map[string][2]string{
		`A=1`:                          {"A", "1"},
		`  A = 1  `:                    {"A", "1"},
		`export A=1`:                   {"A", "1"},
		`A="quoted value"`:             {"A", "quoted value"},
		`A='single # not a comment'`:   {"A", "single # not a comment"},
		`A="x" # trailing`:             {"A", "x"},
		`A=plain # trailing comment`:   {"A", "plain"},
		`A=has#hash`:                   {"A", "has#hash"},
		`A=a=b=c`:                      {"A", "a=b=c"},
		`A=`:                           {"A", ""},
		`A=$2a$12$abc.def/GHI`:         {"A", "$2a$12$abc.def/GHI"}, // a bcrypt hash must survive untouched
		`A='$2a$12$abc'`:               {"A", "$2a$12$abc"},
		"A=1\r":                        {"A", "1"},
		`DB_HOST=db.internal:5432`:     {"DB_HOST", "db.internal:5432"},
		`ADMIN_PASSWORD_HASH=b64:QUJD`: {"ADMIN_PASSWORD_HASH", "b64:QUJD"},
	}
	for in, want := range good {
		k, v, ok, err := parseEnvLine(in)
		if err != nil || !ok || k != want[0] || v != want[1] {
			t.Errorf("%q = %q %q %v %v, want %v", in, k, v, ok, err, want)
		}
	}
	for _, in := range []string{"", "   ", "# a comment", "  # indented comment"} {
		if _, _, ok, err := parseEnvLine(in); ok || err != nil {
			t.Errorf("%q should be skipped: %v %v", in, ok, err)
		}
	}
	for _, in := range []string{"no equals sign", "=novalue", `A="unclosed`, `A="x" junk`, "1BAD=x", "BA D=x", "A-B=x"} {
		if _, _, _, err := parseEnvLine(in); err == nil {
			t.Errorf("%q should be an error", in)
		}
	}
}

func TestLoadEnvFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "settings.env")
	body := "\uFEFF# comment\r\nTEST_ENVFILE_A=from-file\r\nexport TEST_ENVFILE_B=\"two words\"\nTEST_ENVFILE_C=real-wins-over-this\nTEST_ENVFILE_HASH=$2a$12$abcdefghijklmnopqrstuv\nTEST_ENVFILE_EMPTY_IN_ENV=filled\n"
	if err := os.WriteFile(file, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"TEST_ENVFILE_A", "TEST_ENVFILE_B", "TEST_ENVFILE_HASH"} {
		os.Unsetenv(k)
		defer os.Unsetenv(k)
	}
	t.Setenv("TEST_ENVFILE_C", "from-environment")
	t.Setenv("TEST_ENVFILE_EMPTY_IN_ENV", "") // set but empty: the file may fill it
	t.Setenv("ENV_FILE", file)

	path, n, err := loadEnvFile()
	if err != nil || path != file || n != 4 {
		t.Fatalf("load = %q %d %v", path, n, err)
	}
	for k, want := range map[string]string{
		"TEST_ENVFILE_A": "from-file", "TEST_ENVFILE_B": "two words", "TEST_ENVFILE_C": "from-environment",
		"TEST_ENVFILE_HASH": "$2a$12$abcdefghijklmnopqrstuv", "TEST_ENVFILE_EMPTY_IN_ENV": "filled",
	} {
		if got := os.Getenv(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
}

func TestLoadEnvFileProblems(t *testing.T) {
	dir := t.TempDir()
	// ENV_FILE naming a file that is not there is a mistake worth stopping for.
	t.Setenv("ENV_FILE", filepath.Join(dir, "missing.env"))
	if _, _, err := loadEnvFile(); err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("missing ENV_FILE: %v", err)
	}
	// A broken line names the line.
	bad := filepath.Join(dir, "bad.env")
	if err := os.WriteFile(bad, []byte("OK_ONE=1\nthis is not valid\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ENV_FILE", bad)
	defer os.Unsetenv("OK_ONE")
	if _, _, err := loadEnvFile(); err == nil || !strings.Contains(err.Error(), "line 2") {
		t.Errorf("bad line: %v", err)
	}
	// No ENV_FILE and no .env anywhere: not an error, nothing loaded.
	t.Setenv("ENV_FILE", "")
	wd, _ := os.Getwd()
	defer os.Chdir(wd)
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	os.Remove(filepath.Join(dir, ".env"))
	if p, n, err := loadEnvFile(); err != nil || n != 0 {
		t.Errorf("no file: %q %d %v", p, n, err)
	}
	// ".env" in the working folder is found without any setting.
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("TEST_ENVFILE_DEFAULT=yes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	os.Unsetenv("TEST_ENVFILE_DEFAULT")
	defer os.Unsetenv("TEST_ENVFILE_DEFAULT")
	if p, n, err := loadEnvFile(); err != nil || p != ".env" || n != 1 || os.Getenv("TEST_ENVFILE_DEFAULT") != "yes" {
		t.Errorf(".env: %q %d %v", p, n, err)
	}
}
