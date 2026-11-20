# Cloud Deployment Guide: Tim eFootball League

This platform is containerized and pre-configured for cloud deployment with persistent disk support for the SQLite database (`efootball.sqlite`), match records, and uploaded screenshots.

---

## Option 1: Render (Recommended - Free Tier & Persistent Disk)

Render provides persistent disk mounts and automatic SSL certificates (`https://`).

### 1-Click / Blueprint Setup:
1. Create a free account at [render.com](https://render.com).
2. Go to your **Render Dashboard** and click **New +** > **Blueprint**.
3. Connect your GitHub / GitLab repository containing this project.
4. Render will automatically detect [`render.yaml`](./render.yaml) and configure:
   - **Environment**: Node 20
   - **Persistent Disk**: 1 GB mounted at `/var/data`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In the Environment Variables screen on Render, set the private values for `OWNER_EMAIL`, `OWNER_REVIEW_TOKEN`, `ADMIN_KEY`, `SMTP_USER`, `SMTP_PASS`, and `BASE_URL`. Generate new unique secrets in your hosting dashboard; never commit them to this repository.
6. Click **Apply**. Your website will be live in 2–3 minutes with automatic HTTPS.

---

## Option 2: Railway (Deploy via Web or Terminal)

Railway supports our [`Dockerfile`](./Dockerfile) and [`Procfile`](./Procfile).

### Method A: Deploy from Terminal (CLI)
1. Run login command:
   ```cmd
   cmd /c npx @railway/cli login
   ```
2. Link or create a project:
   ```cmd
   cmd /c npx @railway/cli init
   ```
3. Deploy the project:
   ```cmd
   cmd /c npx @railway/cli up
   ```
4. In Railway dashboard, go to **Settings** > **Volumes** > **Add Volume** and mount it to `/app/data`.
5. Add your Environment Variables in the Railway **Variables** tab.

### Method B: Deploy via GitHub
1. Push your repository to GitHub.
2. Go to [railway.app](https://railway.app) > **New Project** > **Deploy from GitHub repo**.
3. Railway automatically detects the [`Dockerfile`](./Dockerfile) and starts the service.
4. Attach a Volume mounted to `/app/data` to ensure live database edits never reset.

---

## Production Environment Variables Reference

| Variable Name | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables optimized production caching & performance |
| `PORT` | Set automatically by cloud host | Listening port |
| `DATA_DIR` | `/var/data` or `/app/data` | Path to persistent disk for SQLite & match data |
| `BASE_URL` | `https://your-domain.com` | Public canonical URL for OAuth & email links |
| `OWNER_EMAIL` | Set in hosting environment | Master administrative user email |
| `OWNER_REVIEW_TOKEN` | 64-char hex token | Secret master key for Admin Console operations |
| `ADMIN_KEY` | Unique random secret | Optional administrator key; no built-in default exists |
| `ADMIN_PASSWORD` | Unique random secret | Optional administrator password; no built-in default exists |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail SMTP server for verification & match alerts |
| `SMTP_PORT` | `465` | Secure SSL port |
| `SMTP_SECURE` | `true` | SSL encryption flag |
| `SMTP_USER` | Set in hosting environment | Sender address |
| `SMTP_PASS` | Set in hosting environment | Provider-specific SMTP credential |

Any credentials previously stored in this file must be revoked and replaced in the hosting provider. Removing them from the current file does not erase them from prior Git history.

## Request protections and account privacy

The server applies security headers to responses and checks the `Origin` header on API mutations. Keep the public site and API on the same origin; cross-origin browser clients are intentionally rejected. Signed-in mutations without an `Origin` header are rejected. Session cookies are `HttpOnly` and use `SameSite=Lax`.

API JSON responses redact email addresses, including administrator responses. The admin console uses player IDs for account actions; email changes can be submitted without exposing the current address. Validate these protections against the deployed HTTPS origin after each proxy or domain change.

The admin console is not linked from public navigation and `/admin.html` is served only to a signed-in admin account. Administrators should sign in through the normal account page first, then open `/admin.html` directly. Non-admin visitors receive a not-found response.
