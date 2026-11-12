-- name: UpsertMeasurement :one
-- Last-write-wins: an older updated_at does not overwrite; in that case no row is
-- returned (pgx.ErrNoRows) and the caller treats it as "stale, ignored".
INSERT INTO measurements (user_id, date, body, updated_at, deleted_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, date) DO UPDATE
SET body = EXCLUDED.body,
    updated_at = EXCLUDED.updated_at,
    deleted_at = EXCLUDED.deleted_at
WHERE EXCLUDED.updated_at >= measurements.updated_at
RETURNING rev;

-- name: GetMeasurement :one
SELECT * FROM measurements WHERE user_id = $1 AND date = $2;

-- name: ListMeasurementsChangedSince :many
-- Includes tombstones (deleted_at not null).
SELECT * FROM measurements
WHERE user_id = $1 AND rev > $2
ORDER BY rev
LIMIT $3;
