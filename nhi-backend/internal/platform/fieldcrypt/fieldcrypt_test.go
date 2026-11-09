package fieldcrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"testing"
	"time"
)

// seal does what the console's lib/api/seal.js does.
func seal(t *testing.T, value string, at time.Time) string {
	t.Helper()
	pubRaw, _ := base64.RawURLEncoding.DecodeString(PublicKey())
	server, err := ecdh.P256().NewPublicKey(pubRaw)
	if err != nil {
		t.Fatal(err)
	}
	eph, _ := ecdh.P256().GenerateKey(rand.Reader)
	shared, _ := eph.ECDH(server)
	k, _ := hkdf.Key(sha256.New, shared, nil, info, 32)
	block, _ := aes.NewCipher(k)
	gcm, _ := cipher.NewGCM(block)
	iv := make([]byte, gcm.NonceSize())
	_, _ = rand.Read(iv)
	ct := gcm.Seal(nil, iv, []byte(strconv.FormatInt(at.UnixMilli(), 10)+":"+value), nil)
	enc := base64.RawURLEncoding.EncodeToString
	return prefix + enc(eph.PublicKey().Bytes()) + "." + enc(iv) + "." + enc(ct)
}

func TestOpen(t *testing.T) {
	if err := Init("0123456789abcdef0123456789abcdef"); err != nil {
		t.Fatal(err)
	}
	now := time.Now()

	if got, err := Open(seal(t, "p@ss:word", now)); err != nil || got != "p@ss:word" {
		t.Fatalf("round trip: %q %v", got, err)
	}
	if _, err := Open(seal(t, "x", now.Add(-3*time.Minute))); err == nil {
		t.Fatal("an old value must be refused")
	}
	if _, err := Open("plain-text-password"); err == nil {
		t.Fatal("plain text must be refused")
	}
	tampered := []byte(seal(t, "x", now))
	tampered[len(tampered)-2] ^= 1
	if _, err := Open(string(tampered)); err == nil {
		t.Fatal("a tampered value must be refused")
	}
	// Same secret, same key: every replica can open what any one published.
	pub := PublicKey()
	_ = Init("0123456789abcdef0123456789abcdef")
	if PublicKey() != pub {
		t.Fatal("key must be derived deterministically from the secret")
	}
}
