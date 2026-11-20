# Tim eFootball League

## Run the website

Install Node.js 18 or newer, then run these commands from this folder:

```powershell
npm install
npm start
```

Open `http://localhost:3000` in the browser. Do not open pages directly as `file://` URLs; the site loads account and match data from the server. Create an account and verify its email before signing in. The Match Centre uses the signed-in account as the challenger; profile selection is never trusted from the browser.

## Configure match challenges

Copy `.env.example` to `.env` and configure SMTP with a verified sender. For Gmail SMTP, use a Google App Password, never your normal Gmail password. Set `BASE_URL` to the public HTTPS origin when deploying; invitation and private match links use this value.

The Match Centre player directory and Rankings player table load player names, Elo, and ranked W–D–L records from server-side profile data. Challenge creation and score reporting require the verified account that owns the player profile. Public player data does not include email addresses.

Participants receive private, expiring email links to view their match. Sign in with the verified account associated with the player profile to accept invitations, report scores, or manage a match. Do not forward private links. The server stores only hashed participant link tokens. Keep SMTP enabled and the server online for delivery.

For owner review, set `OWNER_EMAIL` to the owner’s email address and `OWNER_REVIEW_TOKEN` to a unique random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. The owner receives private review links by email; rotating this token revokes old owner links. Without both settings, ranked results cannot be approved.

Keep `.env`, user data, and screenshots private; use persistent protected storage in production. Only authorized administrators can retrieve evidence. Configure `ADMIN_KEY` and `ADMIN_PASSWORD` with unique secrets in the hosting environment; the server has no built-in administrator credentials.

Live player rankings use verified player profiles (Elo K=32; new profiles start at 1000). Only owner-approved ranked results change ratings and ranked W-D-L records; friendly matches do not. Homepage league totals, recent results, club standings, and personal season summaries are calculated from saved player profiles, approved match records, and administrator-published events. Empty states are shown when the database has no matching records.

Administrators manage tournaments in the Tournaments & Events panel. Each event can define its type, format, platform, schedule, capacity, eligibility, prize breakdown, and event-specific rules. Drafts remain private until published; only published events appear in the public directory and accept registrations.
