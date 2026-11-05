/*
 * The viewer's side: plays a live in a <video>, about three seconds behind
 * the seller.
 *
 *   const player = new LivePlayer(videoEl, { base, id, onState });
 *   player.start(info);   // info: GET /live/:id (codecs, epoch, latestSeq)
 *   player.destroy();
 *
 * Media Source where there is one (every desktop browser, Android, iPhones
 * from iOS 17.1 as ManagedMediaSource): it starts two finished seconds
 * back, asks for the next few one-second pieces at once (the server answers
 * each the moment it is complete), appends them in order, and keeps the
 * playhead near the newest piece by playing a touch faster or slower, never
 * by jumping unless it has fallen far behind. Older iPhones get the same
 * pieces as an HLS playlist instead.
 *
 * Whole seconds only, never a piece still being recorded: on the live site
 * those were streamed, Hostinger's CDN held the stream back, and viewers sat
 * on "Catching up…". A few seconds of delay is the price, and it plays.
 *
 * States: 'connecting' | 'playing' | 'waiting' | 'reconnecting' | 'ended' | 'unsupported'
 */

const MediaSourceType = typeof window !== 'undefined'
  ? (window.ManagedMediaSource || window.MediaSource || null)
  : null;

// Seconds between the newest video and what is on screen: enough cushion
// for a piece that comes late (a request through the site's CDN takes one
// to three seconds), little enough to answer "how much is #3?" while the
// shopper still remembers asking.
const TARGET_LAG = 3;
const FAR_BEHIND = 6.5;
// Pieces asked for at once: each answer takes longer than the second it
// holds, so the next ones are already on their way.
const AHEAD = 3;
// Video held before playing starts, so the picture does not stop at once.
const START_BUFFER = 1.5;

const preloaded = new Map();

// Where to start: two seconds before the one being recorded (both already
// complete, so the picture comes at once), never before the oldest kept.
const startSeq = (info) => Math.max(info.oldestSeq ?? 0, (info.latestSeq ?? 0) - 2, 0);

