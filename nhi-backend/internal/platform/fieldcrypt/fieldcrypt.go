// Package fieldcrypt opens passwords the console encrypts before sending, so a
// password never travels as readable text in a request body - not in a proxy's
// log, not in an intercepting tool, not past the point where TLS ends.
//
// The scheme is ECIES on P-256, all standard library:
//
//	browser: ephemeral ECDH key pair, shared = ECDH(ephemeral, server public)
//	         key = HKDF-SHA256(shared, info "nhi-field-v1"), AES-256-GCM
//	         plaintext = "<unix ms>:<password>"
//	wire:    "v1.<ephemeral public>.<iv>.<ciphertext>" (base64url, no padding)
//
// The server key pair is derived from the JWT secret, so every API replica
// holds the same one without another secret to deploy. The timestamp bounds
// how long a captured value can be replayed.
//
// ponytail: replay is bounded by MaxAge, not prevented. A single-use nonce
// store closes the window if an auditor asks for it.
package fieldcrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	prefix = "v1."
	info   = "nhi-field-v1"
	// MaxAge is how old (or how far in the future) a sealed value may be.
	MaxAge = 2 * time.Minute
)

// ErrInvalid is every reason a value could not be opened. The reasons are not
// told apart to the caller on purpose.
var ErrInvalid = errors.New("encrypted field is invalid or expired")

var (
	mu  sync.RWMutex
	key *ecdh.PrivateKey
)

// Init derives the key pair from the server secret. Call once at start-up.
func Init(secret string) error {
	if len(secret) < 32 {
		return errors.New("fieldcrypt: secret must be at least 32 characters")
	}
	curve := ecdh.P256()
	for i := 0; i < 16; i++ { // a derived scalar is out of range about 1 time in 2^32
		seed, err := hkdf.Key(sha256.New, []byte(secret), nil, "nhi-field-key-"+strconv.Itoa(i), 32)
		if err != nil {
			return err
		}
		if k, err := curve.NewPrivateKey(seed); err == nil {
			mu.Lock()
			key = k
			mu.Unlock()
			return nil
		}
	}
	return errors.New("fieldcrypt: could not derive a key")
}

// PublicKey is the server's public key, uncompressed point, base64url.
func PublicKey() string {
	mu.RLock()
	defer mu.RUnlock()
	if key == nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes())
}

// Open returns the password inside a sealed value.
func Open(sealed string) (string, error) {
	return openAt(sealed, time.Now())
}

func openAt(sealed string, now time.Time) (string, error) {
	mu.RLock()
	k := key
	mu.RUnlock()
	if k == nil || !strings.HasPrefix(sealed, prefix) {
		return "", ErrInvalid
	}
	parts := strings.Split(sealed[len(prefix):], ".")
	if len(parts) != 3 {
		return "", ErrInvalid
	}
	raw := make([][]byte, 3)
	for i, p := range parts {
		b, err := base64.RawURLEncoding.DecodeString(p)
		if err != nil {
			return "", ErrInvalid
		}
		raw[i] = b
	}
	peer, err := ecdh.P256().NewPublicKey(raw[0])
	if err != nil {
		return "", ErrInvalid
	}
	shared, err := k.ECDH(peer)
	if err != nil {
		return "", ErrInvalid
	}
	aesKey, err := hkdf.Key(sha256.New, shared, nil, info, 32)
	if err != nil {
		return "", ErrInvalid
	}
	block, _ := aes.NewCipher(aesKey)
	gcm, _ := cipher.NewGCM(block)
	if len(raw[1]) != gcm.NonceSize() {
		return "", ErrInvalid
	}
	plain, err := gcm.Open(nil, raw[1], raw[2], nil)
	if err != nil {
		return "", ErrInvalid
	}
	ts, value, ok := strings.Cut(string(plain), ":")
	if !ok {
		return "", ErrInvalid
	}
	ms, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return "", ErrInvalid
	}
	if d := now.Sub(time.UnixMilli(ms)); d > MaxAge || d < -MaxAge {
		return "", ErrInvalid
	}
	return value, nil
}
