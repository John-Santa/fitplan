package httpapi_test

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
)

func metaItems(n int) string {
	items := make([]string, n)
	for i := range items {
		items[i] = `{"exerciseId":"e` + strconv.Itoa(i) + `","body":{},"updatedAt":1}`
	}
	return strings.Join(items, ",")
}

func sessionItems(n int) string {
	items := make([]string, n)
	for i := range items {
		items[i] = `{"id":"s` + strconv.Itoa(i) + `","body":{},"updatedAt":1}`
	}
	return strings.Join(items, ",")
}

func exerciseMetaBody(n int) string {
	return `{"exerciseMeta":[` + metaItems(n) + `]}`
}

func TestPushAtTheRecordCapIsAccepted(t *testing.T) {
	svc := &fakeSync{}
	rec := send(v1Handler(svc), http.MethodPost, "/v1/sync", exerciseMetaBody(httpapi.MaxPushRecords), "user_a")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	if svc.calls != 1 {
		t.Errorf("service calls = %d, want 1", svc.calls)
	}
}

func TestPushOverTheRecordCapIsRejectedBeforeTheService(t *testing.T) {
	svc := &fakeSync{}
	rec := send(v1Handler(svc), http.MethodPost, "/v1/sync", exerciseMetaBody(httpapi.MaxPushRecords+1), "user_a")
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413 (%s)", rec.Code, rec.Body.String())
	}
	if msg := errorOf(t, rec); !strings.Contains(msg, "too many records") || !strings.Contains(msg, strconv.Itoa(httpapi.MaxPushRecords)) {
		t.Errorf("error = %q, want it to name the limit", msg)
	}
	if svc.calls != 0 {
		t.Error("an oversized push reached the sync service")
	}
}

func TestPushCapCountsEveryCollection(t *testing.T) {
	half := httpapi.MaxPushRecords/2 + 1
	body := `{"sessions":[` + sessionItems(half) + `],"exerciseMeta":[` + metaItems(half) + `]}`
	if rec := send(v1Handler(&fakeSync{}), http.MethodPost, "/v1/sync", body, "user_a"); rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413: the cap is on the total across collections", rec.Code)
	}
}
