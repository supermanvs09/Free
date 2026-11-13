// Package payloadcrypt encrypts every API payload, both ways, on top of HTTPS
// when PAYLOAD_ENCRYPTION_ENABLED=true. Off (the default) it does nothing.
//
// Hybrid scheme, one fresh AES key per request:
//
//	browser: random AES-256 key K, RSA-OAEP-SHA256(K) with the server's public
//	         key -> header X-Enc-Key (base64). A body is sent as
//	         {"iv": b64(12 bytes), "data": b64(AES-256-GCM(json)), "ts": unix ms}
//	         (the spec's {"key", "iv", "data"} form, key in the body, is
//	         accepted too). AAD = "<METHOD> <path> <ts>": a body cannot be
//	         replayed onto another endpoint or after MaxSkew.
//	server:  decrypts, the handler sees plain JSON as before; the response is
//	         sealed with the same K: {"iv", "data", "ct"} (ct = the original
//	         Content-Type), AAD = "response <METHOD> <path>", header
//	         X-Payload-Encrypted: 1.
//
// AES-GCM and RSA-OAEP only: AES-CBC without a MAC is malleable and open to
// padding-oracle attacks, and RSA PKCS#1 v1.5 encryption to Bleichenbacher's.
package payloadcrypt

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	HeaderKey       = "X-Enc-Key"
	HeaderEncrypted = "X-Payload-Encrypted"
	Alg             = "RSA-OAEP-256+A256GCM"
	MaxSkew         = 5 * time.Minute
	maxBody         = 8 << 20
)

// Config is read once at start. Exempt holds path prefixes left in the clear:
// health checks, the key itself, and callers that are not the console (the
// ISPM worker's API-key routes).
type Config struct {
	Enabled bool
	Key     *rsa.PrivateKey
	Exempt  []string
}

var defaultExempt = []string{"/api/v1/health", "/api/v1/auth/payload-key", "/api/v1/ispm-scans"}

// FromEnv reads PAYLOAD_ENCRYPTION_ENABLED, PAYLOAD_RSA_PRIVATE_KEY (the bare
// base64 key, or PEM with "\n" escapes) or PAYLOAD_RSA_PRIVATE_KEY_FILE, and
// PAYLOAD_ENCRYPTION_EXEMPT (comma-separated extra path prefixes). Enabled
// without a usable key is an error: the service must not start believing it
// encrypts when it does not.
func FromEnv() (Config, error) {
	cfg := Config{Exempt: append([]string(nil), defaultExempt...)}
	on, _ := strconv.ParseBool(strings.TrimSpace(os.Getenv("PAYLOAD_ENCRYPTION_ENABLED")))
	if !on {
		return cfg, nil
	}
	for _, p := range strings.Split(os.Getenv("PAYLOAD_ENCRYPTION_EXEMPT"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			cfg.Exempt = append(cfg.Exempt, p)
		}
	}
	raw := strings.ReplaceAll(os.Getenv("PAYLOAD_RSA_PRIVATE_KEY"), `\n`, "\n")
	if f := strings.TrimSpace(os.Getenv("PAYLOAD_RSA_PRIVATE_KEY_FILE")); raw == "" && f != "" {
		b, err := os.ReadFile(f)
		if err != nil {
			return cfg, fmt.Errorf("payloadcrypt: read key file: %w", err)
		}
		raw = string(b)
	}
	key, err := ParsePrivateKey(raw)
	if err != nil {
		return cfg, err
	}
	cfg.Enabled, cfg.Key = true, key
	return cfg, nil
}

// ParsePrivateKey accepts PKCS#8 ("PRIVATE KEY") or PKCS#1 ("RSA PRIVATE KEY"),
// 2048 bits or more, as PEM or as the bare base64 key (one line, no
// BEGIN/END lines).
func ParsePrivateKey(text string) (*rsa.PrivateKey, error) {
	text = strings.TrimSpace(text)
	var der []byte
	if block, _ := pem.Decode([]byte(text)); block != nil {
		der = block.Bytes
	} else if b, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(text), "")); err == nil {
		der = b
	} else {
		return nil, errors.New("payloadcrypt: PAYLOAD_RSA_PRIVATE_KEY is neither a PEM key nor a base64 key")
	}
	var key *rsa.PrivateKey
	if k, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("payloadcrypt: the private key is not RSA")
		}
		key = rk
	} else if rk, err2 := x509.ParsePKCS1PrivateKey(der); err2 == nil {
		key = rk
	} else {
		return nil, fmt.Errorf("payloadcrypt: parse private key: %w", err)
	}
	if key.N.BitLen() < 2048 {
		return nil, errors.New("payloadcrypt: RSA key must be at least 2048 bits")
	}
	return key, nil
}

// PublicKeyHandler serves GET /api/v1/auth/payload-key: whether payloads must
// be encrypted and, if so, the public key (base64 SPKI DER, what Web Crypto
// imports as "spki"). The console asks once at start, so turning the setting
// on or off needs no new frontend build.
func PublicKeyHandler(cfg Config) http.HandlerFunc {
	data := map[string]any{"enabled": cfg.Enabled}
	if cfg.Enabled {
		der, _ := x509.MarshalPKIXPublicKey(&cfg.Key.PublicKey)
		data["alg"] = Alg
		data["key"] = base64.StdEncoding.EncodeToString(der)
		// The paths left in the clear, so the console sends them plain too:
		// one setting covers an API served by another service (genome, say).
		data["exempt"] = cfg.Exempt
	}
	body, _ := json.Marshal(map[string]any{"success": true, "message": "Payload encryption", "data": data})
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(body)
	}
}

