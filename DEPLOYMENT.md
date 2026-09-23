# Deploying E-MOORM

One Node process serves both the REST API and the React app on a single
domain. That is what lets search engines and link previews receive real
per-page HTML, and it means there is no CORS configuration to get wrong.

```
https://your-domain
 ├── /            React app (built, served by Express)
 ├── /product/…   real <title>, description and JSON-LD per product
 ├── /api/…       REST API
 ├── /uploads/…   user-uploaded images
 ├── /robots.txt  generated
 └── /sitemap.xml generated from the live catalogue
```

---

## 1. Requirements

| | Version |
|---|---|
| Node.js | 20 LTS or newer |
| MySQL | 8.0 or newer |
| Reverse proxy | nginx or Caddy, terminating TLS |

The app **refuses to start** in production behind plain HTTP. TLS must be
terminated by the proxy, which then forwards `X-Forwarded-Proto: https`.

---

## 2. Configuration

Copy `backend/.env.example` to `backend/.env` and fill it in. The server
validates this at boot and exits rather than run misconfigured.

### Generate the secrets

Never reuse the development values, and never use the same value twice:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_REFRESH_SECRET
```

### Required in production

| Variable | Notes |
|---|---|
| `NODE_ENV` | Must be `production`. Anything else leaves stack traces in API responses. |
| `DATABASE_URL` | `mysql://user:pass@host:3306/emoormdb` |
| `JWT_SECRET` | 32+ chars, unique |
| `JWT_REFRESH_SECRET` | 32+ chars, **different from `JWT_SECRET`** |
| `SITE_URL` | `https://your-domain`, no trailing slash. Every canonical link, sitemap entry and social preview URL is built from this. |
| `FRONTEND_URL` | Same as `SITE_URL` for this single-domain setup. |
| `ALLOWED_ORIGINS` | Same as `SITE_URL`. Must not contain `localhost`. |
| `WEB_DIST_DIR` | Path to the built app, e.g. `/srv/emoorm/web/dist`. Leave empty only if you are running API-only. |

### Worth setting

| Variable | Why |
|---|---|
| `CACHE_REDIS_URL` | Without it each instance keeps its own cache. Fine on one box, wasteful on several. |
| `SITE_INDEXABLE=false` | On staging. `robots.txt` then disallows everything and `sitemap.xml` 404s, so a test copy never competes with production in Google. |
| `RESEND_API_KEY` / SMTP | Transactional email. Without one, password resets and receipts do not send. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. |

---

## 3. Build and run

```bash
# 1. Backend dependencies and database
cd backend
npm ci --omit=dev
npx prisma migrate deploy      # never `migrate dev` on a live database
npx prisma generate

# 2. Frontend build
cd ../web
npm ci
npm run build                  # writes web/dist

# 3. Start
cd ../backend
NODE_ENV=production node server.js
```

The frontend build needs no API URL: a production bundle calls `/api` and
loads images from `/uploads` relative to whatever domain it is served from.
`web/.env.production` can override that if you ever split the two apart.

**Google sign-in:** add the production domain to the authorised JavaScript
origins in the Google Cloud console, and set `VITE_GOOGLE_CLIENT_ID` before
building. It is baked into the bundle at build time, not read at runtime.

### Keeping it running

Use a supervisor that restarts on exit and sends `SIGTERM` to stop. The
process closes its listener, drains in-flight requests, disconnects from MySQL
and then exits, with a 10-second backstop — so a deploy does not drop an order
someone is placing.

```ini
# /etc/systemd/system/emoorm.service
[Unit]
Description=E-MOORM
After=network.target mysql.service

[Service]
Type=simple
User=emoorm
WorkingDirectory=/srv/emoorm/backend
EnvironmentFile=/srv/emoorm/backend/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

---

## 4. Reverse proxy

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain;

  # ssl_certificate … (certbot or your provider)

  # Product photos can be large; the default 1m rejects legitimate uploads.
  client_max_body_size 12m;

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    # Required. Without it the app sees plain HTTP and refuses the request.
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name your-domain;
  return 301 https://$host$request_uri;
}
```

The app sets `trust proxy` to exactly one hop in production. If you add a CDN
or a second proxy in front, that number has to change — otherwise rate limits
bucket every visitor together, or trust a header anyone can forge.

**Uploads live on disk** at `backend/uploads`. Back it up, and mount it as a
volume if you containerise, or every deploy deletes everyone's photos.

---

## 5. After the first deploy

1. `curl https://your-domain/health` → `{"success":true,"database":"up"}`
2. `curl https://your-domain/robots.txt` → the sitemap line shows your domain, not localhost
3. `curl https://your-domain/sitemap.xml | grep -c "<loc>"` → matches roughly your live product count
4. Open a product page and **view source** (not devtools — source). The
   `<title>`, description and JSON-LD must name that product. This is exactly
   what Googlebot and Facebook see.
5. Register the domain in [Google Search Console](https://search.google.com/search-console),
   submit `https://your-domain/sitemap.xml`, and use **URL Inspection → Test
   live URL** on one product page.
6. Check a product link in the
   [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) —
   title, description and image should all appear.
7. Validate one product page with the
   [Rich Results Test](https://search.google.com/test/rich-results). It should
   report a valid **Product** with price and availability, which is what earns
   the price and stock line in search results.

---

## 6. Security checklist

- [ ] `NODE_ENV=production` — otherwise API errors include stack traces
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are new, long, and different from each other
- [ ] `.env` is not in version control and is readable only by the service user
- [ ] **Rotate any key that has ever been pasted into a chat, terminal or commit.** A secret that has been shown once is public. In this project that includes the Resend API key.
- [ ] TLS terminates at the proxy and `X-Forwarded-Proto` is set
- [ ] MySQL is not reachable from the internet
- [ ] `backend/uploads` is backed up
- [ ] Database backups are scheduled and a restore has actually been tested

---

## 7. Routine operations

**Deploying an update**

```bash
git pull
cd backend && npm ci --omit=dev && npx prisma migrate deploy && npx prisma generate
cd ../web && npm ci && npm run build
sudo systemctl restart emoorm
```

**A migration that fails halfway** leaves Prisma refusing to continue. Inspect
it, fix the SQL, then mark the failed one rolled back before retrying:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
npx prisma migrate deploy
```

**The sitemap is cached for 30 minutes.** A newly approved product appears
after that, or immediately after a restart.

**Never run `prisma migrate dev` or `prisma db push` against production** —
both can drop data to reconcile the schema.
