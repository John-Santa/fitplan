-- +goose Up
-- +goose StatementBegin

-- Users who deleted their account (DELETE /v1/me). Another device may still
-- hold their data and try to upload it again; pushes and pulls of a listed
-- user answer 410 instead of recreating the users row. Only the SHA-256 of
-- the Clerk user id is kept, never the id itself, and no health data.
CREATE TABLE deleted_users (
    user_id_sha256 bytea       PRIMARY KEY,
    deleted_at     timestamptz NOT NULL DEFAULT now()
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE deleted_users;
-- +goose StatementEnd
