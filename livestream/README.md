# livestream/ — E-MOORM Live

Live selling that runs on E-MOORM itself. It uses no video service and no
media server, and it records nothing.

```
seller's browser                     backend (this module)                 viewer
camera ─ WebCodecs ─ 0.2 s fMP4 ─POST─▶ last 8 seconds in memory ─streamed GET─▶ Media Source / HLS
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
- **Pieces:** a key frame comes every second, and the second goes up in
  pieces of a fifth of a second. A viewer asks for each second before it
  exists and gets it as one streamed response, piece by piece as each
  arrives. A finished second is a plain cacheable file, which is what the
  HLS playlist lists.
- **Live sync (player.js `steer`):** keeps each viewer a set distance behind
  the newest video by playing slightly faster or slower. The distance
  starts at 0.6 s. It grows each time the picture has to stop and wait, and
  shrinks again after a calm spell. The player also steps over holes left
  by pieces the seller could not send.
- **Delay**, measured from camera to screen: about 0.9 s on a good
  connection and about 1.1 s on weak data, plus the round trip to the
  server.
- **Slow seller uploads:** pieces that pile up go up together in one
  request, and the picture gets lighter. Two seconds behind, what is
  waiting is dropped and the next second starts at once, so viewers skip
  the lost moment instead of watching it arrive late.
- **Going live** needs WebCodecs: Chrome or Edge on Android or a computer.
  Any modern browser can watch, and iPhones older than iOS 17.1 get the HLS
  playlist.

Tests: `backend/tests/livestream.test.js`.
