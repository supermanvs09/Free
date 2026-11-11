// Package config reads the on-premises console's settings from the
// environment. Everything has a safe default except the three secrets, which
// must be set: the console refuses to start without them.
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr          string        // ONPREM_ADDR, default :8090
	DatabaseURL   string        // ONPREM_DATABASE_URL, postgres://...
	JWTSecret     []byte        // ONPREM_JWT_SECRET, at least 32 characters
	EncryptionKey []byte        // ONPREM_ENCRYPTION_KEY, base64 of 32 bytes (AES-256)
	SessionTTL    time.Duration // ONPREM_SESSION_HOURS, default 8
	PublicURL     string        // ONPREM_PUBLIC_URL: how GitHub, Bitbucket and Jenkins reach this console (webhook URLs)
	AdminEmail    string        // ONPREM_ADMIN_EMAIL: first admin, created once when there is no user
	AdminPassword string        // ONPREM_ADMIN_PASSWORD
	AllowedOrigin string        // ONPREM_ALLOWED_ORIGIN: console origin when served from another host (CORS); empty = same origin only
	BusinessStart int           // ONPREM_BUSINESS_HOURS start hour (default 8), for unusual-build flags
	BusinessEnd   int           // end hour (default 19)
	BusinessTZ    *time.Location
	MaxFileBytes  int64 // ONPREM_SCAN_MAX_FILE_KB, default 1024
	MaxRepoFiles  int   // ONPREM_SCAN_MAX_FILES_PER_REPO, default 5000
}

func Load() (*Config, error) {
	c := &Config{
		Addr:          env("ONPREM_ADDR", ":8090"),
		DatabaseURL:   env("ONPREM_DATABASE_URL", ""),
		PublicURL:     strings.TrimRight(env("ONPREM_PUBLIC_URL", ""), "/"),
		AdminEmail:    strings.ToLower(strings.TrimSpace(env("ONPREM_ADMIN_EMAIL", ""))),
		AdminPassword: env("ONPREM_ADMIN_PASSWORD", ""),
		AllowedOrigin: env("ONPREM_ALLOWED_ORIGIN", ""),
		BusinessStart: 8,
		BusinessEnd:   19,
		BusinessTZ:    time.UTC,
		MaxFileBytes:  int64(envInt("ONPREM_SCAN_MAX_FILE_KB", 1024)) * 1024,
		MaxRepoFiles:  envInt("ONPREM_SCAN_MAX_FILES_PER_REPO", 5000),
		SessionTTL:    time.Duration(envInt("ONPREM_SESSION_HOURS", 8)) * time.Hour,
	}
	var problems []string
	if c.DatabaseURL == "" {
		problems = append(problems, "ONPREM_DATABASE_URL is required")
	}
	if s := env("ONPREM_JWT_SECRET", ""); len(s) < 32 {
		problems = append(problems, "ONPREM_JWT_SECRET must be at least 32 characters")
	} else {
		c.JWTSecret = []byte(s)
	}
	if key, err := base64.StdEncoding.DecodeString(env("ONPREM_ENCRYPTION_KEY", "")); err != nil || len(key) != 32 {
		problems = append(problems, "ONPREM_ENCRYPTION_KEY must be base64 of 32 random bytes (openssl rand -base64 32)")
	} else {
		c.EncryptionKey = key
	}
	if h := env("ONPREM_BUSINESS_HOURS", ""); h != "" {
		var a, b int
		if _, err := fmt.Sscanf(h, "%d-%d", &a, &b); err != nil || a < 0 || b > 24 || a >= b {
			problems = append(problems, "ONPREM_BUSINESS_HOURS must look like 8-19")
		} else {
			c.BusinessStart, c.BusinessEnd = a, b
		}
	}
	if tz := env("ONPREM_TIMEZONE", ""); tz != "" {
		loc, err := time.LoadLocation(tz)
		if err != nil {
			problems = append(problems, "ONPREM_TIMEZONE is not a known time zone (for example Asia/Kolkata)")
		} else {
			c.BusinessTZ = loc
		}
	}
	if len(problems) > 0 {
		return nil, errors.New("config: " + strings.Join(problems, "; "))
	}
	return c, nil
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func envInt(key string, def int) int {
	if n, err := strconv.Atoi(env(key, "")); err == nil && n > 0 {
		return n
	}
	return def
}
