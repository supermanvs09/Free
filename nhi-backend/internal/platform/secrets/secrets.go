// Package secrets resolves secret references stored in remediation_integrations.secret_ref.
// The database never holds a secret, only a pointer:
//
//	env:NAME            environment variable of the remediator process
//	file:/path/to/file  file (Kubernetes / Docker secret mounts)
//	aws-sm:<id or arn>  AWS Secrets Manager of the platform account
//	                    (optional JSON key: aws-sm:<id>#<key>)
package secrets

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
)

type Resolver struct{ region string }

func New(region string) *Resolver { return &Resolver{region: region} }

func (r *Resolver) Get(ctx context.Context, ref string) (string, error) {
	scheme, val, ok := strings.Cut(ref, ":")
	if !ok || val == "" {
		return "", fmt.Errorf("secret_ref %q must look like env:NAME, file:/path or aws-sm:id", ref)
	}
	switch scheme {
	case "env":
		v := os.Getenv(val)
		if v == "" {
			return "", fmt.Errorf("environment variable %s is empty", val)
		}
		return v, nil
	case "file":
		b, err := os.ReadFile(val)
		if err != nil {
			return "", fmt.Errorf("read secret file: %w", err)
		}
		return strings.TrimSpace(string(b)), nil
	case "aws-sm":
		id, key, _ := strings.Cut(val, "#")
		cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(r.region))
		if err != nil {
			return "", err
		}
		out, err := secretsmanager.NewFromConfig(cfg).GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{SecretId: &id})
		if err != nil {
			return "", fmt.Errorf("read secret %s: %w", id, err)
		}
		s := ""
		if out.SecretString != nil {
			s = *out.SecretString
		}
		if key == "" {
			return s, nil
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			return "", fmt.Errorf("secret %s is not JSON", id)
		}
		v, _ := m[key].(string)
		if v == "" {
			return "", fmt.Errorf("key %q not found in secret %s", key, id)
		}
		return v, nil
	}
	return "", fmt.Errorf("unknown secret scheme %q", scheme)
}
