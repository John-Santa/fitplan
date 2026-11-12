-- name: UpsertExerciseMeta :one
-- Last-write-wins: an older updated_at does not overwrite; in that case no row is
-- returned (pgx.ErrNoRows) and the caller treats it as "stale, ignored".
INSERT INTO exercise_meta (user_id, exercise_id, body, updated_at, deleted_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, exercise_id) DO UPDATE
SET body = EXCLUDED.body,
    updated_at = EXCLUDED.updated_at,
    deleted_at = EXCLUDED.deleted_at
WHERE EXCLUDED.updated_at >= exercise_meta.updated_at
RETURNING rev;

-- name: GetExerciseMeta :one
SELECT * FROM exercise_meta WHERE user_id = $1 AND exercise_id = $2;

-- name: ListExerciseMetaChangedSince :many
-- Includes tombstones (deleted_at not null).
SELECT * FROM exercise_meta
WHERE user_id = $1 AND rev > $2
ORDER BY rev
LIMIT $3;
