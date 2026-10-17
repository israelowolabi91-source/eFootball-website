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
5. In the Environment Variables screen on Render, fill in your secrets:
   - `OWNER_EMAIL`: `owolabimichael704@gmail.com`
   - `OWNER_REVIEW_TOKEN`: `88da9a1f506ecfbb8455aa58a14991bfdd6631cd6a74ce609e6eb2848e55afa0`
   - `SMTP_USER`: `owolabimichael704@gmail.com`
   - `SMTP_PASS`: `zjmfeoqaasklodji`
   - `BASE_URL`: `https://<your-render-subdomain>.onrender.com`
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
| `OWNER_EMAIL` | `owolabimichael704@gmail.com` | Master administrative user email |
| `OWNER_REVIEW_TOKEN` | 64-char hex token | Secret master key for Admin Console operations |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail SMTP server for verification & match alerts |
| `SMTP_PORT` | `465` | Secure SSL port |
| `SMTP_SECURE` | `true` | SSL encryption flag |
| `SMTP_USER` | `owolabimichael704@gmail.com` | Gmail sender address |
| `SMTP_PASS` | `zjmfeoqaasklodji` | Gmail app password |