/** Fetches a live's set-up and newest piece early (a card in view), so opening it is instant. */
export function preloadLive(base, info) {
  if (!info?.id || info.epoch == null || info.epoch < 0 || preloaded.has(info.id)) return;
  const root = `${base.replace(/\/$/, '')}/${info.id}`;
  const entry = {
    epoch: info.epoch,
    init: fetch(`${root}/init/${info.epoch}.mp4`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
  };
  preloaded.set(info.id, entry);
  setTimeout(() => preloaded.delete(info.id), 15000);
}

export function liveCanPlay(video) {
  if (MediaSourceType) return true;
  return Boolean(video?.canPlayType?.('application/vnd.apple.mpegurl'));
}

export class LivePlayer {
  constructor(video, { base, id, onState }) {
    this.video = video;
    this.root = `${base.replace(/\/$/, '')}/${id}`;
    this.id = id;
    this.onState = onState || (() => {});
    this.state = null;
    this.alive = true;
    this.appends = Promise.resolve();
    this.epoch = null;
    this.codecs = null;
    this.timers = [];
    this.abort = new AbortController();
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }

  async start(info) {
    this.setState('connecting');
    const mime = info.codecs ? `video/mp4; codecs="${info.codecs}"` : null;
    if (MediaSourceType && mime && MediaSourceType.isTypeSupported(mime)) {
      await this.startMse(info, mime);
      return;
    }
    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.startHls();
      return;
    }
    this.setState('unsupported');
  }

  destroy() {
    this.alive = false;
    this.abort.abort();
    for (const t of this.timers) clearInterval(t);
    document.removeEventListener('visibilitychange', this.onVisibility);
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.srcObject = null;
      this.video.load();
    } catch { /* gone */ }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  // ── Older iPhones: the playlist ───────────────────────────────────────

  startHls() {
    const v = this.video;
    v.src = `${this.root}/live.m3u8`;
    v.addEventListener('playing', () => this.setState('playing'));
    v.addEventListener('waiting', () => this.setState('waiting'));
    v.addEventListener('ended', () => this.setState('ended'));
    v.play().catch(() => {});
  }

  // ── Media Source ──────────────────────────────────────────────────────

  async startMse(info, mime) {
    const v = this.video;
    const ms = new MediaSourceType();
    this.ms = ms;
    // ManagedMediaSource (iPhone) plays only with AirPlay turned off.
    v.disableRemotePlayback = true;
    const opened = new Promise((resolve) => ms.addEventListener('sourceopen', resolve, { once: true }));
    if ('srcObject' in v && window.ManagedMediaSource && ms instanceof window.ManagedMediaSource) {
      v.srcObject = ms;
    } else {
      this.objectUrl = URL.createObjectURL(ms);
      v.src = this.objectUrl;
    }
    await opened;
    if (!this.alive) return;
    this.sb = ms.addSourceBuffer(mime);
    this.sb.mode = 'segments';
    this.codecs = info.codecs;

    v.addEventListener('waiting', () => { if (this.started) this.setState('waiting'); });
    v.addEventListener('playing', () => this.setState('playing'));
    this.onVisibility = () => {
      // Hidden: stop downloading (data and battery); back: jump to now.
      if (document.hidden) {
        this.paused = true;
        this.abort.abort();
      } else if (this.paused) {
        this.paused = false;
        this.abort = new AbortController();
        this.jumpToNow = true;
        this.loop();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.seq = startSeq(info);
    this.timers.push(setInterval(() => this.steer(), 250));
    this.timers.push(setInterval(() => this.trim(), 5000));
    this.loop();
  }

  append(buffer) {
    this.appends = this.appends.then(() => new Promise((resolve) => {
      if (!this.alive || !this.sb || this.ms.readyState !== 'open') { resolve(); return; }
      const done = () => resolve();
      this.sb.addEventListener('updateend', done, { once: true });
      try {
        this.sb.appendBuffer(buffer);
      } catch (err) {
        this.sb.removeEventListener('updateend', done);
        // Full: drop what is behind the playhead and carry on.
        if (err?.name === 'QuotaExceededError') this.trim(true);
        resolve();
      }
    }));
    return this.appends;
  }

  async loadInit(epoch) {
    let data = null;
    const early = preloaded.get(this.id);
    if (early && early.epoch === epoch && this.epoch === null) data = await early.init;
    if (!data) {
      const res = await fetch(`${this.root}/init/${epoch}.mp4`, { signal: this.abort.signal });
      if (!res.ok) throw new Error('init');
      const codecs = res.headers.get('X-Live-Codecs');
      if (codecs && codecs !== this.codecs && this.sb.changeType) {
        this.sb.changeType(`video/mp4; codecs="${codecs}"`);
        this.codecs = codecs;
      }
      data = await res.arrayBuffer();
    }
    await this.append(data);
    this.epoch = epoch;
  }

  /** One piece: { status, epoch, data, body } or { error: true }. */
  async fetchSeg(seq) {
    try {
      const res = await fetch(`${this.root}/seg/${seq}.m4s`, { signal: this.abort.signal });
      if (res.status === 200) {
        return { status: 200, epoch: Number(res.headers.get('X-Live-Epoch')), data: await res.arrayBuffer() };
      }
      if (res.status === 410) return { status: 410, body: await res.json().catch(() => ({})) };
      return { status: res.status };
    } catch {
      return { error: true };
    }
  }

  async loop() {
    let failures = 0;
    // Pieces on their way, by number. `ahead`: asked for before it was the
    // next to play -- a "not yet" or "skip" for one of those is old news,
    // so it is asked for again rather than believed.
    let inFlight = new Map();
    const ask = (seq, ahead) => {
      if (!inFlight.has(seq)) inFlight.set(seq, { result: this.fetchSeg(seq), ahead });
    };
    while (this.alive && !this.paused) {
      if (this.jumpToNow) {
        this.jumpToNow = false;
        inFlight = new Map();
        try {
          const res = await fetch(this.root, { signal: this.abort.signal });
          const body = await res.json();
          if (!res.ok || body?.data?.status === 'ENDED') { this.setState('ended'); return; }
          this.seq = startSeq(body.data);
        } catch { /* below */ }
      }
      ask(this.seq, false);
      for (let i = 1; i < AHEAD; i += 1) ask(this.seq + i, true);
      const entry = inFlight.get(this.seq);
      // eslint-disable-next-line no-await-in-loop
      const r = await entry.result;
      if (!this.alive || this.paused) return;
      inFlight.delete(this.seq);
      if (r.error) {
        failures += 1;
        if (failures > 2) this.setState('reconnecting');
        // eslint-disable-next-line no-await-in-loop
        await new Promise((ok) => { setTimeout(ok, Math.min(4000, 400 * failures)); });
        continue;
      }
      if (r.status === 200) {
        failures = 0;
        try {
          // eslint-disable-next-line no-await-in-loop
          if (r.epoch !== this.epoch) await this.loadInit(r.epoch);
          // eslint-disable-next-line no-await-in-loop
          await this.append(r.data);
        } catch {
          if (!this.alive) return;
        }
        this.seq += 1;
        this.appended = (this.appended || 0) + 1;
        this.kick();
        continue;
      }
      if (entry.ahead && (r.status === 204 || r.status === 410)) continue; // ask again, now
      if (r.status === 204) continue; // not complete yet: ask again
      if (r.status === 410) {
        // A second that never came: on to the next one there is (or to now).
        this.seq = Math.max(0, r.body.nextSeq ?? r.body.latestSeq ?? this.seq);
        inFlight = new Map();
        continue;
      }
      // 404: the live ended (or never was).
      this.setState('ended');
      return;
    }
  }

  /** Enough video is in: start a few seconds behind the newest. */
  kick() {
    const v = this.video;
    const b = v.buffered;
    if (!b.length) return;
    const held = b.end(b.length - 1) - b.start(0);
    if (!this.started && (held >= START_BUFFER || this.appended >= 3)) {
      this.started = true;
      v.currentTime = Math.max(b.start(0), b.end(b.length - 1) - TARGET_LAG);
      v.play().catch(() => {
        // Sound needs a tap first: start without it.
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }

  /** Keeps the playhead near now, smoothly. */
  steer() {
    const v = this.video;
    const b = v.buffered;
    if (!this.started || !b.length || v.seeking) return;
    const end = b.end(b.length - 1);
    const t = v.currentTime;
    // Over a hole (a piece that never came): to the next video.
    let inside = false;
    for (let i = 0; i < b.length; i += 1) {
      if (t >= b.start(i) - 0.05 && t < b.end(i)) inside = true;
    }
    if (!inside) {
      for (let i = 0; i < b.length; i += 1) {
        if (b.start(i) > t) {
          v.currentTime = b.start(i) + 0.02;
          return;
        }
      }
    }
    // Stuck: the picture has not moved for a second though there is video
    // after it (a second the seller dropped, or a stop right at the edge of
    // one). Step over rather than sit on "Catching up…".
    if (Math.abs(t - (this.lastT ?? -1)) > 0.01 || v.paused) {
      this.lastT = t;
      this.movedAt = performance.now();
    } else if (performance.now() - this.movedAt > 1000 && end - t > 0.3) {
      let to = null;
      for (let i = 0; i < b.length; i += 1) {
        if (b.start(i) > t + 0.01) { to = b.start(i) + 0.05; break; }
      }
      v.currentTime = to ?? t + 0.15;
      this.movedAt = performance.now();
      return;
    }
    const lag = end - t;
    if (lag > FAR_BEHIND) {
      v.currentTime = end - TARGET_LAG;
      v.playbackRate = 1;
      return;
    }
    let rate = 1;
    // Whole seconds arrive in bursts, so the distance swings by about one:
    // only a clear drift is corrected.
    if (lag > TARGET_LAG + 2) rate = 1.15;
    else if (lag > TARGET_LAG + 1) rate = 1.06;
    else if (lag < 1.2) rate = 0.96;
    if (Math.abs(v.playbackRate - rate) > 0.001) v.playbackRate = rate;
    if (v.paused && !this.userPaused && v.readyState >= 3) v.play().catch(() => {});
  }

  /** Lets go of video well behind the playhead. */
  trim(now) {
    const v = this.video;
    if (!this.sb || this.ms?.readyState !== 'open' || !v.buffered.length) return;
    const start = v.buffered.start(0);
    const keepFrom = v.currentTime - 6;
    if (keepFrom - start > (now ? 1 : 10)) {
      this.appends = this.appends.then(() => new Promise((resolve) => {
        if (this.sb.updating) { resolve(); return; }
        this.sb.addEventListener('updateend', () => resolve(), { once: true });
        try { this.sb.remove(start, keepFrom); } catch { resolve(); }
      }));
    }
  }
}
