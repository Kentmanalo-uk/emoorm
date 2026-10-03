# Deploying E-MOORM on Hostinger (Node.js web app)

One Node app serves everything on **emoorm.shop**: the web pages *and* the
API (`/api/...`). Nothing else needs its own domain or port.

## 1. Database (hPanel → Databases → MySQL Databases)

Create a database and a user. Note the database name, user and password.
The app must connect to host **127.0.0.1** (not `localhost`: on Hostinger
that can resolve to IPv6, which the database user is not allowed to use):

```
mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE
```

(URL-encode special characters in the password: `@` → `%40`, `#` → `%23`, ...)

## 2. Folder for uploads (hPanel → File Manager)

Uploads must live **outside** the app folder, or a redeploy would wipe every
product photo and ID document. Create:

```
/home/<your-user>/emoorm-data/uploads
/home/<your-user>/emoorm-data/uploads-private/kyc
```

(`<your-user>` is shown at the top of File Manager, e.g. `u123456789`.)

## 3. Node.js app (hPanel → Websites → emoorm.shop → Node.js)

| Setting        | Value                         |
| -------------- | ----------------------------- |
| Source         | GitHub: `Kentmanalo-uk/emoorm`, branch `main` |
| Root directory | `/` (repository root)         |
| Node version   | 20 or newer                   |
| Build command  | `npm run build`               |
| Start command  | `npm start`                   |
| Entry file     | `server.js`                   |

`npm start` applies pending database migrations (`prisma migrate deploy`:
it only runs the migration files in the repo, never resets data), then
starts the server.

This replaces the static copy of the web app that is on emoorm.shop now;
the Node app serves the same pages plus the API they need.

## 4. Environment variables (Node.js app → Environment variables)

Generate secrets on any computer with Node:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
(run it twice for the two JWT secrets; they must differ). For the identity
key use `randomBytes(32)`.

**Required**

| Name | Value |
| ---- | ----- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the MySQL string from step 1 |
| `SITE_URL` | `https://emoorm.shop` |
| `FRONTEND_URL` | `https://emoorm.shop` |
| `ALLOWED_ORIGINS` | `https://emoorm.shop` |
| `JWT_SECRET` | random, 96 hex chars |
| `JWT_REFRESH_SECRET` | random, different from `JWT_SECRET` |
| `IDENTITY_ENCRYPTION_KEY` | random, 64 hex chars (keep it forever: it decrypts stored ID data) |
| `UPLOAD_DIR` | `/home/<your-user>/emoorm-data/uploads` |
| `PRIVATE_UPLOAD_DIR` | `/home/<your-user>/emoorm-data/uploads-private/kyc` |
| `GOOGLE_CLIENT_ID` | from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `VITE_GOOGLE_CLIENT_ID` | same as `GOOGLE_CLIENT_ID` (used while building the web app) |

**Email (password resets, notifications)**

| Name | Value |
| ---- | ----- |
| `RESEND_API_KEY` | a **new** Resend key |
| `RESEND_FROM` | e.g. `E-MOORM <noreply@emoorm.shop>` (domain verified in Resend) |

**Optional**: `SITE_NAME=E-MOORM`, `OCR_CACHE_PATH=/home/<your-user>/emoorm-data/.ocr-cache`,
`SENTRY_DSN` (error alerts; see step 6). `TRUST_PROXY_HOPS` defaults to 1, which is
right for Hostinger alone; set it to 2 only if you put a CDN such as Cloudflare
in front. A wrong value makes every visitor share one login rate limit.
**Optional, off until set**:

- Browser push notifications: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (make a pair once with
  `npx web-push generate-vapid-keys`, on your computer) and `VAPID_SUBJECT=mailto:support@emoorm.shop`.
  The Android app cannot receive these; it would need Firebase (FCM).
- SMS verification of mobile numbers: `SEMAPHORE_API_KEY` from semaphore.co (and
  `SEMAPHORE_SENDER_NAME` once approved). `COD_REQUIRES_VERIFIED_PHONE=true` then makes
  cash on delivery need a verified number.

Leave `CACHE_REDIS_URL` empty: Hostinger web hosting has no Redis and the
app uses its in-memory cache instead. Do **not** set `PORT` unless hPanel
tells you to; Hostinger provides it.

## 5. Google sign-in (Google Cloud Console → Credentials → OAuth client)

Authorized JavaScript origins: `https://emoorm.shop` (and
`https://www.emoorm.shop` if the www address is used).

## 6. First deploy and checks

1. Deploy from hPanel and watch the build log (it builds the web app, then
   installs the backend and generates the Prisma client).
2. On a brand-new database, load the reference data once (municipalities,
   categories, ...) by importing a database dump (step 8). Do not run the
   seed here: it creates demo shops and accounts with published passwords,
   and refuses to run outside development unless SEED_DEMO_DATA=yes.
3. Open `https://emoorm.shop/health`: it should say `"database":"up"`.
4. Open the site, sign in, upload a product photo, and redeploy once: the
   photo must still be there (proves `UPLOAD_DIR` is outside the app).
5. Set up an uptime monitor (free: UptimeRobot or Better Stack) that opens
   `https://emoorm.shop/health` every 5 minutes and emails you when it fails.
   It answers 503, not 200, when the database is down, a migration failed,
   or a background job (auto-complete, unpaid-order expiry) stopped running,
   so one monitor covers all of them. It also shows "email": "none" when
   mail is not set up; check that once after each change of keys.
6. Optional error alerts: create a free Sentry project, add its DSN as
   `SENTRY_DSN`, and add `@sentry/node` to the backend dependencies. Without
   it, unexpected errors are still logged (one JSON line each) in hPanel's logs.

## 7. Backups (do this before real orders come in)

What to keep, and where it lives:

| What | Where | Why |
|---|---|---|
| The database | MySQL (hPanel → Databases) | users, shops, orders, messages |
| Product, shop and review photos | `/home/<your-user>/emoorm-data/uploads` | not in git, not rebuilt by a deploy |
| ID documents (encrypted) | `/home/<your-user>/emoorm-data/uploads-private` | needed until the retention purge |
| The environment variables, above all `IDENTITY_ENCRYPTION_KEY` and the JWT secrets | your password manager | without the key, stored ID data cannot be read |

1. In hPanel → **Backups**, check that automatic backups are on for the
   site and the database, and how many days they keep.
2. Also run the app's own backup daily: hPanel → **Advanced → Cron Jobs**,
   command `cd /home/<your-user>/<app-folder>/backend && npm run backup`,
   once a day (e.g. 03:00). It writes the database (`database.sql.gz`) and
   the two upload folders (`.tar.gz`) to `emoorm-data/backups/emoorm-<date>/`
   and keeps the newest 7 (`BACKUP_KEEP`, `BACKUP_DIR` to change).
3. Once a week, download the newest backup folder (File Manager) and keep it
   off the server.
4. Test a restore once, on a local copy: `gunzip -c database.sql.gz | mysql -u root emoorm_restore`,
   extract `uploads.tar.gz`, point a local `.env` at them and open the site.

## 8. Moving existing data (optional)

Export the source database (phpMyAdmin/Laragon → Export → SQL), import it in
hPanel → phpMyAdmin, and upload the matching `backend/uploads/` files into
`emoorm-data/uploads` (zip, upload, extract in File Manager).
