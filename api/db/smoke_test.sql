-- Smoke test for 00001_init.sql. Run against a database with the Up section applied:
--   psql -v ON_ERROR_STOP=1 -f api/db/smoke_test.sql
-- Each check raises an exception on failure; success prints NOTICE "PASS: ...".
-- Everything runs in one transaction and is rolled back at the end.
BEGIN;

INSERT INTO users (id) VALUES ('user_a'), ('user_b');

DO $$
DECLARE
    r1 bigint; r2 bigint; r3 bigint; n int; max_a bigint;
BEGIN
    -- 1. rev is assigned by the server and increases on update (client rev ignored).
    INSERT INTO sessions (user_id, id, kind, date, body, updated_at)
    VALUES ('user_a', 's1', 'strength', '2026-01-10', '{"v":1}', '2026-01-10 10:00+00')
    RETURNING rev INTO r1;
    UPDATE sessions SET body = '{"v":2}', updated_at = '2026-01-10 11:00+00'
    WHERE user_id = 'user_a' AND id = 's1'
    RETURNING rev INTO r2;
    IF NOT (r2 > r1) THEN RAISE EXCEPTION 'FAIL rev did not increase: % -> %', r1, r2; END IF;
    RAISE NOTICE 'PASS: rev increases on update (% -> %)', r1, r2;

    -- 2. LWW: upsert with an older updated_at is ignored (no row returned, body unchanged).
    r3 := NULL;
    INSERT INTO sessions (user_id, id, kind, date, body, updated_at)
    VALUES ('user_a', 's1', 'strength', '2026-01-10', '{"v":"stale"}', '2026-01-10 09:00+00')
    ON CONFLICT (user_id, id) DO UPDATE
    SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at >= sessions.updated_at
    RETURNING rev INTO r3;
    IF r3 IS NOT NULL THEN RAISE EXCEPTION 'FAIL stale write returned rev %', r3; END IF;
    IF (SELECT body->>'v' FROM sessions WHERE user_id='user_a' AND id='s1') <> '2' THEN
        RAISE EXCEPTION 'FAIL stale write overwrote body'; END IF;
    IF (SELECT rev FROM sessions WHERE user_id='user_a' AND id='s1') <> r2 THEN
        RAISE EXCEPTION 'FAIL stale write bumped rev'; END IF;
    RAISE NOTICE 'PASS: LWW ignores an older updated_at';

    -- 2b. LWW: a newer updated_at wins and bumps rev.
    INSERT INTO sessions (user_id, id, kind, date, body, updated_at)
    VALUES ('user_a', 's1', 'strength', '2026-01-10', '{"v":3}', '2026-01-10 12:00+00')
    ON CONFLICT (user_id, id) DO UPDATE
    SET body = EXCLUDED.body, updated_at = EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at >= sessions.updated_at
    RETURNING rev INTO r3;
    IF r3 IS NULL OR r3 <= r2 THEN RAISE EXCEPTION 'FAIL newer write not applied'; END IF;
    RAISE NOTICE 'PASS: LWW applies a newer updated_at (rev %)', r3;

    -- 3. Tombstones are returned by the changed-since query.
    UPDATE sessions SET deleted_at = '2026-01-10 13:00+00', updated_at = '2026-01-10 13:00+00'
    WHERE user_id = 'user_a' AND id = 's1';
    SELECT count(*) INTO n FROM sessions
    WHERE user_id = 'user_a' AND rev > r1 AND deleted_at IS NOT NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL tombstone not listed (n=%)', n; END IF;
    RAISE NOTICE 'PASS: tombstone listed by changed-since';

    -- 4. Tenant isolation: user_b data is never returned for user_a (and vice versa).
    INSERT INTO sessions (user_id, id, kind, date, body, updated_at)
    VALUES ('user_b', 's1', 'swim', '2026-01-11', '{"v":"b"}', now());
    INSERT INTO measurements (user_id, date, body, updated_at)
    VALUES ('user_b', '2026-01-11', '{"weight":80}', now());
    INSERT INTO exercise_meta (user_id, exercise_id, body, updated_at)
    VALUES ('user_b', 'bench', '{"seat":"3"}', now());
    INSERT INTO user_documents (user_id, kind, body, updated_at)
    VALUES ('user_b', 'plan', '{}', now());
    SELECT count(*) INTO n FROM sessions WHERE user_id = 'user_a' AND rev > 0;
    IF n <> 1 THEN RAISE EXCEPTION 'FAIL user_a sees % sessions (expected 1)', n; END IF;
    SELECT count(*) INTO n FROM (
        SELECT user_id FROM measurements WHERE user_id = 'user_a' AND rev > 0
        UNION ALL SELECT user_id FROM exercise_meta WHERE user_id = 'user_a' AND rev > 0
        UNION ALL SELECT user_id FROM user_documents WHERE user_id = 'user_a' AND rev > 0
    ) x;
    IF n <> 0 THEN RAISE EXCEPTION 'FAIL user_a sees user_b rows (n=%)', n; END IF;
    IF (SELECT body->>'v' FROM sessions WHERE user_id='user_a' AND id='s1') = 'b' THEN
        RAISE EXCEPTION 'FAIL cross-tenant overwrite'; END IF;
    RAISE NOTICE 'PASS: rows of another user are never returned';

    -- 5. MaxRev semantics (same expression as the MaxRev query).
    SELECT GREATEST(
        (SELECT COALESCE(MAX(rev),0) FROM user_documents WHERE user_id='user_a'),
        (SELECT COALESCE(MAX(rev),0) FROM sessions WHERE user_id='user_a'),
        (SELECT COALESCE(MAX(rev),0) FROM measurements WHERE user_id='user_a'),
        (SELECT COALESCE(MAX(rev),0) FROM exercise_meta WHERE user_id='user_a'))
    INTO max_a;
    IF max_a <> (SELECT rev FROM sessions WHERE user_id='user_a' AND id='s1') THEN
        RAISE EXCEPTION 'FAIL max rev for user_a is %', max_a; END IF;
    RAISE NOTICE 'PASS: max rev is per user';
END $$;

ROLLBACK;
