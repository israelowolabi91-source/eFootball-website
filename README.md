# Tim eFootball League

## Run the website

Use Node.js 22 or newer:

```powershell
npm install
npm start
```

Open `http://localhost:3000`. The root page opens sign-in first. Account creation is on a separate `/signup.html` page; `/register.html` remains an alias. Do not open the pages directly as `file://` URLs: authentication and records use the server API.

## Authentication and account data

Accounts, verification-token hashes, session-token hashes, and W-D-L records are stored in SQLite at `data/efootball.sqlite` by default. The server imports the legacy `data/users.json` once when it initializes a new database. Passwords for new accounts are bcrypt hashes. Legacy scrypt hashes are upgraded to bcrypt after the account successfully signs in.

Only `@gmail.com` addresses are accepted for account creation. Verification links are random, single-use tokens that expire after 24 hours; only their SHA-256 hashes are stored. Sign-in is blocked until verification. Authenticated sessions use an HttpOnly, SameSite=Lax cookie with a seven-day lifetime; `Secure` is enabled in production or for HTTPS requests.

`GET /api/me` returns the signed-in user's name, email, gamer name, and records. `POST /api/records` accepts validated `wins`, `draws`, and `losses` for the signed-in account. `POST /api/auth/logout` revokes the active session and clears its cookie. Login and account creation have IP-based rate limits.

## Configuration

Copy `.env.example` to `.env`. Configure a verified SMTP sender to deliver verification and match emails. For Gmail SMTP, use a Google App Password, not your regular Gmail password. Set `BASE_URL` to the public HTTPS origin when deploying. Keep `.env`, the SQLite database, match data, and evidence private; use persistent protected storage in production.

`DATABASE_FILE` optionally sets the SQLite database path. `USERS_FILE` optionally points to the legacy JSON file used for the one-time import. `MATCHES_FILE` and `MATCH_EVIDENCE_DIR` configure match storage.

For owner review, set `OWNER_EMAIL` and a unique `OWNER_REVIEW_TOKEN` of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Without both settings, ranked results cannot be approved.

## Matches and rankings

The Match Centre and live Rankings use the same saved player profiles and approved ranked W-D-L records. Ranked-match totals equal wins + draws + losses. Ranked results change ratings only after owner approval; friendly matches do not. Illustrative fixtures and season previews are not live results.
