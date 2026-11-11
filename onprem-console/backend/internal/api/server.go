// Package api is the on-premises console's HTTP API and webhook receivers.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"onprem-console/internal/auth"
	"onprem-console/internal/config"
	"onprem-console/internal/secretbox"
	"onprem-console/internal/store"
)

type Server struct {
	cfg  *config.Config
	st   *store.Store
	box  *secretbox.Box
	auth *auth.Service
}

func New(cfg *config.Config, st *store.Store, box *secretbox.Box, a *auth.Service) *Server {
	return &Server{cfg: cfg, st: st, box: box, auth: a}
}

func (s *Server) Router() http.Handler {
	r := mux.NewRouter()
	r.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := s.st.DB.Ping(r.Context()); err != nil {
			writeError(w, http.StatusServiceUnavailable, "database unreachable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}).Methods(http.MethodGet)

	// Webhooks authenticate by signature (or the secret in the Jenkins URL), not by session.
	r.HandleFunc("/webhooks/github", s.githubWebhook).Methods(http.MethodPost)
	r.HandleFunc("/webhooks/bitbucket", s.bitbucketWebhook).Methods(http.MethodPost)
	r.HandleFunc("/webhooks/jenkins/{token}", s.jenkinsWebhook).Methods(http.MethodPost)

	r.HandleFunc("/api/v1/auth/login", s.login).Methods(http.MethodPost)

	in := r.PathPrefix("/api/v1").Subrouter()
	in.Use(s.auth.Middleware)
	in.HandleFunc("/auth/me", s.me).Methods(http.MethodGet)
	in.HandleFunc("/auth/password", s.changePassword).Methods(http.MethodPost)
	in.HandleFunc("/overview", s.overview).Methods(http.MethodGet)
	in.HandleFunc("/connections", s.listConnections).Methods(http.MethodGet)
	in.HandleFunc("/connections/{kind}", s.getConnection).Methods(http.MethodGet)
	in.HandleFunc("/findings", s.listFindings).Methods(http.MethodGet)
	in.HandleFunc("/repositories", s.listRepositories).Methods(http.MethodGet)
	in.HandleFunc("/jenkins/credentials", s.listJenkinsCredentials).Methods(http.MethodGet)
	in.HandleFunc("/jenkins/builds", s.listJenkinsBuilds).Methods(http.MethodGet)
	in.HandleFunc("/deliveries", s.listDeliveries).Methods(http.MethodGet)

	// Admins and analysts: set up sources, scan, triage.
	manage := in.NewRoute().Subrouter()
	manage.Use(auth.Require(auth.RoleAdmin, auth.RoleAnalyst))
	manage.HandleFunc("/connections/{kind}", s.saveConnection).Methods(http.MethodPut)
	manage.HandleFunc("/connections/{kind}", s.deleteConnection).Methods(http.MethodDelete)
	manage.HandleFunc("/connections/{kind}/verify", s.verifyConnection).Methods(http.MethodPost)
	manage.HandleFunc("/connections/{kind}/webhook-secret", s.rotateWebhookSecret).Methods(http.MethodPost)
	manage.HandleFunc("/connections/{kind}/scan", s.startScanHandler).Methods(http.MethodPost)
	manage.HandleFunc("/findings/{id:[0-9]+}", s.updateFinding).Methods(http.MethodPatch)

	// Admins only: people and the audit trail.
	admin := in.NewRoute().Subrouter()
	admin.Use(auth.Require(auth.RoleAdmin))
	admin.HandleFunc("/users", s.listUsers).Methods(http.MethodGet)
	admin.HandleFunc("/users", s.createUser).Methods(http.MethodPost)
	admin.HandleFunc("/users/{id:[0-9]+}", s.updateUser).Methods(http.MethodPatch)
	admin.HandleFunc("/audit", s.listAudit).Methods(http.MethodGet)

	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { writeError(w, http.StatusNotFound, "not found") })
	r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	})
	return s.headers(r)
}

func (s *Server) headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		if o := s.cfg.AllowedOrigin; o != "" && r.Header.Get("Origin") == o {
			h.Set("Access-Control-Allow-Origin", o)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"message": msg}})
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("error: %v", err)
	writeError(w, http.StatusInternalServerError, "Something went wrong on the console's side. Try again.")
}

func readJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		if errors.Is(err, io.EOF) {
			return errors.New("the request body is empty")
		}
		return errors.New("the request body is not valid JSON for this call")
	}
	return nil
}

func queryInt(r *http.Request, name string, def, max int) int {
	n, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || n < 1 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func caller(r *http.Request) auth.Caller { return auth.FromContext(r.Context()) }

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}
