/*
 * The lives going on right now, in memory and nowhere else.
 *
 * A live is video pieces (about a second each, the last few only), the
 * shop's product bag, comments and hearts. Nothing here is written to disk
 * or to the database: when a live ends it is gone, and a restart of the
 * server ends every live (the seller's page starts a new one by itself).
 *
 * Everything a viewer needs to know is behind one counter, `version`: a
 * viewer asks "anything after version N?" and is answered when there is
 * (events long-poll), so nobody polls on a timer.
 */
const crypto = require('crypto');

// The pieces kept per live: enough for a viewer who is a few seconds behind
// and for the HLS playlist, little enough to keep a live under ~2 MB.
const KEEP_SEGMENTS = 8;
const PLAYLIST_SEGMENTS = 6;
const KEEP_COMMENTS = 60;
// A live that has sent nothing for this long has lost its seller.
const SILENT_END_MS = 25 * 1000;
// An ended live stays answerable this long, so viewers learn it ended.
const ENDED_KEEP_MS = 90 * 1000;
// A viewer counts while they asked for news in this window (a long-poll
// comes back at least every 20 s).
const VIEWER_WINDOW_MS = 30 * 1000;
const MAX_LIVES = 40;
const MAX_WAITERS = 3000;

const lives = new Map();

const newId = () => crypto.randomBytes(9).toString('base64url');
const newKey = () => crypto.randomBytes(24).toString('base64url');

/** Wakes everyone waiting on a live's news or on a piece of video. */
const wake = (live, kind) => {
  const list = kind === 'seg' ? live.segWaiters : live.eventWaiters;
  if (!list.length) return;
  const waiting = list.splice(0, list.length);
  for (const fn of waiting) fn();
};

const bump = (live) => {
  live.version += 1;
  wake(live, 'events');
};

/**
 * A new live for a shop. A shop has one live at a time: starting again ends
 * the one before.
 */
const create = ({ store, sellerId, title, bag }) => {
  for (const live of lives.values()) {
    if (live.store.id === store.id && live.status !== 'ENDED') end(live, 'replaced');
  }
  if ([...lives.values()].filter((l) => l.status === 'LIVE').length >= MAX_LIVES) {
    const err = new Error('Too many lives are on right now. Please try again in a few minutes.');
    err.status = 503;
    throw err;
  }
  const live = {
    id: newId(),
    key: newKey(),
    store,
    sellerId,
    title,
    bag,
    bagVersion: 1,
    pinned: null,
    status: 'STARTING',
    startedAt: Date.now(),
    lastDataAt: Date.now(),
    endedAt: null,
    endReason: null,
    // Video
    epoch: -1,
    inits: new Map(), // epoch -> { data, codecs }
    codecs: null,
    segments: [], // { seq, epoch, parts: [Buffer], dur, done, data (when done) }
    latestSeq: -1,
    segWaiters: [],
    thumb: null,
    // Talk
    version: 1,
    comments: [], // { id, v, user, text, at, seller }
    commentCount: 0,
    hearts: 0,
    heartsPending: 0,
    heartTimer: null,
    eventWaiters: [],
    viewers: new Map(), // viewer id -> last seen
    peakViewers: 0,
  };
  lives.set(live.id, live);
  return live;
};

const get = (id) => lives.get(String(id || '')) || null;

const keyMatches = (live, given) => {
  if (!live || typeof given !== 'string' || given.length !== live.key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(live.key));
};

const end = (live, reason = 'ended') => {
  if (!live || live.status === 'ENDED') return;
  live.status = 'ENDED';
  live.endedAt = Date.now();
  live.endReason = reason;
  if (live.heartTimer) clearTimeout(live.heartTimer);
  live.heartTimer = null;
  // The video goes at once; the summary stays a moment for the viewers.
  live.segments = [];
  live.inits.clear();
  live.thumb = null;
  bump(live);
  wake(live, 'seg');
};

