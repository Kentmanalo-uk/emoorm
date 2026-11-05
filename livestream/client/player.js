/*
 * The viewer's side: plays a live in a <video>, about two seconds behind
 * the seller.
 *
 *   const player = new LivePlayer(videoEl, { base, id, onState });
 *   player.start(info);   // info: GET /live/:id (codecs, epoch, latestSeq)
 *   player.destroy();
 *
 * Media Source where there is one (every desktop browser, Android, iPhones
 * from iOS 17.1 as ManagedMediaSource): it asks for the next one-second piece
 * before it exists (the server answers the moment it arrives), appends it,
 * and keeps the playhead close to the newest piece by playing a touch faster
 * or slower, never by jumping unless it has fallen far behind. Older iPhones
 * get the same pieces as an HLS playlist instead.
 *
 * States: 'connecting' | 'playing' | 'waiting' | 'reconnecting' | 'ended' | 'unsupported'
 */

const MediaSourceType = typeof window !== 'undefined'
  ? (window.ManagedMediaSource || window.MediaSource || null)
  : null;

// Seconds between the newest video and what is on screen: enough cushion
// for a piece that comes a little late, little enough to answer "how much
// is #3?" while the shopper still remembers asking.
const TARGET_LAG = 1.6;
const FAR_BEHIND = 5;

const preloaded = new Map();

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

    this.seq = Math.max(0, info.latestSeq);
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

  async loop() {
    let failures = 0;
    while (this.alive && !this.paused) {
      if (this.jumpToNow) {
        this.jumpToNow = false;
        try {
          const res = await fetch(this.root, { signal: this.abort.signal });
          const body = await res.json();
          if (!res.ok || body?.data?.status === 'ENDED') { this.setState('ended'); return; }
          this.seq = Math.max(0, body.data.latestSeq);
        } catch { /* below */ }
      }
      let res;
      try {
        res = await fetch(`${this.root}/seg/${this.seq}.m4s`, { signal: this.abort.signal });
      } catch {
        if (!this.alive || this.paused) return;
        failures += 1;
        if (failures > 2) this.setState('reconnecting');
        await new Promise((r) => { setTimeout(r, Math.min(4000, 400 * failures)); });
        continue;
      }
      if (res.status === 200) {
        failures = 0;
        const epoch = Number(res.headers.get('X-Live-Epoch'));
        const data = await res.arrayBuffer();
        try {
          if (epoch !== this.epoch) await this.loadInit(epoch);
          await this.append(data);
        } catch {
          if (!this.alive) return;
        }
        this.seq += 1;
        this.kick();
        continue;
      }
      if (res.status === 204) continue; // not yet: ask again
      if (res.status === 410) {
        const body = await res.json().catch(() => ({}));
        this.seq = Math.max(0, body.latestSeq ?? this.seq);
        continue;
      }
      // 404: the live ended (or never was).
      this.setState('ended');
      return;
    }
  }

  /** The first piece is in: start from it. */
  kick() {
    const v = this.video;
    const b = v.buffered;
    if (!b.length) return;
    if (!this.started) {
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
    const lag = end - t;
    if (lag > FAR_BEHIND) {
      v.currentTime = end - TARGET_LAG;
      v.playbackRate = 1;
      return;
    }
    let rate = 1;
    if (lag > TARGET_LAG + 1.2) rate = 1.12;
    else if (lag > TARGET_LAG + 0.5) rate = 1.05;
    else if (lag < 0.7) rate = 0.95;
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
