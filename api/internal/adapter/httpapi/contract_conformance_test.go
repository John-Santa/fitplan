package httpapi_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pb33f/libopenapi"
	validator "github.com/pb33f/libopenapi-validator"
	"gopkg.in/yaml.v3"

	"github.com/John-Santa/fitplan/api/internal/adapter/httpapi"
	domain "github.com/John-Santa/fitplan/api/internal/domain/sync"
	"github.com/John-Santa/fitplan/api/internal/port"
)

func contractPath(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// internal/adapter/httpapi → api/
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "openapi.yaml")
}

func contractValidator(t *testing.T) validator.Validator {
	t.Helper()
	spec, err := os.ReadFile(contractPath(t))
	if err != nil {
		t.Fatalf("read contract: %v", err)
	}
	doc, err := libopenapi.NewDocument(spec)
	if err != nil {
		t.Fatalf("parse contract: %v", err)
	}
	v, errs := validator.NewValidator(doc)
	if len(errs) > 0 {
		t.Fatalf("build validator: %v", errs)
	}
	if ok, verrs := v.ValidateDocument(); !ok {
		t.Fatalf("contract is not a valid OpenAPI document: %v", verrs)
	}
	return v
}

// TestContractConformance sends real requests through the router and
// validates both the request and the response (success and error) against
// openapi.yaml.
func TestContractConformance(t *testing.T) {
	v := contractValidator(t)
	updated := time.UnixMilli(1700000000123).UTC()
	deleted := time.UnixMilli(1700000000999).UTC()
	pulled := domain.ChangeSet{
		Documents:    []domain.Document{{Kind: domain.DocumentPlan, Body: json.RawMessage(`{"phases":[]}`), UpdatedAt: updated, Rev: 3}},
		Sessions:     []domain.Session{{ID: "s1", Body: json.RawMessage(`{"id":"s1"}`), UpdatedAt: updated, DeletedAt: &deleted, Rev: 7}},
		Measurements: []domain.Measurement{{Date: "2026-11-10", Body: json.RawMessage(`{"weight":80}`), UpdatedAt: updated, Rev: 8}},
		ExerciseMeta: []domain.ExerciseMeta{{ExerciseID: "press", Body: json.RawMessage(`{}`), UpdatedAt: updated, Rev: 9}},
		Cursor:       9, HasMore: true,
	}
	pushed := domain.PushResult{
		Documents:    []domain.ItemResult{{Key: "plan", Status: domain.StatusStale}},
		Measurements: []domain.ItemResult{{Key: "2026-11-10", Status: domain.StatusApplied, Rev: 10}},
	}
	validPush := `{"documents":[{"kind":"plan","body":{},"updatedAt":1,"deletedAt":null}],"measurements":[{"date":"2026-11-10","body":{"weight":80},"updatedAt":1}]}`

	cases := []struct {
		name, method, path, body, user string
		svc                            *fakeSync
		account                        *fakeAccount
		ready                          pinger
		status                         int
	}{
		{name: "health", method: http.MethodGet, path: "/health", status: 200},
		{name: "readyz ok", method: http.MethodGet, path: "/readyz", status: 200},
		{name: "readyz down", method: http.MethodGet, path: "/readyz", ready: pinger{err: errors.New("down")}, status: 503},
		{name: "me", method: http.MethodGet, path: "/v1/me", user: "user_a", status: 200},
		{name: "me unauthorized", method: http.MethodGet, path: "/v1/me", status: 401},
		{name: "pull", method: http.MethodGet, path: "/v1/sync?since=2&limit=50", user: "user_a", svc: &fakeSync{pull: pulled}, status: 200},
		{name: "pull empty", method: http.MethodGet, path: "/v1/sync", user: "user_a", status: 200},
		{name: "pull bad query", method: http.MethodGet, path: "/v1/sync?limit=0", user: "user_a", status: 400},
		{name: "pull unauthorized", method: http.MethodGet, path: "/v1/sync", status: 401},
		{name: "pull failure", method: http.MethodGet, path: "/v1/sync", user: "user_a", svc: &fakeSync{err: errors.New("db down")}, status: 500},
		{name: "push", method: http.MethodPost, path: "/v1/sync", body: validPush, user: "user_a", svc: &fakeSync{push: pushed}, status: 200},
		{name: "push validation", method: http.MethodPost, path: "/v1/sync", body: `{"documents":[{"kind":"plan","body":{}}]}`, user: "user_a", status: 400},
		{name: "push unauthorized", method: http.MethodPost, path: "/v1/sync", body: validPush, status: 401},
		{name: "push failure", method: http.MethodPost, path: "/v1/sync", body: `{}`, user: "user_a", svc: &fakeSync{err: errors.New("db down")}, status: 500},
		{name: "pull deleted account", method: http.MethodGet, path: "/v1/sync", user: "user_a", svc: &fakeSync{err: port.ErrGone}, status: 410},
		{name: "push deleted account", method: http.MethodPost, path: "/v1/sync", body: validPush, user: "user_a", svc: &fakeSync{err: port.ErrGone}, status: 410},
		{name: "delete me", method: http.MethodDelete, path: "/v1/me", user: "user_a", status: 204},
		{name: "delete me unauthorized", method: http.MethodDelete, path: "/v1/me", status: 401},
		{name: "delete me failure", method: http.MethodDelete, path: "/v1/me", user: "user_a", account: &fakeAccount{err: errors.New("clerk down")}, status: 500},
		{name: "delete data", method: http.MethodDelete, path: "/v1/data", user: "user_a", status: 204},
		{name: "delete data unauthorized", method: http.MethodDelete, path: "/v1/data", status: 401},
		{name: "delete data failure", method: http.MethodDelete, path: "/v1/data", user: "user_a", account: &fakeAccount{err: errors.New("db down")}, status: 500},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := tc.svc
			if svc == nil {
				svc = &fakeSync{}
			}
			account := tc.account
			if account == nil {
				account = &fakeAccount{}
			}
			h := newRouter(httpapi.RouterConfig{Authenticator: fakeAuth{}, Sync: svc, Account: account, Readiness: tc.ready})
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			if tc.user != "" {
				req.Header.Set("X-Test-User", tc.user)
				req.Header.Set("Authorization", "Bearer test-token")
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d (%s)", rec.Code, tc.status, rec.Body.String())
			}
			if tc.status < 400 {
				vreq := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
				vreq.Header = req.Header.Clone()
				if ok, errs := v.ValidateHttpRequestSync(vreq); !ok {
					t.Errorf("request does not match the contract: %s", describe(errs))
				}
			}
			resp := rec.Result()
			defer func() { _ = resp.Body.Close() }()
			if ok, errs := v.ValidateHttpResponse(req, resp); !ok {
				t.Errorf("response does not match the contract: %s\nbody: %s", describe(errs), rec.Body.String())
			}
		})
	}
}