/** The publisher's start (or restart) of its video: a new init segment. */
const putInit = (live, { epoch, codecs, data }) => {
  live.inits.set(epoch, { data, codecs });
  // Only the inits the kept pieces still need.
  for (const e of live.inits.keys()) {
    if (e < epoch && !live.segments.some((s) => s.epoch === e)) live.inits.delete(e);
  }
  live.epoch = epoch;
  live.codecs = codecs;
  live.lastDataAt = Date.now();
  bump(live);
};

/** A group that will get no more pieces: kept whole, for the playlist. */
const close = (seg) => {
  if (seg.done) return;
  seg.done = true;
  seg.data = Buffer.concat(seg.parts);
};

/**
 * A piece of video: part `part` of group `seq` (a group starts on a key
 * frame and lasts about a second; its pieces about a fifth of one). Viewers
 * streaming the group are woken for each. `last`: the group is complete.
 */
const putPart = (live, args) => {
  const {
    seq, part, last, epoch,
  } = args;
  if (!live.inits.has(epoch)) return false;
  // A whole second that came before the one in front of it (the seller's
  // uploads run side by side): held a moment for the missing one, so
  // seconds are kept, numbered and served in order.
  if (part === 0 && last && live.latestSeq >= 0 && seq > live.latestSeq + 1 && !segment(live, seq)) {
    if (!live.held) live.held = new Map();
    if (!live.held.has(seq) && live.held.size < HOLD_MAX) {
      live.held.set(seq, args);
      setTimeout(() => releaseHeld(live, seq), HOLD_MS);
    }
    live.lastDataAt = Date.now();
    return true;
  }
  const ok = addPart(live, args);
  drainHeld(live);
  return ok;
};

// How long a second waits for the one before it, and how many may wait.
const HOLD_MS = 3000;
const HOLD_MAX = 8;

/** Adds the held seconds that now follow on. */
const drainHeld = (live) => {
  while (live.held?.has(live.latestSeq + 1)) {
    const args = live.held.get(live.latestSeq + 1);
    live.held.delete(live.latestSeq + 1);
    addPart(live, args);
  }
};

/** The second before `upTo` never came: go on without it. */
const releaseHeld = (live, upTo) => {
  if (!live.held?.has(upTo) || live.status === 'ENDED') return;
  for (const s of [...live.held.keys()].sort((a, b) => a - b)) {
    if (s > upTo) break;
    const args = live.held.get(s);
    live.held.delete(s);
    if (s > live.latestSeq) addPart(live, args);
  }
  drainHeld(live);
};

const addPart = (live, {
  seq, part, last, epoch, dur, data,
}) => {
  live.lastDataAt = Date.now();
  let seg = segment(live, seq);
  if (!seg) {
    // Old (already let go), or a group that did not arrive from its start.
    if (seq <= live.latestSeq || part !== 0) return true;
    for (const s of live.segments) close(s);
    // msn: the HLS media sequence number, one after another even when a
    // second was dropped (seq then skips one; players count without gaps).
    live.nextMsn = (live.nextMsn ?? -1) + 1;
    seg = {
      seq, epoch, parts: [], durs: [], dur: 0, done: false, data: null, msn: live.nextMsn, at: Date.now(),
    };
    live.segments.push(seg);
    while (live.segments.length > KEEP_SEGMENTS) live.segments.shift();
    live.latestSeq = seq;
  }
  // A retried upload, or one after a piece that never came (the rest of the
  // group cannot be shown without it).
  if (seg.done || part < seg.parts.length) return true;
  if (part > seg.parts.length) {
    close(seg);
    wake(live, 'seg');
    return true;
  }
  seg.parts.push(data);
  seg.durs.push(dur);
  seg.dur += dur;
  if (last) close(seg);
  if (live.status === 'STARTING') {
    live.status = 'LIVE';
    bump(live);
  }
  wake(live, 'seg');
  return true;
};