type envelope struct {
	Key  string `json:"key,omitempty"`
	IV   string `json:"iv"`
	Data string `json:"data"`
	TS   int64  `json:"ts,omitempty"`
	CT   string `json:"ct,omitempty"`
}

// Middleware decrypts request bodies and encrypts responses. Requests to a
// non-exempt /api path without an encrypted key are refused (400), so a
// client cannot quietly fall back to plain text while the setting is on.
func Middleware(cfg Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if !cfg.Enabled {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions || !strings.HasPrefix(r.URL.Path, "/api/") || exempt(cfg.Exempt, r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}
			gcm, err := requestCipher(cfg.Key, r)
			if err != nil {
				refuse(w, err.Error())
				return
			}
			// A cached 304 body would be sealed with an earlier request's key.
			r.Header.Del("If-None-Match")
			r.Header.Del("If-Modified-Since")

			buf := &sealWriter{header: http.Header{}, status: http.StatusOK}
			next.ServeHTTP(buf, r)
			buf.flushTo(w, gcm, "response "+r.Method+" "+r.URL.Path)
		})
	}
}

func exempt(prefixes []string, path string) bool {
	for _, p := range prefixes {
		if path == p || strings.HasPrefix(path, strings.TrimRight(p, "/")+"/") {
			return true
		}
	}
	return false
}

// requestCipher unwraps the request's AES key and, when there is a body,
// replaces it with the decrypted JSON.
func requestCipher(key *rsa.PrivateKey, r *http.Request) (cipher.AEAD, error) {
	var env envelope
	var raw []byte
	if r.Body != nil && r.Body != http.NoBody {
		b, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
		_ = r.Body.Close()
		if err != nil || len(b) > maxBody {
			return nil, errors.New("the request body is too large or unreadable")
		}
		raw = bytes.TrimSpace(b)
		// A client library that sends JSON null for "no body" (axios does)
		// has no body to encrypt.
		if string(raw) == "null" {
			raw = nil
		}
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &env); err != nil || env.IV == "" || env.Data == "" {
			return nil, errors.New("the request body must be encrypted")
		}
	}
	wrapped := r.Header.Get(HeaderKey)
	if wrapped == "" {
		wrapped = env.Key
	}
	if wrapped == "" {
		return nil, errors.New("this request must be encrypted (missing " + HeaderKey + ")")
	}
	ek, err := base64.StdEncoding.DecodeString(wrapped)
	if err != nil {
		return nil, errors.New("the encrypted key is not valid base64")
	}
	aesKey, err := rsa.DecryptOAEP(sha256.New(), nil, key, ek, nil)
	if err != nil || len(aesKey) != 32 {
		return nil, errors.New("the encrypted key could not be opened")
	}
	block, _ := aes.NewCipher(aesKey)
	gcm, _ := cipher.NewGCM(block)

	if len(raw) == 0 {
		r.Body, r.ContentLength = http.NoBody, 0
		return gcm, nil
	}
	if env.TS == 0 {
		return nil, errors.New("the encrypted body has no timestamp")
	}
	if d := time.Since(time.UnixMilli(env.TS)); d > MaxSkew || d < -MaxSkew {
		return nil, errors.New("the encrypted body is too old; check the device clock and try again")
	}
	iv, err1 := base64.StdEncoding.DecodeString(env.IV)
	ct, err2 := base64.StdEncoding.DecodeString(env.Data)
	if err1 != nil || err2 != nil || len(iv) != gcm.NonceSize() {
		return nil, errors.New("the encrypted body is malformed")
	}
	aad := r.Method + " " + r.URL.Path + " " + strconv.FormatInt(env.TS, 10)
	plain, err := gcm.Open(nil, iv, ct, []byte(aad))
	if err != nil {
		return nil, errors.New("the encrypted body could not be opened")
	}
	r.Body = io.NopCloser(bytes.NewReader(plain))
	r.ContentLength = int64(len(plain))
	r.Header.Set("Content-Type", "application/json")
	return gcm, nil
}

func refuse(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "message": msg, "error": "PAYLOAD_ENCRYPTION_REQUIRED"})
}

// sealWriter holds the handler's response so it can be sealed as a whole.
type sealWriter struct {
	header http.Header
	status int
	wrote  bool
	body   bytes.Buffer
}

func (s *sealWriter) Header() http.Header { return s.header }
func (s *sealWriter) WriteHeader(code int) {
	if !s.wrote {
		s.status, s.wrote = code, true
	}
}
func (s *sealWriter) Write(b []byte) (int, error) {
	s.wrote = true
	return s.body.Write(b)
}

func (s *sealWriter) flushTo(w http.ResponseWriter, gcm cipher.AEAD, aad string) {
	for k, v := range s.header {
		w.Header()[k] = v
	}
	if s.body.Len() == 0 {
		w.WriteHeader(s.status)
		return
	}
	iv := make([]byte, gcm.NonceSize())
	_, _ = rand.Read(iv)
	out, _ := json.Marshal(envelope{
		IV:   base64.StdEncoding.EncodeToString(iv),
		Data: base64.StdEncoding.EncodeToString(gcm.Seal(nil, iv, s.body.Bytes(), []byte(aad))),
		CT:   s.header.Get("Content-Type"),
	})
	h := w.Header()
	h.Del("Content-Length")
	h.Del("ETag")
	h.Set("Content-Type", "application/json")
	h.Set("Cache-Control", "no-store")
	h.Set(HeaderEncrypted, "1")
	w.WriteHeader(s.status)
	_, _ = w.Write(out)
}
