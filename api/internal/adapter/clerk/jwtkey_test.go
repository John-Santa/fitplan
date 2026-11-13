package clerk_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/adapter/clerk"
)

func publicKeyDER(t *testing.T) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	return der
}

func TestWithJWTKeyAcceptsPEMAndSingleLineForms(t *testing.T) {
	der := publicKeyDER(t)
	for name, key := range map[string]string{
		"pem":         string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})),
		"single line": base64.StdEncoding.EncodeToString(der),
	} {
		t.Run(name, func(t *testing.T) {
			a, err := clerk.New("sk_test_dummy", nil).WithJWTKey(key)
			if err != nil {
				t.Fatalf("WithJWTKey: %v", err)
			}
			// A malformed token is still answered by the unauthorized handler.
			reached := false
			h := a.Authenticate(
				http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true }),
				http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }),
			)
			req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
			req.Header.Set("Authorization", "Bearer not-a-jwt")
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if reached || rec.Code != http.StatusUnauthorized {
				t.Errorf("reached = %v, status = %d; want unreached 401", reached, rec.Code)
			}
		})
	}
}

func TestWithJWTKeyRejectsInvalidKey(t *testing.T) {
	for name, key := range map[string]string{"empty": "  ", "garbage": "not-a-key"} {
		t.Run(name, func(t *testing.T) {
			if _, err := clerk.New("sk_test_dummy", nil).WithJWTKey(key); err == nil {
				t.Error("WithJWTKey accepted an invalid key")
			}
		})
	}
}