const segment = (live, seq) => live.segments.find((s) => s.seq === seq) || null;

/** Waits for a piece that is not there yet (a viewer one step ahead). */
const waitFor = (live, kind, ms) => new Promise((resolve) => {
  const list = kind === 'seg' ? live.segWaiters : live.eventWaiters;
  if (list.length >= MAX_WAITERS) { resolve(false); return; }
  let done = false;
  const fn = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    resolve(true);
  };
  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
    resolve(false);
  }, ms);
  list.push(fn);
});

// Low-Latency HLS: each piece is listed as a part, so a player (the phone
// app's, Safari's) plays a fifth of a second after it arrives rather than
// a whole second after. PART_TARGET is the longest a piece runs (seven
// frames at 30 a second); players hold back about three of them.
const PART_TARGET = 0.25;
const PART_HOLD_BACK = 0.8;
// Seconds whose pieces are listed (older ones only as whole seconds).
const PARTS_FOR_LAST = 3;

/**
 * The HLS playlist, Low-Latency: complete seconds as segments, the newest
 * seconds' pieces as parts, and a hint for the piece coming next.
 */
const playlist = (live, { lowLatency = true } = {}) => {
  const segs = live.segments.filter((s) => (lowLatency ? s.parts.length : s.done)).slice(-PLAYLIST_SEGMENTS);
  if (!segs.length) return null;
  const done = segs.filter((s) => s.done);
  const target = Math.max(1, Math.round(Math.max(1000, ...done.map((s) => s.dur)) / 1000));
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:9',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    `#EXT-X-TARGETDURATION:${target}`,
    ...(lowLatency ? [
      `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=${PART_HOLD_BACK}`,
      `#EXT-X-PART-INF:PART-TARGET=${PART_TARGET}`,
    ] : []),
    `#EXT-X-MEDIA-SEQUENCE:${segs[0].msn}`,
    `#EXT-X-DISCONTINUITY-SEQUENCE:${segs[0].epoch}`,
  ];
  let epoch = null;
  segs.forEach((s, i) => {
    if (s.epoch !== epoch) {
      if (epoch !== null) lines.push('#EXT-X-DISCONTINUITY');
      lines.push(`#EXT-X-MAP:URI="init/${s.epoch}.mp4"`);
      epoch = s.epoch;
    }
    lines.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(s.at).toISOString()}`);
    if (lowLatency && i >= segs.length - PARTS_FOR_LAST) {
      s.durs.forEach((d, n) => {
        lines.push(`#EXT-X-PART:DURATION=${(d / 1000).toFixed(3)},URI="part/${s.seq}/${n}.m4s"${n === 0 ? ',INDEPENDENT=YES' : ''}`);
      });
    }
    if (s.done) lines.push(`#EXTINF:${(s.dur / 1000).toFixed(3)},`, `seg/${s.seq}.m4s`);
  });
  const last = segs[segs.length - 1];
  if (live.status === 'ENDED') lines.push('#EXT-X-ENDLIST');
  else if (!lowLatency) { /* whole seconds only */ } else if (last.done) lines.push(`#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part/${last.seq + 1}/0.m4s"`);
  else lines.push(`#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part/${last.seq}/${last.parts.length}.m4s"`);
  return `${lines.join('\n')}\n`;
};

/**
 * Whether the playlist already has segment `msn`'s part `part` (no part:
 * the whole segment): what a blocking playlist request waits for.
 */
const hasPart = (live, msn, part) => live.segments.some((s) => s.msn > msn
  || (s.msn === msn && (s.done || (part >= 0 && s.parts.length > part))));

// ── Talk ────────────────────────────────────────────────────────────────

