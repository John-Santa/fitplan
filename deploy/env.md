# Environment variables (names only)

Never commit values. Local values live in untracked `.env` files; production values live in the Render dashboard.
Templates: `api/.env.example` (API) and `web/.env.example` if present.

## Web (`web/`, Vite, build-time)

Vite inlines these at build time, so changing one needs a new deploy. Nothing here is secret.

| Name | Required | Who sets it | Where | Notes |
| --- | --- | --- | --- | --- |
| `VITE_BASE` | optional (default `/`) | repo / CI | `deploy/render.yaml` (`/`), GitHub Pages workflow (`/<repo>/`) | Public path the app is served under. |
| `VITE_API_URL` | required for sync | repo | local `web/.env`, `deploy/render.yaml` | API origin, e.g. the `api.magnifit.co` origin. Without it the app runs local-only. |
| `VITE_CLERK_PUBLISHABLE_KEY` | required for login | you | local `web/.env`, Render dashboard (`sync: false`) | Clerk publishable key (`pk_test_` in dev, `pk_live_` in production). Without it the app runs local-only. |

## API (`api/`, runtime)

| Name | Required | Who sets it | Where | Notes |
| --- | --- | --- | --- | --- |
| `APP_ENV` | optional | repo | local `api/.env`, `deploy/render.yaml` (`production`) | Environment name. `production` makes `ALLOWED_ORIGINS` mandatory and requires `sslmode=require`, `verify-ca` or `verify-full` in `DATABASE_URL`; the API refuses to start otherwise. Local runs (unset or any other value) are unaffected. |
| `PORT` | optional (default `8080`) | repo | local `api/.env`, `deploy/render.yaml` | HTTP listen port. |
| `ALLOWED_ORIGINS` | required | repo | local `api/.env`, `deploy/render.yaml` | Comma-separated CORS origins, e.g. the `app.magnifit.co` origin plus local dev origin. The same list is checked against the token `azp`; an empty list disables that check, so it is mandatory in production. |
| `DATABASE_URL` | required | you | local `api/.env`, Render dashboard (`sync: false`) | Postgres URL. Use the Neon **direct** string (pooling off): migrations on boot take a session advisory lock that the pooled connection does not support. In a local `.env`, quote it (`DATABASE_URL="..."`) because it contains `&`. In production it must carry `sslmode=require` (or `verify-ca`/`verify-full`); Neon strings include `sslmode=require` by default. |
| `MIGRATION_DATABASE_URL` | optional | you | local `api/.env`, Render dashboard (`sync: false`) | Postgres URL of the schema owner role, used only for the boot migrations (and their advisory lock); the connection is closed right after. Must be the Neon **direct** string. When unset, migrations run on `DATABASE_URL` as before. Set it together with a least-privilege `DATABASE_URL`: see "Least-privilege database role". |
| `CLERK_SECRET_KEY` | required | you | local `api/.env`, Render dashboard (`sync: false`) | Clerk secret key. Secret. |
| `CLERK_JWT_KEY` | optional, recommended in production | you | local `api/.env`, Render dashboard (`sync: false`) | Clerk JWT public key (dashboard > API keys > JWKS public key; PEM or the single-line form). When set, session tokens are verified without calling the Clerk API, so forged tokens cannot spend the instance's API quota. An invalid value stops the service at startup. Public key, not a secret. If the signing key is rotated in Clerk, update this value in the same step: until then every request answers 401. |
| `TEST_DATABASE_URL` | tests only | you / CI | local shell or `api/.env`; CI service container | Disposable Postgres the integration tests truncate. Never point it at real data. Tests skip when unset. |

## Least-privilege database role (optional)

By default the API connects as the schema owner, so a leaked `DATABASE_URL` could alter or drop the schema. To limit it, run the API as a role that only reads and writes rows, and give the owner URL to the boot migrations alone.

The API only needs `SELECT`, `INSERT`, `UPDATE` and `DELETE` on the tables, plus `USAGE` on the sequences: the sync triggers call `nextval('change_seq')` as the invoking role. `ON DELETE CASCADE` needs only `DELETE`. It never runs `TRUNCATE`, DDL or `CREATE EXTENSION` at runtime (only the migrations do).

1. Create the role. In the Neon SQL editor, connected to the production database as the owner role. Replace `<owner_role>` with the role in your owner connection string (for example `neondb_owner`), `<database>` with the database name, and use your own password:

   ```sql
   CREATE ROLE magnifit_app LOGIN PASSWORD '<strong-password>';
   GRANT CONNECT ON DATABASE <database> TO magnifit_app;
   GRANT USAGE ON SCHEMA public TO magnifit_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO magnifit_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO magnifit_app;
   -- Tables and sequences created by future migrations (run as <owner_role>) stay covered.
   ALTER DEFAULT PRIVILEGES FOR ROLE <owner_role> IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO magnifit_app;
   ALTER DEFAULT PRIVILEGES FOR ROLE <owner_role> IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO magnifit_app;
   ```

   `ALTER DEFAULT PRIVILEGES` applies only to objects created by `<owner_role>`, so keep running the migrations as that same role.

2. Build the app role's connection string: the owner's direct string with the user and password replaced by `magnifit_app` and its password.

3. Roll out in this order (each step is a Render env change plus a deploy):
   1. Create the role (step 1). Nothing changes for the running API.
   2. Set `MIGRATION_DATABASE_URL` to the current owner direct string. The API still serves as the owner.
   3. Set `DATABASE_URL` to the `magnifit_app` string. Check `/readyz` and a sync from the app.

   To roll back, set `DATABASE_URL` back to the owner string; `MIGRATION_DATABASE_URL` can stay.

4. Keep `MIGRATION_DATABASE_URL` set from now on: with only the app role, a deploy that ships a new migration fails at boot with `permission denied`.

## Rules

- Secrets (`DATABASE_URL`, `MIGRATION_DATABASE_URL`, `CLERK_SECRET_KEY`) are `sync: false` in the Blueprint: set them in the dashboard only.
- Add new variables here and in the matching `.env.example` in the same change.
