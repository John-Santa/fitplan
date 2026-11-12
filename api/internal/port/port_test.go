package port_test

import (
	"context"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/port"
)

func TestUserIDRoundTrip(t *testing.T) {
	if _, ok := port.UserIDFrom(context.Background()); ok {
		t.Error("empty context must have no user")
	}
	id, ok := port.UserIDFrom(port.WithUserID(context.Background(), "user_1"))
	if !ok || id != "user_1" {
		t.Errorf("UserIDFrom = %q/%v", id, ok)
	}
	if _, ok := port.UserIDFrom(port.WithUserID(context.Background(), "")); ok {
		t.Error("empty id must not count as authenticated")
	}
}
