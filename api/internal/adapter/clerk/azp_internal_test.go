package clerk

import "testing"

func TestAuthorizedPartyHandler(t *testing.T) {
	cases := []struct {
		name    string
		allowed []string
		azp     string
		want    bool
	}{
		{"no list accepts any azp", nil, "https://evil.example", true},
		{"no list accepts missing azp", nil, "", true},
		{"listed azp accepted", []string{"https://app.magnifit.co"}, "https://app.magnifit.co", true},
		{"unlisted azp rejected", []string{"https://app.magnifit.co"}, "https://evil.example", false},
		{"missing azp rejected when a list is configured", []string{"https://app.magnifit.co"}, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := authorizedParty(tc.allowed)
			if tc.allowed == nil {
				if got != nil && !got(tc.azp) {
					t.Fatalf("handler(%q) = false, want true", tc.azp)
				}
				return
			}
			if got == nil || got(tc.azp) != tc.want {
				t.Errorf("handler(%q) = %v, want %v", tc.azp, got != nil && got(tc.azp), tc.want)
			}
		})
	}
}
