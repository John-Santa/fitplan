-- +goose Up
-- +goose StatementBegin

-- Users are identified by the Clerk user id (JWT subject), e.g. "user_2abc...".
CREATE TABLE users (
    id         text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Global monotonic change sequence. Every row of every synced table gets a new
-- value on each insert/update, so clients can pull "everything with rev > cursor".
-- Gaps are expected (rolled back transactions, skipped LWW updates) and harmless.
CREATE SEQUENCE change_seq;

-- Stamps rev and server_updated_at on every insert/update of a synced table.
-- rev is always assigned by the server; client-provided values are overwritten.
CREATE FUNCTION set_sync_columns() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.rev := nextval('change_seq');
    NEW.server_updated_at := now();
    RETURN NEW;
END;
$$;

-- One jsonb document per user and kind: the training plan and the config.
CREATE TABLE user_documents (
    user_id           text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind              text        NOT NULL CHECK (kind IN ('plan', 'config')),
    body              jsonb       NOT NULL,
    rev               bigint      NOT NULL,
    updated_at        timestamptz NOT NULL,            -- client last-write time (LWW)
    deleted_at        timestamptz,                     -- tombstone
    server_updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind)
);
CREATE INDEX user_documents_user_rev_idx ON user_documents (user_id, rev);

-- Workout sessions (strength or swim). body holds the full normalized Session.
CREATE TABLE sessions (
    user_id           text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id                text        NOT NULL,            -- client-generated session id
    kind              text        NOT NULL CHECK (kind IN ('strength', 'swim')),
    date              date        NOT NULL,            -- local day, YYYY-MM-DD
    finished_at       timestamptz,                     -- null while in progress
    body              jsonb       NOT NULL,
    rev               bigint      NOT NULL,
    updated_at        timestamptz NOT NULL,
    deleted_at        timestamptz,
    server_updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sessions_user_date_idx ON sessions (user_id, date);
CREATE INDEX sessions_user_rev_idx ON sessions (user_id, rev);

-- Body measurements, one per user and local day.
CREATE TABLE measurements (
    user_id           text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date              date        NOT NULL,
    body              jsonb       NOT NULL,
    rev               bigint      NOT NULL,
    updated_at        timestamptz NOT NULL,
    deleted_at        timestamptz,
    server_updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, date)
);
CREATE INDEX measurements_user_rev_idx ON measurements (user_id, rev);

-- Per-exercise machine notes (seat number, setup note).
CREATE TABLE exercise_meta (
    user_id           text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise_id       text        NOT NULL,
    body              jsonb       NOT NULL,
    rev               bigint      NOT NULL,
    updated_at        timestamptz NOT NULL,
    deleted_at        timestamptz,
    server_updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, exercise_id)
);
CREATE INDEX exercise_meta_user_rev_idx ON exercise_meta (user_id, rev);

CREATE TRIGGER user_documents_sync BEFORE INSERT OR UPDATE ON user_documents
    FOR EACH ROW EXECUTE FUNCTION set_sync_columns();
CREATE TRIGGER sessions_sync BEFORE INSERT OR UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION set_sync_columns();
CREATE TRIGGER measurements_sync BEFORE INSERT OR UPDATE ON measurements
    FOR EACH ROW EXECUTE FUNCTION set_sync_columns();
CREATE TRIGGER exercise_meta_sync BEFORE INSERT OR UPDATE ON exercise_meta
    FOR EACH ROW EXECUTE FUNCTION set_sync_columns();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE exercise_meta;
DROP TABLE measurements;
DROP TABLE sessions;
DROP TABLE user_documents;
DROP FUNCTION set_sync_columns();
DROP SEQUENCE change_seq;
DROP TABLE users;
-- +goose StatementEnd
