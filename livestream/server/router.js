/*
 * The live selling API, mounted by the backend at /api/live.
 *
 *   GET  /                         lives on now (?storeId= for one shop)
 *   POST /                         seller: go live { title, productIds }
 *   GET  /:id                      a live, with its product bag
 *   GET  /:id/events?v=&viewer=    news after version v (held until there is some)
 *   GET  /:id/init/:epoch.mp4      the video's set-up piece
 *   GET  /:id/seg/:seq.m4s         one second of video, streamed piece by piece while it is filled
 *   GET  /:id/live.m3u8            the same video as a Low-Latency HLS playlist (blocking reload)
 *   GET  /:id/part/:seq/:n.m4s     one piece, for that playlist (the next one waited for)
 *   GET  /:id/thumb.jpg            a still of the live, for lists
 *   GET  /mic-worklet.js           the seller page's microphone tap (see below)
 *   PUT  /:id/init   POST /:id/seg   POST /:id/thumb      the seller's page (X-Live-Key)
 *   POST /:id/comments  POST /:id/comments/:cid/hide  POST /:id/hearts
 *   POST /:id/pin  PUT /:id/bag  POST /:id/end           the seller
 *
 * Mounted before the API's rate limit and its request queue on purpose: a
 * viewer holds one request open while waiting for the next second of video,
 * and those must not take the places of ordinary page loads. It has limits
 * of its own instead.
 */
const fs = require('fs');
const path = require('path');
const lives = require('./sessions');

// The seller's microphone tap, served from here rather than bundled: the
// site's content policy runs worklets only from its own address, not from
// the data: URL a bundler would inline a file this small as.
const MIC_WORKLET = fs.readFileSync(path.join(__dirname, '..', 'client', 'mic-worklet.js'));

const MAX_SEGMENT_BYTES = 3 * 1024 * 1024;
const MAX_INIT_BYTES = 64 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;
const SEG_WAIT_MS = 5000;
// Low-Latency HLS: a blocking playlist reload, and a piece hinted as next.
const PLAYLIST_WAIT_MS = 3000;
const PART_WAIT_MS = 3000;
const EVENTS_WAIT_MS = 20000;
const MAX_BAG = 50;
const MAX_TITLE = 80;
const MAX_COMMENT = 200;

/** A small fixed-window counter per key: { take(key) -> bool }. */
const counter = (windowMs, max) => {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return {
    take(key) {
      const n = (hits.get(key) || 0) + 1;
      hits.set(key, n);
      return n <= max;
    },
  };
};

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, message, extra) => res.status(status).json({ success: false, message, ...extra });

