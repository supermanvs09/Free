package config

import (
	"fmt"
	"strings"
	"time"
)

// CorrelationConfig holds the settings of the correlation engine (blast radius,
// access graph, rule catalogue and its run queue). Database, server, JWT,
// logging and ClickHouse are the backend's own settings and are not repeated here.
//
// It is read only from the environment (and .env), like Remediation:
//
//	NHI_CORRELATION_ENABLED        default true; false = no correlation routes, no worker, other keys ignored
//	NHI_CORRELATION_POLL_INTERVAL  default 5s (1s to 1h); how often the run queue of every tenant is checked
type CorrelationConfig struct {
	Enabled      bool
	PollInterval time.Duration
}

// Correlation reads the correlation settings from the environment. With
// NHI_CORRELATION_ENABLED=false nothing else is read or checked, so a wrong
// correlation key can never stop the rest of the backend from starting.
func Correlation() (CorrelationConfig, error) {
	e := &remEnv{}
	if !e.bool("NHI_CORRELATION_ENABLED", true) {
		if len(e.errs) > 0 {
			return CorrelationConfig{}, fmt.Errorf("config: %s", strings.Join(e.errs, "; "))
		}
		return CorrelationConfig{}, nil
	}
	c := CorrelationConfig{
		Enabled:      true,
		PollInterval: e.dur("NHI_CORRELATION_POLL_INTERVAL", 5*time.Second),
	}
	if c.PollInterval < time.Second || c.PollInterval > time.Hour {
		e.errs = append(e.errs, "NHI_CORRELATION_POLL_INTERVAL must be between 1s and 1h")
	}
	if len(e.errs) > 0 {
		return CorrelationConfig{}, fmt.Errorf("config: %s", strings.Join(e.errs, "; "))
	}
	return c, nil
}
