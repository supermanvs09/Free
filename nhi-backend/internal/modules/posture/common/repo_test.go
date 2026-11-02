package common

import (
	"testing"
)

func TestCursorRoundTrip(t *testing.T) {
	type cur struct {
		S  string `json:"s"`
		ID string `json:"id"`
	}
	in := cur{S: "-score", ID: "abc"}
	var out cur
	if err := DecodeCursor(EncodeCursor(in), &out); err != nil || out != in {
		t.Fatalf("round trip failed: %v %+v", err, out)
	}
	if err := DecodeCursor("!!!not-base64", &out); err != ErrMalformedCursor {
		t.Errorf("want ErrInvalidCursor, got %v", err)
	}
	if err := DecodeCursor("bm90LWpzb24", &out); err != ErrMalformedCursor {
		t.Errorf("want ErrInvalidCursor for non-JSON, got %v", err)
	}
}

func TestClampLimit(t *testing.T) {
	for in, want := range map[int]int{0: 50, -3: 50, 1: 1, 100: 100, 500: 100} {
		if got := ClampPageLimit(in); got != want {
			t.Errorf("clampLimit(%d)=%d want %d", in, got, want)
		}
	}
}

func TestEscapeLike(t *testing.T) {
	if got := EscapeLike(`50%_a\b`); got != `50\%\_a\\b` {
		t.Errorf("got %q", got)
	}
}

func TestAccessKeyID(t *testing.T) {
	cases := map[string]string{
		"arn:aws:iam::111111111111:user/ci-deployer/access-key/AKIAEXAMPLE0000000001": "AKIAEXAMPLE0000000001",
		"arn:aws:iam::111111111111:user/ci-deployer/accesskey/AKIAEXAMPLE0000000002":  "AKIAEXAMPLE0000000002",
		"arn:aws:iam::111111111111:user/ci-deployer/AccessKey/AKIAEXAMPLE0000000003":  "AKIAEXAMPLE0000000003",
	}
	for arn, want := range cases {
		if got, ok := AccessKeyID(arn); !ok || got != want {
			t.Errorf("accessKeyID(%q) = %q, %v; want %q", arn, got, ok, want)
		}
	}
	for _, arn := range []string{"arn:aws:iam::111111111111:role/deploy-role", "arn:aws:iam::111111111111:user/access-key-rotator", ""} {
		if got, ok := AccessKeyID(arn); ok {
			t.Errorf("accessKeyID(%q) = %q, want no key", arn, got)
		}
	}
}
