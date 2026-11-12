package payloadcrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

var testKey, _ = rsa.GenerateKey(rand.Reader, 2048)

// client does what the console does: a fresh AES key per request, wrapped
// with RSA-OAEP-SHA256, the body sealed with AES-GCM.
type client struct {
	key []byte
	gcm cipher.AEAD
}

func newClient(t *testing.T) *client {
	t.Helper()
	k := make([]byte, 32)
	_, _ = rand.Read(k)
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	return &client{key: k, gcm: gcm}
}

func (c *client) request(t *testing.T, method, path, aadPath string, body any, ts time.Time) *http.Request {
	t.Helper()
	wrapped, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, &testKey.PublicKey, c.key, nil)
	if err != nil {
		t.Fatal(err)
	}
	var rdr io.Reader = http.NoBody
	if body != nil {
		plain, _ := json.Marshal(body)
		iv := make([]byte, 12)
		_, _ = rand.Read(iv)
		ms := ts.UnixMilli()
		aad := method + " " + aadPath + " " + strconv.FormatInt(ms, 10)
		env, _ := json.Marshal(envelope{IV: base64.StdEncoding.EncodeToString(iv), Data: base64.StdEncoding.EncodeToString(c.gcm.Seal(nil, iv, plain, []byte(aad))), TS: ms})
		rdr = strings.NewReader(string(env))
	}
	r := httptest.NewRequest(method, path, rdr)
	r.Header.Set(HeaderKey, base64.StdEncoding.EncodeToString(wrapped))
	return r
}

func (c *client) open(t *testing.T, method, path string, rec *httptest.ResponseRecorder) (string, string) {
	t.Helper()
	if rec.Header().Get(HeaderEncrypted) != "1" {
		t.Fatalf("response not encrypted: %d %s", rec.Code, rec.Body.String())
	}
	var env envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	iv, _ := base64.StdEncoding.DecodeString(env.IV)
	ct, _ := base64.StdEncoding.DecodeString(env.Data)
	plain, err := c.gcm.Open(nil, iv, ct, []byte("response "+method+" "+path))
	if err != nil {
		t.Fatal("open response:", err)
	}
	return string(plain), env.CT
}

// echo returns the decrypted body it was given, as a handler would see it.
var echo = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(`{"got":` + string(append([]byte(`"`), append(b, '"')...)) + `}`))
})

func on() Config { return Config{Enabled: true, Key: testKey, Exempt: defaultExempt} }

func TestRoundTrip(t *testing.T) {
	c := newClient(t)
	rec := httptest.NewRecorder()
	Middleware(on())(echo).ServeHTTP(rec, c.request(t, "POST", "/api/v1/users", "/api/v1/users", map[string]string{"email": "a@b.c"}, time.Now()))
	plain, ct := c.open(t, "POST", "/api/v1/users", rec)
	if rec.Code != http.StatusCreated || ct != "application/json" || !strings.Contains(plain, `{"email":"a@b.c"}`) {
		t.Fatalf("code %d ct %q plain %s", rec.Code, ct, plain)
	}
}

func TestGetWithoutBodyIsEncryptedBack(t *testing.T) {
	c := newClient(t)
	rec := httptest.NewRecorder()
	Middleware(on())(echo).ServeHTTP(rec, c.request(t, "GET", "/api/v1/identities?page=2", "", nil, time.Now()))
	if plain, _ := c.open(t, "GET", "/api/v1/identities", rec); plain != `{"got":""}` {
		t.Fatalf("plain %s", plain)
	}
}

func TestRefused(t *testing.T) {
	c := newClient(t)
	cases := map[string]*http.Request{
		"plain body":    httptest.NewRequest("POST", "/api/v1/users", strings.NewReader(`{"email":"a@b.c"}`)),
		"no key on GET": httptest.NewRequest("GET", "/api/v1/identities", nil),
		"other path":    c.request(t, "POST", "/api/v1/users", "/api/v1/settings", map[string]int{"a": 1}, time.Now()),
		"other method":  c.request(t, "PUT", "/api/v1/users", "/api/v1/users", map[string]int{"a": 1}, time.Now()),
		"too old":       c.request(t, "POST", "/api/v1/users", "/api/v1/users", map[string]int{"a": 1}, time.Now().Add(-10*time.Minute)),
	}
	if r := cases["other method"]; r != nil {
		r.Method = "POST" // sealed for PUT, sent as POST
	}
	for name, r := range cases {
		rec := httptest.NewRecorder()
		Middleware(on())(echo).ServeHTTP(rec, r)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "PAYLOAD_ENCRYPTION_REQUIRED") {
			t.Errorf("%s: %d %s", name, rec.Code, rec.Body.String())
		}
	}
}

func TestExemptAndOff(t *testing.T) {
	for _, tc := range []struct {
		cfg  Config
		path string
	}{{on(), "/api/v1/health"}, {on(), "/api/v1/ispm-scans/abc"}, {on(), "/assets/app.js"}, {Config{}, "/api/v1/users"}} {
		rec := httptest.NewRecorder()
		Middleware(tc.cfg)(echo).ServeHTTP(rec, httptest.NewRequest("POST", tc.path, strings.NewReader(`x`)))
		if rec.Header().Get(HeaderEncrypted) != "" || rec.Body.String() != `{"got":"x"}` {
			t.Errorf("%s: %s", tc.path, rec.Body.String())
		}
	}
}

func TestPublicKeyHandler(t *testing.T) {
	rec := httptest.NewRecorder()
	PublicKeyHandler(on())(rec, httptest.NewRequest("GET", "/api/v1/auth/payload-key", nil))
	if !strings.Contains(rec.Body.String(), `"enabled":true`) || !strings.Contains(rec.Body.String(), Alg) {
		t.Fatal(rec.Body.String())
	}
	rec = httptest.NewRecorder()
	PublicKeyHandler(Config{})(rec, httptest.NewRequest("GET", "/api/v1/auth/payload-key", nil))
	if strings.Contains(rec.Body.String(), `"key"`) || !strings.Contains(rec.Body.String(), `"enabled":false`) {
		t.Fatal(rec.Body.String())
	}
}
