package main

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// loadEnvFile reads the settings file, so nothing has to be exported by hand.
//
// It looks for ENV_FILE if that is set, otherwise for ".env" in the folder the
// service is started from, then next to the program itself. A missing file is
// fine (the settings may come from the real environment, as in a container).
// A value already set in the real environment always wins over the file.
//
// Values are taken literally: no "$" expansion, so a bcrypt hash such as
// $2a$12$... works as it is.
func loadEnvFile() (path string, set int, err error) {
	candidates := []string{}
	if p := strings.TrimSpace(os.Getenv("ENV_FILE")); p != "" {
		candidates = append(candidates, p)
	} else {
		candidates = append(candidates, ".env")
		if exe, e := os.Executable(); e == nil {
			candidates = append(candidates, filepath.Join(filepath.Dir(exe), ".env"))
		}
	}
	for _, p := range candidates {
		f, e := os.Open(p)
		if errors.Is(e, fs.ErrNotExist) {
			if os.Getenv("ENV_FILE") != "" {
				return p, 0, fmt.Errorf("ENV_FILE points at %s, which does not exist", p)
			}
			continue
		}
		if e != nil {
			return p, 0, e
		}
		defer f.Close()
		n, e := applyEnv(f)
		return p, n, wrapPath(p, e)
	}
	return "", 0, nil
}

func wrapPath(p string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", p, err)
}

// applyEnv sets every KEY=VALUE of r that the real environment does not already
// set, and returns how many it set.
func applyEnv(r interface{ Read([]byte) (int, error) }) (int, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1<<20)
	set, line := 0, 0
	for sc.Scan() {
		line++
		text := sc.Text()
		if line == 1 {
			text = strings.TrimPrefix(text, "\uFEFF") // a byte-order mark from Windows editors
		}
		key, val, ok, err := parseEnvLine(text)
		if err != nil {
			return set, fmt.Errorf("line %d: %w", line, err)
		}
		if !ok || os.Getenv(key) != "" {
			continue
		}
		if err := os.Setenv(key, val); err != nil {
			return set, fmt.Errorf("line %d: %w", line, err)
		}
		set++
	}
	return set, sc.Err()
}

// parseEnvLine understands: blank lines, "# comments", KEY=value, export KEY=value,
// 'single' and "double" quoted values, and a trailing " # comment" after an
// unquoted value. ok is false for lines that set nothing.
func parseEnvLine(line string) (key, val string, ok bool, err error) {
	s := strings.TrimSpace(strings.TrimSuffix(line, "\r"))
	if s == "" || strings.HasPrefix(s, "#") {
		return "", "", false, nil
	}
	s = strings.TrimSpace(strings.TrimPrefix(s, "export "))
	k, v, found := strings.Cut(s, "=")
	k = strings.TrimSpace(k)
	if !found || k == "" {
		return "", "", false, errors.New("expected NAME=value")
	}
	for i, c := range k {
		letter := c == '_' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
		if !letter && !(i > 0 && c >= '0' && c <= '9') {
			return "", "", false, fmt.Errorf("%q is not a valid setting name", k)
		}
	}
	v = strings.TrimSpace(v)
	if len(v) >= 1 && (v[0] == '"' || v[0] == '\'') {
		q := v[0]
		end := strings.IndexByte(v[1:], q)
		if end < 0 {
			return "", "", false, fmt.Errorf("the quote in the value of %s is not closed", k)
		}
		rest := strings.TrimSpace(v[end+2:])
		if rest != "" && !strings.HasPrefix(rest, "#") {
			return "", "", false, fmt.Errorf("unexpected text after the closing quote of %s", k)
		}
		return k, v[1 : end+1], true, nil
	}
	if i := strings.Index(v, " #"); i >= 0 { // a comment must be set off by a space, so a # inside a value survives
		v = strings.TrimSpace(v[:i])
	}
	return k, v, true, nil
}
