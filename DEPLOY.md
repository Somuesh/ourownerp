# Deploying Our ERP on Render (free)

Render's free plan has 512 MB RAM, which is not enough to run `vite build`. So the
frontend is **built on your computer and committed as `dist/`**; Render only installs
the server and serves that folder.

## 1. Build the frontend locally
Create `.env.production.local` in the project root (git-ignored):
```
VITE_API_URL=https://our-erp-api.onrender.com
VITE_OIDC_AUTHORITY=<same as OIDC_AUTHORITY>
VITE_OIDC_CLIENT_ID=<same as OIDC_CLIENT_ID>
VITE_OIDC_CLIENT_SECRET=<only for Google>
```
Then:
```bash
pnpm install
pnpm exec vite build      # creates dist/
```
Redo this step whenever you change anything under `src/` or any `VITE_*` value.

## 2. Push to GitHub (including dist/)
```bash
git add -A && git commit -m "Update build" && git push
```
`dist/` is not ignored on purpose. `.env*` files are, so secrets stay out of git
(except the OIDC values baked into the public JS, which are visible to every visitor anyway).

## 3. Render
New -> Blueprint -> pick the repo. It creates the Postgres DB and the `our-erp-api`
service (runs `pnpm db:push --force` on every start, then the server, which also serves `dist/`).
Set `OIDC_AUTHORITY` and `OIDC_CLIENT_ID` (and optionally SMTP / AI keys).
If Render gives your service a different URL (name taken), update `VITE_API_URL` and `APP_URL`, rebuild, push.

## 4. Login provider
Add `https://our-erp-api.onrender.com/auth/callback` as a redirect URI (Google: also add the origin
under "Authorized JavaScript origins").

## 5. First login = admin
The first person to sign in becomes **admin**; everyone after needs an invite (Settings -> Users).
Sign in yourself before sharing the link.

## Notes
- Free web services sleep after ~15 min idle (about a minute to wake); an uptime pinger on `/health` keeps it awake. Free Postgres on Render expires after 30 days; Neon/Supabase free Postgres is an alternative.
- Google needs a client secret, visible in the site's JS. Fine for a test group; for real use pick Auth0/Okta/Keycloak with a public (PKCE) client.
- `db:push` is for easy setup. For a long-lived DB, commit migrations (`pnpm db:generate`) and use `pnpm db:migrate` instead.
- Never set `DEV_AUTH_BYPASS=true` on a public deployment.
