# livestream/ — E-MOORM Live

Live selling that runs on E-MOORM itself. It uses no video service and no
media server, and it records nothing.

```
seller's browser                     backend (this module)                 viewer
camera ─ WebCodecs ─ 1 s fMP4 ─POST─▶ last 8 seconds in memory ─GET (whole seconds)─▶ Media Source / HLS
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
- **Pieces:** a key frame comes every second, and each second goes up whole
  in one request, up to three requests at a time (through Hostinger's CDN a
  request takes one to three seconds, longer than the second it carries).
  The server holds a second that arrives ahead of a missing one for up to
  3 s, so seconds are kept and served in order. A viewer asks for the next
  seconds before they exist and gets each one whole, once it is complete.
  Never stream a second as it fills: the CDN (`Server: hcdn`) holds a
  growing response back and viewers got nothing ("Catching up…").
- **Viewing (player.js):** asks for three seconds at once, starts two
  finished seconds back and plays about three seconds behind, a touch
  faster or slower to hold that; it jumps ahead past 6.5 s and steps over
  holes or a picture that has stopped with video after it. Each request
  gives up after 12 s, and when no second has come in for 5 s while the
  server has newer ones (a request lost in the CDN: seen on emoorm.shop, the
  picture froze for good), or the browser's video failed, the player
  rebuilds itself at now.
- **Delay**, camera to screen: about 3–5 s on the live site. Comments and
  hearts go by their own long-poll and stay near real time.
- **Slow seller uploads:** two seconds behind, the picture gets lighter;
  four, the oldest whole second waiting is dropped (never half a second).
- **History:** an under-a-second version (fifth-of-a-second pieces,
  streamed responses, Low-Latency HLS) worked locally but froze on
  emoorm.shop behind the CDN; the server still accepts parts and serves the
  LL-HLS playlist, but the website and app no longer use them.
- **Going live** needs WebCodecs: Chrome or Edge on Android or a computer.
  Any modern browser can watch, and iPhones older than iOS 17.1 get the HLS
  playlist.

Tests: `backend/tests/livestream.test.js`.
