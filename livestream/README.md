# livestream/ — E-MOORM Live

Live selling that runs on E-MOORM itself. It uses no video service and no
media server, and it records nothing.

```
seller's browser                     backend (this module)                 viewer
camera ─ WebCodecs ─ 1 s fMP4 ─PUT/POST─▶ last 8 pieces in memory ─GET─▶ Media Source / HLS
(client/publisher.js, fmp4.js)        (server/sessions.js, router.js)    (client/player.js)
                       comments, hearts, pins: long-poll /events (client/events.js)
```

- **Server:** `server/` is an Express router with no packages of its own. The
  backend mounts it at `/api/live` in `backend/src/app.js`, ahead of the API's
  rate limit and request queue, because viewers hold requests open. The
  backend also hands it the shop data it needs, through
  `backend/src/services/live.hooks.js`.
- **Client:** `client/` holds the browser code. The website imports it through
  `web/src/lib/live.js`, and Vite is allowed to read the folder
  (`web/vite.config.js`). `mic-worklet.js` is served by the router rather
  than bundled, because the site's CSP refuses `data:` worklets.
- **Memory only:** each live keeps about 8 seconds of video, about 2 MB.
  When a live ends, or the server restarts, it is gone. After a restart the
  seller's page starts a new live by itself.
- **Delay:** viewers are about 2–3 seconds behind the seller. The player
  speeds up or slows down slightly to stay there.
- **Going live** needs WebCodecs: Chrome or Edge on Android or a computer.
  Any modern browser can watch, and iPhones older than iOS 17.1 get the HLS
  playlist.

Tests: `backend/tests/livestream.test.js`.
