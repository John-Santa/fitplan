# Deploy

One environment (production). Convention reference: the atlas repo (Render + Neon + Clerk).

## Topology

```
Browser (PWA, offline-first)
  |-- https://app.magnifit.co  -> Render static site  (magnifit-web, from web/)
  |-- https://api.magnifit.co  -> Render web service  (magnifit-api, Docker from api/)
                                    |-- Neon Postgres (pooled URL, runtime)
                                    |-- Clerk (clerk.magnifit.co, production instance)
```

- Blueprint: `deploy/render.yaml` (both services, auto-deploy on `main`).
- Health: `GET /readyz` on the API (Render health check).
- Env names: `deploy/env.md`. Secrets are set in the Render dashboard, never in git.
- The GitHub Pages workflow (`.github/workflows/deploy.yml`) stays live until the Render site takes over.

## First-time setup checklist (you)

1. Neon: create a project (same region family as Render, e.g. AWS us-west-2 for `oregon`). Copy the **pooled** connection string (host contains `-pooler`).
2. Clerk: create a **Production** instance for `magnifit.co`. Copy the publishable key (`pk_live_...`) and secret key (`sk_live_...`). Clerk shows the DNS records it needs (domain `clerk.magnifit.co` plus mail/DKIM CNAMEs).
3. Render: New > Blueprint > select this repo > path `deploy/render.yaml`.
4. In the Render dashboard set the `sync: false` variables:
   - `magnifit-api`: `DATABASE_URL` (Neon pooled), `CLERK_SECRET_KEY`.
   - `magnifit-web`: `VITE_CLERK_PUBLISHABLE_KEY`.
5. Run migrations once against Neon (use the direct, non-pooled URL for DDL): from `api/`, the goose command in `api/README.md`.
6. Add the custom domains in Render (the Blueprint declares them; confirm they verify) and create the DNS records below in GoDaddy.
7. Wait for TLS issuance, then check `https://api.magnifit.co/readyz` and sign in at `https://app.magnifit.co`.
8. Remember: the free web service sleeps after inactivity, so the first request can take about a minute.

## DNS records (GoDaddy, zone `magnifit.co`)

Values in angle brackets come from the Render and Clerk dashboards.

| Type | Name | Value | Source |
| --- | --- | --- | --- |
| CNAME | `app` | `<magnifit-web>.onrender.com` | Render, service `magnifit-web` |
| CNAME | `api` | `<magnifit-api>.onrender.com` | Render, service `magnifit-api` |
| CNAME | `clerk` | `<value shown by Clerk>` (frontend API) | Clerk, Domains |
| CNAME | `accounts` | `<value shown by Clerk>` | Clerk, Domains |
| CNAME | `clkmail` | `<value shown by Clerk>` (mail) | Clerk, Domains |
| CNAME | `clk._domainkey` | `<value shown by Clerk>` (DKIM) | Clerk, Domains |
| CNAME | `clk2._domainkey` | `<value shown by Clerk>` (DKIM) | Clerk, Domains |

Use exactly the records Clerk lists for your instance; the Clerk rows above are the usual set and may differ. Keep the apex (`magnifit.co`) untouched unless you decide to point it somewhere.

## Rollback

- API or web: Render dashboard > service > Events/Deploys > pick a previous successful deploy > Rollback. Auto-deploy can be paused from the service settings while investigating.
- Database: migrations are goose; roll back with the goose `down` for the last migration only when it is reversible and no data would be lost. Prefer forward fixes; Neon also offers point-in-time restore on its branches.
- Frontend regressions can also be served from GitHub Pages (`deploy.yml`) while that deploy remains live.
