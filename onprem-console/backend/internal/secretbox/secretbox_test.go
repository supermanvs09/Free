package secretbox

import (
	"bytes"
	"testing"
)

func TestSealOpen(t *testing.T) {
	b, err := New(bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatal(err)
	}
	sealed, err := b.Seal([]byte("ghp_secret"))
	if err != nil || bytes.Contains(sealed, []byte("ghp_secret")) {
		t.Fatalf("sealed=%q err=%v", sealed, err)
	}
	plain, err := b.Open(sealed)
	if err != nil || string(plain) != "ghp_secret" {
		t.Fatalf("open = %q %v", plain, err)
	}
	sealed[len(sealed)-1] ^= 1
	if _, err := b.Open(sealed); err == nil {
		t.Fatal("a tampered value opened")
	}
}
