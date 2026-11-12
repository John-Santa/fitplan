-- name: UpsertSession :one
-- Last-write-wins: an older updated_at does not overwrite; in that case no row is
-- returned (pgx.ErrNoRows) and the caller treats it as "stale, ignored".
INSERT INTO sessions (user_id, id, kind, date, finished_at, body, updated_at, deleted_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (user_id, id) DO UPDATE
SET kind = EXCLUDED.kind,
    date = EXCLUDED.date,
    finished_at = EXCLUDED.finished_at,
    body = EXCLUDED.body,
    updated_at = EXCLUDED.updated_at,
    deleted_at = EXCLUDED.deleted_at
WHERE EXCLUDED.updated_at >= sessions.updated_at
RETURNING rev;

-- name: GetSession :one
SELECT * FROM sessions WHERE user_id = $1 AND id = $2;

-- name: ListSessionsChangedSince :many
-- Includes tombstones (deleted_at not null).
SELECT * FROM sessions
WHERE user_id = $1 AND rev > $2
ORDER BY rev
LIMIT $3;

-- name: DeleteSessions :exec
-- Deletes every row of one user, tombstones included (DELETE /v1/data).
DELETE FROM sessions WHERE user_id = $1;