const addComment = (live, { user, text, seller }) => {
  live.commentCount += 1;
  live.version += 1;
  const comment = {
    id: `${live.version}`,
    v: live.version,
    user,
    text,
    seller: Boolean(seller),
    at: Date.now(),
  };
  live.comments.push(comment);
  while (live.comments.length > KEEP_COMMENTS) live.comments.shift();
  wake(live, 'events');
  return comment;
};

const hideComment = (live, id) => {
  const c = live.comments.find((x) => x.id === String(id));
  if (!c || c.hidden) return false;
  c.hidden = true;
  live.version += 1;
  c.v = live.version;
  wake(live, 'events');
  return true;
};

// Hearts arrive in handfuls from every viewer; they are told about them
// a few times a second, not once per tap.
const addHearts = (live, n) => {
  live.heartsPending += n;
  if (live.heartTimer) return;
  live.heartTimer = setTimeout(() => {
    live.heartTimer = null;
    live.hearts += live.heartsPending;
    live.heartsPending = 0;
    bump(live);
  }, 350);
};

const setPinned = (live, productId) => {
  live.pinned = productId ? { productId, at: Date.now() } : null;
  bump(live);
};

const setBag = (live, bag) => {
  live.bag = bag;
  live.bagVersion += 1;
  if (live.pinned && !bag.some((p) => p.id === live.pinned.productId)) live.pinned = null;
  bump(live);
};

const seen = (live, viewerId) => {
  if (!viewerId) return;
  const id = String(viewerId).slice(0, 40);
  if (!live.viewers.has(id) && live.viewers.size >= 20000) return;
  live.viewers.set(id, Date.now());
};

const viewerCount = (live) => live.viewers.size;

/** What a viewer is told: everything after version `since`. */
const news = (live, since) => {
  const fresh = since > 0 ? live.comments.filter((c) => c.v > since) : live.comments.slice(-20);
  return {
    v: live.version,
    status: live.status,
    endReason: live.endReason,
    viewers: viewerCount(live),
    hearts: live.hearts,
    pinned: live.pinned,
    bagVersion: live.bagVersion,
    epoch: live.epoch,
    latestSeq: live.latestSeq,
    comments: fresh.slice(-30).map(({ hidden, ...c }) => (hidden ? { id: c.id, v: c.v, hidden: true } : c)),
    commentCount: live.commentCount,
  };
};

/** A live as lists show it. */
const summary = (live) => ({
  id: live.id,
  title: live.title,
  status: live.status,
  store: live.store,
  startedAt: live.startedAt,
  viewers: viewerCount(live),
  hearts: live.hearts,
  hasThumb: Boolean(live.thumb),
  thumbAt: live.thumbAt || null,
  bagCount: live.bag.length,
});

const onAir = () => [...lives.values()].filter((l) => l.status === 'LIVE');

// Ends lives whose seller went quiet, forgets ended ones, and counts viewers.
const sweep = () => {
  const now = Date.now();
  for (const live of lives.values()) {
    if (live.status !== 'ENDED' && now - live.lastDataAt > SILENT_END_MS) end(live, 'lost');
    if (live.status === 'ENDED' && now - live.endedAt > ENDED_KEEP_MS) {
      wake(live, 'events');
      lives.delete(live.id);
      continue;
    }
    for (const [id, at] of live.viewers) {
      if (now - at > VIEWER_WINDOW_MS) live.viewers.delete(id);
    }
    // The count goes out with the next sweep, not on every arrival.
    const count = live.viewers.size;
    if (count > live.peakViewers) live.peakViewers = count;
    if (count !== live.reportedViewers && live.status !== 'ENDED') {
      live.reportedViewers = count;
      bump(live);
    }
  }
};
setInterval(sweep, 5000).unref();

module.exports = {
  create, get, keyMatches, end, putInit, putPart, segment, waitFor, playlist, hasPart,
  addComment, hideComment, addHearts, setPinned, setBag, seen, viewerCount, news, summary, onAir,
  KEEP_SEGMENTS,
  // Tests only.
  _all: lives,
  _sweep: sweep,
};
