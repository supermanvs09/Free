// Command tenant-onboarding is a small standalone service for operators: one
// page where a company is registered and its first user is created. It talks to
// the platform's Postgres directly and shares no code with the API server.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// databaseURL is DATABASE_URL, or one built from the same DB_* variables the
// API server uses, so both services can share one env file.
func databaseURL() string {
	if v := strings.TrimSpace(os.Getenv("DATABASE_URL")); v != "" {
		return v
	}
	host := env("DB_HOST", "")
	if host == "" {
		return ""
	}
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(env("DB_USER", "postgres"), os.Getenv("DB_PASSWORD")),
		Host:     net.JoinHostPort(host, env("DB_PORT", "5432")),
		Path:     "/" + env("DB_NAME", "nhi_db"),
		RawQuery: "sslmode=" + env("DB_SSLMODE", "require"),
	}
	return u.String()
}

// describeSource says which database and schema a connection string reads,
// without the user or password.
func describeSource(dsn, schema string) string {
	u, err := url.Parse(dsn)
	if err != nil || u.Host == "" {
		return "schema " + schema
	}
	return strings.TrimPrefix(u.Path, "/") + " on " + u.Host + ", schema " + schema
}

func envBool(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "create-admin":
			createAdmin()
		default:
			fmt.Fprintln(os.Stderr, "usage: tenant-onboarding [create-admin [username]]\n(with no argument it starts the service)")
			os.Exit(2)
		}
		return
	}
	serve()
}

func serve() {
	envPath, envSet, envErr := loadEnvFile()
	if envErr != nil {
		log.Fatalf("settings file: %v", envErr)
	}
	if envPath != "" {
		log.Printf("settings loaded from %s (%d values; anything already set in the environment wins)", envPath, envSet)
	}
	dsn := databaseURL()
	if dsn == "" {
		log.Fatal("set DATABASE_URL, or DB_HOST with DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and DB_SSLMODE")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	db.SetMaxOpenConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("database is not reachable: %v", err)
	}
	cancel()

	auth := NewAuth(db, env("GLOBAL_SCHEMA", "nhi_global"))
	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	admins, err := auth.CountAdmins(pingCtx)
	pingCancel()
	if err != nil {
		log.Fatalf("sign-in: %v", err)
	}
	if admins == 0 {
		log.Print("note: no super admin exists yet, so nobody can sign in. Create one: run  go run . create-admin  (or the INSERT in sql/super_admin.sql)")
	} else {
		log.Printf("sign-in: %d active super admin(s) in the database", admins)
	}
	svc, err := NewService(db, env("GLOBAL_SCHEMA", "nhi_global"), env("DOMAIN_SUFFIX", "nhi.local"))
	if err != nil {
		log.Fatal(err)
	}
	svc.SetSource(describeSource(databaseURL(), env("GLOBAL_SCHEMA", "nhi_global")))
	srv := &http.Server{
		Addr:              ":" + env("PORT", "8090"),
		Handler:           NewHandler(svc, auth, db),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      4 * time.Minute, // a first build of the tables takes seconds, never minutes
		IdleTimeout:       2 * time.Minute,
	}
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop
		shut, done := context.WithTimeout(context.Background(), 30*time.Second)
		defer done()
		_ = srv.Shutdown(shut)
	}()
	log.Printf("tenant onboarding listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
