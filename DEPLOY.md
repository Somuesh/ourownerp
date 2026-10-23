# Deploying Our ERP on Render

## 1. Push to GitHub
```bash
git init && git add . && git commit -m "Our ERP"
git branch -M main
git remote add origin https://github.com/<you>/our-erp.git
git push -u origin main
```
(`.env` is git-ignored — never commit secrets.)

## 2. Create the Blueprint
Render dashboard → **New → Blueprint** → pick the repo. It reads `render.yaml` and creates:
- `our-erp-db` (Postgres)
- `our-erp-api` (Express API; runs `pnpm db:push --force` before each deploy)
- `our-erp-web` (static React site)

Fill the prompted values (see step 3). Optional ones (SMTP, AI keys) can be left blank.

## 3. Configure login (OIDC)
Use the same provider you use locally (Google, Auth0, Okta...). Add this **redirect URI** in the provider:
```
https://our-erp-web.onrender.com/auth/callback
```
(Add the site's origin under "Authorized JavaScript origins" too, for Google.)
Then set:
- API: `OIDC_AUTHORITY`, `OIDC_CLIENT_ID`
- Web: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` (+ `VITE_OIDC_CLIENT_SECRET` for Google)

`VITE_*` values are baked in at build time — after changing one, **Manual Deploy → Deploy latest commit** on `our-erp-web`.

If Render gave your services different URLs (name taken), update `VITE_API_URL` (web), `APP_URL` (api) and the redirect URI to match.

## 4. First login = admin
The first person to sign in becomes **admin**; everyone after needs an invite (Settings → Users). **Sign in yourself first** before sharing the link.

## Notes
- Free web services sleep after ~15 min idle (first request takes ~30–60 s); voice chat sessions are in memory and reset on restart. Free Postgres is deleted after 30 days — upgrade the plan to keep data.
- Google requires a client secret, and `VITE_OIDC_CLIENT_SECRET` is visible to anyone who opens the site's JS. Fine for a test group; for real use switch to Auth0/Okta/Keycloak with a public (PKCE) client, which needs no secret.
- `db:push` is used for easy setup. For a long-lived production DB, commit migrations (`pnpm db:generate`) and switch the pre-deploy command to `pnpm db:migrate`.
- Never set `DEV_AUTH_BYPASS=true` on a public deployment.
