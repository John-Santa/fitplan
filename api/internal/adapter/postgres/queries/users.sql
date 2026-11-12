-- name: UpsertUser :exec
INSERT INTO users (id)
VALUES ($1)
ON CONFLICT (id) DO UPDATE SET updated_at = now();

-- name: MaxRev :one
-- Highest rev across all synced tables for one user (0 when empty); used as the pull cursor.
SELECT GREATEST(
    (SELECT COALESCE(MAX(d.rev), 0) FROM user_documents d WHERE d.user_id = $1),
    (SELECT COALESCE(MAX(s.rev), 0) FROM sessions s WHERE s.user_id = $1),
    (SELECT COALESCE(MAX(m.rev), 0) FROM measurements m WHERE m.user_id = $1),
    (SELECT COALESCE(MAX(e.rev), 0) FROM exercise_meta e WHERE e.user_id = $1)
)::bigint AS max_rev;
