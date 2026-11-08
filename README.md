# E-MOORM

The online marketplace for the shops of Oriental Mindoro: emoorm.shop.

## What is where

| Folder | What |
|---|---|
| `backend/` | the API: Express, Prisma, MySQL (also serves the built web app) |
| `web/` | the website and installable web app: React, Vite |
| `mobile/` | the Android/iOS app: Expo, React Native |
| `livestream/` | E-MOORM Live, the live-selling server and player |
| `server.js`, `package.json` | the Hostinger entry point and build: one Node app for pages and /api |
| `docs/` | how it is deployed and hosted, the handoff notes, the system overview |
| `media/store-listing/` | the Google Play listing graphics |
| `.github/` | CI |

Kept on the developer's PC only (not in git):

| Folder | What | Why it is here |
|---|---|---|
| `media/` | banners, posts, videos, the official logos (`brand/logos`, read by web/scripts) and **emoorgine**, the engine that makes them | marketing material; see media/README.md |
| `docs/private/` | manuals, decks, notes, the site's screenshots by role (mobile/tools/web-screens.cjs) | documents, not code |
| `apk/` | Android: the release signing key (`keystore/`), the app's built releases (`releases/`: .apk, .aab) and the older website-as-an-app project | mobile/android's build reads the key from `apk/keystore`; mobile/tools/release-android.cjs writes to `apk/releases` |
| `production-uploads/` | a copy of the live site's uploads | a backup; private |
| `moormove/` | MoorMove, the rider app | its own repository |

## Run it

See `docs/DEPLOYMENT.md` (deploying), `docs/HOSTINGER.md` (the hosting
account) and `docs/AI_HANDOFF.md` (where things stand).
