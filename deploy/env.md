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
| `APP_ENV` | optional | repo | local `api/.env`, `deploy/render.yaml` (`production`) | Environment name. |
| `PORT` | optional (default `8080`) | repo | local `api/.env`, `deploy/render.yaml` | HTTP listen port. |
| `ALLOWED_ORIGINS` | required | repo | local `api/.env`, `deploy/render.yaml` | Comma-separated CORS origins, e.g. the `app.magnifit.co` origin plus local dev origin. |
| `DATABASE_URL` | required | you | local `api/.env`, Render dashboard (`sync: false`) | Postgres URL. Use the Neon **direct** string (pooling off): migrations on boot take a session advisory lock that the pooled connection does not support. In a local `.env`, quote it (`DATABASE_URL="..."`) because it contains `&`. |
| `CLERK_SECRET_KEY` | required | you | local `api/.env`, Render dashboard (`sync: false`) | Clerk secret key. Secret. |
| `CLERK_JWT_KEY` | optional, recommended in production | you | local `api/.env`, Render dashboard (`sync: false`) | Clerk JWT public key (dashboard > API keys > JWKS public key; PEM or the single-line form). When set, session tokens are verified without calling the Clerk API, so forged tokens cannot spend the instance's API quota. An invalid value stops the service at startup. Public key, not a secret. |
| `TEST_DATABASE_URL` | tests only | you / CI | local shell or `api/.env`; CI service container | Disposable Postgres the integration tests truncate. Never point it at real data. Tests skip when unset. |

## Rules

- Secrets (`DATABASE_URL`, `CLERK_SECRET_KEY`) are `sync: false` in the Blueprint: set them in the dashboard only.
- Add new variables here and in the matching `.env.example` in the same change.