// TestContractCoversEveryRoute keeps openapi.yaml and the router in step.
func TestContractCoversEveryRoute(t *testing.T) {
	spec, err := os.ReadFile(contractPath(t))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(spec, &doc); err != nil {
		t.Fatal(err)
	}
	var inContract []string
	for path, ops := range doc.Paths {
		for method := range ops {
			inContract = append(inContract, strings.ToUpper(method)+" "+path)
		}
	}
	routes, ok := newRouter(httpapi.RouterConfig{Sync: &fakeSync{}, Account: &fakeAccount{}}).(chi.Routes)
	if !ok {
		t.Fatal("router is not chi.Routes")
	}
	var inRouter []string
	_ = chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		inRouter = append(inRouter, method+" "+route)
		return nil
	})
	slices.Sort(inContract)
	slices.Sort(inRouter)
	if !slices.Equal(inContract, inRouter) {
		t.Errorf("routes differ:\ncontract %v\nrouter   %v", inContract, inRouter)
	}
}

func describe(errs []*validatorErr) string {
	var b strings.Builder
	for _, e := range errs {
		fmt.Fprintf(&b, "\n- %s: %s", e.Message, e.Reason)
		for _, s := range e.SchemaValidationErrors {
			fmt.Fprintf(&b, "\n    %s (%s)", s.Reason, s.Location)
		}
	}
	return b.String()
}