/** The raw body of an upload, up to `limit` bytes. */
const readBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) {
      reject(Object.assign(new Error('Too large'), { status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const int = (v, fallback = -1) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * @param {Object} deps
 * @param {Function} deps.express - the backend's express
 * @param {Function} deps.authenticate - signed in, or 401
 * @param {Function} deps.optionalAuth - req.user when signed in
 * @param {Object} deps.hooks
 * @param {Function} deps.hooks.sellerStore - (user) -> { store, reason }
 * @param {Function} deps.hooks.bagProducts - (storeId, ids) -> products as the public lists show them
 * @param {Function} deps.hooks.profileOf - (userId) -> { name, avatarKey }
 * @param {Function} deps.hooks.isAbusive - (text) -> bool
 */
module.exports = function createLiveRouter({
  express, authenticate, optionalAuth, hooks,
}) {
  const router = express.Router();
  const json = express.json({ limit: '16kb' });

  const startLimit = counter(10 * 60 * 1000, 20);
  const commentLimit = counter(60 * 1000, 20);
  const commentBurst = counter(2000, 1);
  const heartLimit = counter(10 * 1000, 40);
  const pollLimit = counter(60 * 1000, 600);

  const ip = (req) => req.ip || req.socket?.remoteAddress || '?';

  // Loads the live named in the path, or answers 404.
  router.param('id', (req, res, next, id) => {
    const live = lives.get(id);
    if (!live) return fail(res, 404, 'This live has ended.', { status: 'ENDED' });
    req.live = live;
    return next();
  });

  const publisher = (req, res, next) => {
    if (!lives.keyMatches(req.live, req.get('X-Live-Key'))) return fail(res, 403, 'Not your live.');
    if (req.live.status === 'ENDED') return fail(res, 410, 'This live has ended.', { status: 'ENDED' });
    return next();
  };

  const host = (req, res, next) => {
    if (req.user?.id !== req.live.sellerId) return fail(res, 403, 'Only the shop can do that.');
    return next();
  };

  const bagFor = async (storeId, ids) => {
    const clean = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_BAG);
    return clean.length ? hooks.bagProducts(storeId, clean) : [];
  };

  router.get('/mic-worklet.js', (req, res) => {
    res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    res.end(MIC_WORKLET);
  });

  // ── Lists ─────────────────────────────────────────────────────────────

  router.get('/', (req, res) => {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : null;
    const on = lives.onAir()
      .filter((l) => !storeId || l.store.id === storeId)
      .sort((a, b) => lives.viewerCount(b) - lives.viewerCount(a) || b.startedAt - a.startedAt)
      .map(lives.summary);
    res.set('Cache-Control', 'no-store');
    ok(res, on);
  });

  // ── Going live ────────────────────────────────────────────────────────

  router.post('/', authenticate, json, async (req, res, next) => {
    try {
      if (!startLimit.take(req.user.id)) return fail(res, 429, 'You have started too many lives. Please wait a few minutes.');
      const { store, reason } = await hooks.sellerStore(req.user);
      if (!store) return fail(res, 403, reason || 'Only an open shop can go live.');
      const title = String(req.body?.title || '').trim().slice(0, MAX_TITLE) || `${store.name} is live`;
      if (hooks.isAbusive(title)) return fail(res, 422, 'Please choose a friendlier title.');
      const bag = await bagFor(store.id, req.body?.productIds);
      const live = lives.create({
        store, sellerId: req.user.id, title, bag,
      });
      live.bagAt = Date.now();
      return ok(res, { id: live.id, key: live.key, live: lives.summary(live) }, 201);
    } catch (err) {
      if (err.status) return fail(res, err.status, err.message);
      return next(err);
    }
  });

  router.put('/:id/init', publisher, async (req, res, next) => {
    try {
      const epoch = int(req.query.epoch);
      const codecs = String(req.query.codecs || '').slice(0, 80);
      if (epoch < 0 || !/^[a-zA-Z0-9.,]+$/.test(codecs)) return fail(res, 400, 'Bad init.');
      const data = await readBody(req, MAX_INIT_BYTES);
      if (data.length < 16) return fail(res, 400, 'Bad init.');
      lives.putInit(req.live, { epoch, codecs, data });
      return ok(res, { epoch });
    } catch (err) {
      return err.status ? fail(res, err.status, err.message) : next(err);
    }
  });

  router.post('/:id/seg', publisher, async (req, res, next) => {
    try {
      const seq = int(req.query.seq);
      const epoch = int(req.query.epoch);
      const dur = Math.min(10000, Math.max(1, int(req.query.dur, 1000)));
      // No part number: the whole group in one piece.
      const whole = req.query.part == null;
      const part = whole ? 0 : int(req.query.part);
      const last = whole || req.query.last === '1';
      if (seq < 0 || epoch < 0 || part < 0) return fail(res, 400, 'Bad piece.');
      const data = await readBody(req, MAX_SEGMENT_BYTES);
      // Several pieces in one upload (the seller had fallen behind): their
      // sizes and lengths say where each ends.
      const sizes = String(req.query.sizes || '').split(',').filter(Boolean).map((n) => int(n));
      const durs = String(req.query.durs || '').split(',').filter(Boolean).map((n) => int(n, 200));
      if (sizes.length > 1) {
        if (sizes.length > 12 || sizes.some((n) => n <= 0) || sizes.reduce((a, b) => a + b, 0) !== data.length) {
          return fail(res, 400, 'Bad pieces.');
        }
        let at = 0;
        for (let i = 0; i < sizes.length; i += 1) {
          const ok1 = lives.putPart(req.live, {
            seq,
            part: part + i,
            last: last && i === sizes.length - 1,
            epoch,
            dur: Math.min(10000, Math.max(1, durs[i] || 200)),
            data: data.subarray(at, at + sizes[i]),
          });
          if (!ok1) return fail(res, 409, 'Send the init first.');
          at += sizes[i];
        }
        return ok(res, { seq, viewers: lives.viewerCount(req.live) });
      }
      if (!lives.putPart(req.live, {
        seq, part, last, epoch, dur, data,
      })) return fail(res, 409, 'Send the init first.');
      return ok(res, { seq, viewers: lives.viewerCount(req.live) });
    } catch (err) {
      return err.status ? fail(res, err.status, err.message) : next(err);
    }
  });

  router.post('/:id/thumb', publisher, async (req, res, next) => {
    try {
      const data = await readBody(req, MAX_THUMB_BYTES);
      // A JPEG starts FF D8.
      if (data[0] !== 0xff || data[1] !== 0xd8) return fail(res, 400, 'Not a JPEG.');
      req.live.thumb = data;
      req.live.thumbAt = Date.now();
      return ok(res, {});
    } catch (err) {
      return err.status ? fail(res, err.status, err.message) : next(err);
    }
  });

  router.post('/:id/end', optionalAuth, (req, res) => {
    const mine = req.user?.id === req.live.sellerId || lives.keyMatches(req.live, req.get('X-Live-Key'));
    if (!mine) return fail(res, 403, 'Only the shop can end its live.');
    const { live } = req;
    const summary = {
      seconds: Math.round(((live.endedAt || Date.now()) - live.startedAt) / 1000),
      peakViewers: Math.max(live.peakViewers, lives.viewerCount(live)),
      hearts: live.hearts + live.heartsPending,
      comments: live.commentCount,
    };
    lives.end(live, 'ended');
    return ok(res, summary);
  });

  router.post('/:id/pin', authenticate, host, json, (req, res) => {
    const productId = req.body?.productId ? String(req.body.productId) : null;
    if (productId && !req.live.bag.some((p) => p.id === productId)) return fail(res, 400, 'That product is not in the bag.');
    lives.setPinned(req.live, productId);
    return ok(res, { pinned: req.live.pinned });
  });

  router.put('/:id/bag', authenticate, host, json, async (req, res, next) => {
    try {
      const bag = await bagFor(req.live.store.id, req.body?.productIds);
      lives.setBag(req.live, bag);
      req.live.bagAt = Date.now();
      return ok(res, { bag });
    } catch (err) {
      return next(err);
    }
  });

  // ── Watching ──────────────────────────────────────────────────────────

  router.get('/:id', async (req, res, next) => {
    try {
      const { live } = req;
      // Stock and prices move during a live: the bag is read again now and
      // then (one read serves every viewer).
      if (live.status !== 'ENDED' && live.bag.length && Date.now() - (live.bagAt || 0) > 20000) {
        live.bagAt = Date.now();
        live.bagRefresh = live.bagRefresh || bagFor(live.store.id, live.bag.map((p) => p.id))
          .then((bag) => { live.bag = bag; })
          .catch(() => {})
          .finally(() => { live.bagRefresh = null; });
        await live.bagRefresh;
      }
      res.set('Cache-Control', 'no-store');
      return ok(res, {
        ...lives.summary(live),
        sellerId: live.sellerId,
        codecs: live.codecs,
        epoch: live.epoch,
        latestSeq: live.latestSeq,
        oldestSeq: live.segments[0]?.seq ?? -1,
        bag: live.bag,
        news: lives.news(live, 0),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/:id/events', async (req, res) => {
    const { live } = req;
    if (!pollLimit.take(ip(req))) return fail(res, 429, 'Too many requests.');
    const since = int(req.query.v, 0);
    lives.seen(live, req.query.viewer);
    res.set('Cache-Control', 'no-store');
    if (live.version <= since && live.status !== 'ENDED') {
      await lives.waitFor(live, 'events', EVENTS_WAIT_MS);
      if (res.destroyed || req.socket?.destroyed) return undefined;
    }
    return ok(res, lives.news(live, since));
  });

  router.get('/:id/init/:file', (req, res) => {
    const epoch = int(String(req.params.file).replace(/\.mp4$/, ''));
    const init = req.live.inits.get(epoch);
    if (!init) return fail(res, 404, 'Not there.');
    res.set({
      'Content-Type': 'video/mp4',
      'Cache-Control': 'public, max-age=600, immutable',
      'X-Live-Codecs': init.codecs,
    });
    return res.end(init.data);
  });

  router.get('/:id/seg/:file', async (req, res) => {
    const { live } = req;
    const seq = int(String(req.params.file).replace(/\.m4s$/, ''));
    if (seq < 0) return fail(res, 400, 'Bad piece.');
    let seg = lives.segment(live, seq);
    // The next piece (or the one after), or one still being recorded: wait
    // until it is complete, then send it whole. Never streamed as it fills:
    // Hostinger's CDN holds a streamed response back and the viewer got
    // nothing at all -- "Catching up..." for good. A whole second, sent in
    // one go, goes straight through.
    const deadline = Date.now() + SEG_WAIT_MS;
    while ((seg ? !seg.done : (seq > live.latestSeq && seq <= live.latestSeq + 3))
      && live.status !== 'ENDED' && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      const woke = await lives.waitFor(live, 'seg', deadline - Date.now());
      if (res.destroyed || req.socket?.destroyed) return undefined;
      // Too many waiting already: look again shortly instead.
      // eslint-disable-next-line no-await-in-loop
      if (!woke && Date.now() < deadline) await new Promise((r) => { setTimeout(r, 150); });
      seg = lives.segment(live, seq);
    }
    if (seg?.done) {
      // Complete: the same for everyone, so a cache may keep it.
      res.set({
        'Content-Type': 'video/mp4',
        'Content-Length': String(seg.data.length),
        'X-Live-Epoch': String(seg.epoch),
        'Cache-Control': 'public, max-age=60, immutable',
        'Access-Control-Expose-Headers': 'X-Live-Epoch, X-Live-Latest',
      });
      return res.end(seg.data);
    }
    // Still being recorded after the wait (the seller's upload is slow):
    // ask again.
    if (seg && live.status !== 'ENDED') {
      res.set('Cache-Control', 'no-store');
      return res.status(204).end();
    }
    res.set({
      'Cache-Control': 'no-store',
      'X-Live-Latest': String(live.latestSeq),
      'Access-Control-Expose-Headers': 'X-Live-Epoch, X-Live-Dur, X-Live-Latest',
    });
    if (live.status === 'ENDED') return fail(res, 404, 'This live has ended.', { status: 'ENDED' });
    // Too old (the viewer fell behind) or too far ahead: start again from now.
    if (seq < (live.segments[0]?.seq ?? 0) || seq > live.latestSeq + 3) {
      return fail(res, 410, 'Jump to now.', { latestSeq: live.latestSeq, nextSeq: live.latestSeq });
    }
    // A second that never came (the seller's upload fell behind and its
    // start was dropped): on to the next one there is.
    if (seq <= live.latestSeq) {
      const next = live.segments.find((s) => s.seq > seq);
      return fail(res, 410, 'Skip ahead.', { latestSeq: live.latestSeq, nextSeq: next ? next.seq : live.latestSeq });
    }
    return res.status(204).end();
  });

  router.get('/:id/live.m3u8', async (req, res) => {
    const { live } = req;
    // A blocking reload (Low-Latency HLS): the player asks for the playlist
    // once it has piece _HLS_part of segment _HLS_msn, and is answered the
    // moment it does (or after three seconds, as it is).
    if (req.query._HLS_msn != null) {
      const msn = int(req.query._HLS_msn);
      const part = req.query._HLS_part != null ? int(req.query._HLS_part) : -1;
      const deadline = Date.now() + PLAYLIST_WAIT_MS;
      while (live.status !== 'ENDED' && !lives.hasPart(live, msn, part) && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await lives.waitFor(live, 'seg', deadline - Date.now());
        if (res.destroyed || req.socket?.destroyed) return undefined;
      }
    }
    // ?ll=0: whole seconds only (a player that handles parts badly).
    const text = lives.playlist(live, { lowLatency: req.query.ll !== '0' });
    res.set('Cache-Control', 'no-store');
    if (!text) return fail(res, 404, 'The live has not started yet.');
    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    return res.send(text);
  });

  // One piece (Low-Latency HLS parts). The one hinted as coming next is
  // waited for, so a player asks once and gets it the moment it arrives.
  router.get('/:id/part/:seq/:file', async (req, res) => {
    const { live } = req;
    const seq = int(req.params.seq);
    const n = int(String(req.params.file).replace(/\.m4s$/, ''));
    if (seq < 0 || n < 0) return fail(res, 400, 'Bad piece.');
    const ready = () => {
      const seg = lives.segment(live, seq);
      return seg && seg.parts.length > n ? seg : null;
    };
    // Still to come: the next piece of this second, or the first of the next.
    const coming = () => {
      const seg = lives.segment(live, seq);
      if (seg) return !seg.done && n === seg.parts.length;
      return seq === live.latestSeq + 1 && n === 0;
    };
    let seg = ready();
    const deadline = Date.now() + PART_WAIT_MS;
    while (!seg && live.status !== 'ENDED' && coming() && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await lives.waitFor(live, 'seg', deadline - Date.now());
      if (res.destroyed || req.socket?.destroyed) return undefined;
      seg = ready();
    }
    if (!seg) {
      res.set('Cache-Control', 'no-store');
      return fail(res, 404, live.status === 'ENDED' ? 'This live has ended.' : 'No such piece.');
    }
    res.set({ 'Content-Type': 'video/mp4', 'Cache-Control': 'public, max-age=60, immutable' });
    return res.end(seg.parts[n]);
  });

  router.get('/:id/thumb.jpg', (req, res) => {
    if (!req.live.thumb) return fail(res, 404, 'No picture yet.');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=15' });
    return res.end(req.live.thumb);
  });

  // ── Talking ───────────────────────────────────────────────────────────

  router.post('/:id/comments', authenticate, json, async (req, res, next) => {
    try {
      const { live } = req;
      if (live.status === 'ENDED') return fail(res, 410, 'This live has ended.');
      const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
      if (!text) return fail(res, 400, 'Write something first.');
      if (!commentBurst.take(req.user.id) || !commentLimit.take(req.user.id)) {
        return fail(res, 429, 'You are commenting too fast. Please wait a moment.');
      }
      if (hooks.isAbusive(text)) return fail(res, 422, 'That comment cannot be posted on a live. Please keep it friendly.');
      // The shop speaks as the shop: its name and logo, not the person's.
      const seller = req.user.id === live.sellerId;
      const profile = seller ? null : await hooks.profileOf(req.user.id);
      const comment = lives.addComment(live, {
        user: seller
          ? { id: req.user.id, name: live.store.name, logo: live.store.logo || null }
          : { id: req.user.id, name: profile.name, avatarKey: profile.avatarKey || null },
        text,
        seller,
      });
      return ok(res, comment, 201);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/:id/comments/:cid/hide', authenticate, host, (req, res) => {
    if (!lives.hideComment(req.live, req.params.cid)) return fail(res, 404, 'No such comment.');
    return ok(res, {});
  });

  router.post('/:id/hearts', json, (req, res) => {
    const { live } = req;
    if (live.status !== 'LIVE') return ok(res, { hearts: live.hearts });
    const n = Math.min(30, Math.max(1, int(req.body?.n, 1)));
    if (heartLimit.take(ip(req))) lives.addHearts(live, n);
    return ok(res, { hearts: live.hearts });
  });

  return router;
};
