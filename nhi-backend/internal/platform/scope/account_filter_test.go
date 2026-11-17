package scope

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestAccountFilterMiddlewareMovesTheParamToTheContext(t *testing.T) {
	var gotQuery string
	var gotCtx []string
	var ok bool
	h := AccountFilterMiddleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		gotCtx, ok = r.Context().Value(accountFilterKey{}).([]string)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x?page=2&account_filter=111111111111,bad,222222222222", nil))
	if gotQuery != "page=2" || !ok || !reflect.DeepEqual(gotCtx, []string{"111111111111", "222222222222"}) {
		t.Fatalf("query %q ctx %v ok %v", gotQuery, gotCtx, ok)
	}
	// a write is never narrowed, and the param is still stripped
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/x?account_filter=111111111111", nil))
	if ok || gotQuery != "" {
		t.Fatalf("POST must not carry a filter: query %q ok %v", gotQuery, ok)
	}
}

func TestNarrowAccountsOnlyNarrows(t *testing.T) {
	ctx := WithAccountFilter(t.Context(), []string{"222222222222", "999999999999"})
	got := narrowAccounts(ctx, []string{"111111111111", "222222222222"})
	if !reflect.DeepEqual(got, []string{"222222222222"}) {
		t.Fatalf("got %v", got) // 999… is outside the saved scope and must not appear
	}
	if got := narrowAccounts(t.Context(), []string{"1"}); !reflect.DeepEqual(got, []string{"1"}) {
		t.Fatalf("no filter must pass through, got %v", got)
	}
	if got := narrowAccounts(WithAccountFilter(t.Context(), []string{}), []string{"1"}); len(got) != 0 || got == nil {
		t.Fatalf("an empty filter matches nothing, got %v", got)
	}
}
