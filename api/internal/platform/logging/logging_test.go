package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"testing"

	"github.com/John-Santa/fitplan/api/internal/platform/logging"
)

func TestRequestIDIsAddedFromContext(t *testing.T) {
	var buf bytes.Buffer
	log := logging.New(&buf, slog.LevelInfo).With(slog.String("component", "test"))
	log.InfoContext(logging.WithRequestID(context.Background(), "req-1"), "hello")
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("not JSON: %q", buf.String())
	}
	if line["request_id"] != "req-1" || line["component"] != "test" {
		t.Errorf("line = %v", line)
	}
	buf.Reset()
	log.InfoContext(context.Background(), "no id")
	if bytes.Contains(buf.Bytes(), []byte("request_id")) {
		t.Errorf("unexpected request_id: %s", buf.String())
	}
}
