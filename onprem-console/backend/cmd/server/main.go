// The on-premises console: GitHub, Bitbucket Data Center and Jenkins.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"onprem-console/internal/api"
	"onprem-console/internal/auth"
	"onprem-console/internal/config"
	"onprem-console/internal/secretbox"
	"onprem-console/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	if err := st.Migrate(ctx); err != nil {
		log.Fatal(err)
	}
	box, err := secretbox.New(cfg.EncryptionKey)
	if err != nil {
		log.Fatal(err)
	}
	a := auth.NewService(st, cfg.JWTSecret, cfg.SessionTTL)
	if created, err := a.Bootstrap(ctx, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Fatal(err)
	} else if created {
		log.Printf("created the first admin, %s", cfg.AdminEmail)
	}
	srv := api.New(cfg, st, box, a)
	if err := srv.ResetInterrupted(ctx); err != nil {
		log.Fatal(err)
	}
	if cfg.PublicURL == "" {
		log.Print("ONPREM_PUBLIC_URL is not set: webhook addresses are shown relative to the console's own address")
	}
	sched, stopSched := context.WithCancel(ctx)
	defer stopSched()
	go srv.ScheduleScans(sched)
	hs := &http.Server{Addr: cfg.Addr, Handler: srv.Router(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second, WriteTimeout: 90 * time.Second}
	go func() {
		log.Printf("on-premises console API listening on %s", cfg.Addr)
		if err := hs.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shut, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	_ = hs.Shutdown(shut)
	st.DB.Close()
}
