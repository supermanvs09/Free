package httpx

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// ClientIP is the caller's address, for rate limits and records. Forwarding
// headers are trusted only when the direct peer is a private or loopback
// address (our own proxies); otherwise anyone could forge them. Behind proxies
// the client is the right-most public address in X-Forwarded-For: each proxy
// appends the peer it saw, so entries to its left may be forged but that one
// was not.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if !trustedPeer(host) {
		return host
	}
	hops := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		if ip, err := netip.ParseAddr(strings.TrimSpace(hops[i])); err == nil && !trustedPeer(ip.String()) {
			return ip.String()
		}
	}
	if real, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP"))); err == nil {
		return real.String()
	}
	return host
}

func trustedPeer(addr string) bool {
	ip, err := netip.ParseAddr(addr)
	return err == nil && (ip.IsLoopback() || ip.IsPrivate())
}
