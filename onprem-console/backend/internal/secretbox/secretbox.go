// Package secretbox encrypts the tokens and keys the console keeps (GitHub App
// private key, Bitbucket and Jenkins tokens, webhook secrets) with AES-256-GCM
// under ONPREM_ENCRYPTION_KEY. They are decrypted only to call the source;
// no API answer ever carries one back.
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
)

type Box struct{ aead cipher.AEAD }

func New(key []byte) (*Box, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// Seal returns nonce || ciphertext. Empty input stays empty.
func (b *Box) Seal(plain []byte) ([]byte, error) {
	if len(plain) == 0 {
		return nil, nil
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return b.aead.Seal(nonce, nonce, plain, nil), nil
}

func (b *Box) Open(sealed []byte) ([]byte, error) {
	if len(sealed) == 0 {
		return nil, nil
	}
	n := b.aead.NonceSize()
	if len(sealed) < n {
		return nil, errors.New("secretbox: sealed value too short")
	}
	return b.aead.Open(nil, sealed[:n], sealed[n:], nil)
}
