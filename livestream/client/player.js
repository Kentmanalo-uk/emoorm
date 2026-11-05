/*
 * The viewer's side: plays a live in a <video>, under a second behind the
 * seller on a good connection.
 *
 *   const player = new LivePlayer(videoEl, { base, id, onState });
 *   player.start(info);   // info: GET /live/:id (codecs, epoch, latestSeq)
 *   player.stats();       // { lag, target, stalls } for a debug overlay
 *   player.destroy();
 *
 * Media Source where there is one (every desktop browser, Android, iPhones
 * from iOS 17.1 as ManagedMediaSource). Each second of video is asked for
 * before it exists and comes as one streamed response: the server writes a
 * fifth of a second at a time as the seller uploads it, and each is played
 * the moment it lands. Older iPhones get whole seconds as an HLS playlist.
 *
 * The live-sync controller (steer) keeps the playhead a set distance behind
 * the newest video, by playing a touch faster or slower rather than
 * jumping. The distance is not fixed: it starts small, grows each time the
 * picture has to stop and wait (a shaky connection needs more cushion), and
 * shrinks again after a calm spell. So a viewer on good Wi-Fi watches
 * almost as it happens and one on weak data still watches without stops.
 *
 * States: 'connecting' | 'playing' | 'waiting' | 'reconnecting' | 'ended' | 'unsupported'
 */

const MediaSourceType = typeof window !== 'undefined'
  ? (window.ManagedMediaSource || window.MediaSource || null)
  : null;

// Seconds behind the newest video: where the controller starts, how close
// and how far it may go, and how far behind it jumps instead of hurrying.
const START_TARGET = 0.6;
const MIN_TARGET = 0.45;
const MAX_TARGET = 3;
const STALL_STEP = 0.35;
const CALM_MS = 12000;
const JUMP_AFTER = 3;

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
    this.target = START_TARGET;
    this.stalls = 0;
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
    clearTimeout(this.kickTimer);
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

    v.addEventListener('waiting', () => {
      if (!this.started) return;
      this.setState('waiting');
      // The moment playback starts is not a stall.
      if (Date.now() - this.startedAt < 2500) return;
      // The picture stopped: this connection needs more cushion.
      this.stalls += 1;
      this.lastStallAt = Date.now();
      this.target = Math.min(MAX_TARGET, this.target + STALL_STEP);
    });
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
    this.target = START_TARGET;
    this.stalls = 0;
    this.lastStallAt = Date.now();
    this.lastEaseAt = Date.now();
    this.timers.push(setInterval(() => this.steer(), 200));
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
        if (this.state === 'reconnecting') this.setState('waiting');
        const epoch = Number(res.headers.get('X-Live-Epoch'));
        try {
          if (epoch !== this.epoch) await this.loadInit(epoch);
          await this.readStreamed(res);
        } catch {
          if (!this.alive || this.paused) return;
        }
        this.seq += 1;
        continue;
      }
      if (res.status === 204) continue; // not yet: ask again
      if (res.status === 410) {
        const body = await res.json().catch(() => ({}));
        this.seq = Math.max(0, body.nextSeq ?? body.latestSeq ?? this.seq);
        continue;
      }
      // 404: the live ended (or never was).
      this.setState('ended');
      return;
    }
  }

  /**
   * One second of video as it streams in: each moof + mdat pair (a fifth of
   * a second) is appended the moment the whole of it has arrived.
   */
  async readStreamed(res) {
    if (!res.body?.getReader) {
      await this.append(await res.arrayBuffer());
      this.kick();
      return;
    }
    const reader = res.body.getReader();
    let buf = new Uint8Array(0);
    let from = 0; // where the current moof starts
    let at = 0; // the next box to read
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      const joined = new Uint8Array(buf.length - from + value.length);
      joined.set(buf.subarray(from));
      joined.set(value, buf.length - from);
      at -= from;
      from = 0;
      buf = joined;
      while (buf.length - at >= 8) {
        const size = ((buf[at] << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]) >>> 0;
        if (size < 8) throw new Error('bad box');
        if (buf.length - at < size) break;
        const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
        at += size;
        if (type === 'mdat') {
          // eslint-disable-next-line no-await-in-loop
          await this.append(buf.slice(from, at));
          this.kick();
          from = at;
        }
      }
    }
  }

  /** The first piece is in: start from it. */
  kick() {
    const v = this.video;
    const b = v.buffered;
    if (!b.length || this.started || this.kickTimer) return;
    // A moment for the rest of the second already on the server to land
    // (it comes in one burst), so playing starts at now, not at its start.
    this.kickTimer = setTimeout(() => {
      const r = v.buffered;
      if (!this.alive || !r.length) return;
      this.started = true;
      this.startedAt = Date.now();
      v.currentTime = Math.max(r.start(r.length - 1), r.end(r.length - 1) - this.target);
      v.play().catch(() => {
        // Sound needs a tap first: start without it.
        v.muted = true;
        v.play().catch(() => {});
      });
    }, 250);
  }

  stats() {
    const b = this.video.buffered;
    const lag = b.length ? b.end(b.length - 1) - this.video.currentTime : null;
    return { lag, target: this.target, stalls: this.stalls };
  }

  /** The live-sync controller: keeps the playhead `target` behind now, smoothly. */
  steer() {
    const v = this.video;
    const b = v.buffered;
    if (!this.started || !b.length) return;
    const end = b.end(b.length - 1);
    const lastStart = b.start(b.length - 1);
    const t = v.currentTime;
    // A calm spell: creep closer to now again.
    const now = Date.now();
    if (now - this.lastStallAt > CALM_MS && now - this.lastEaseAt > CALM_MS / 2 && this.target > MIN_TARGET) {
      this.target = Math.max(MIN_TARGET, this.target - 0.1);
      this.lastEaseAt = now;
    }
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
    // Moving to a place it has: let it get there.
    if (v.seeking) return;
    // Standing still with video ahead: a hole too small to show in the
    // buffered ranges (a frame or two the seller could not send), which the
    // browser will not cross by itself. Step over it.
    if (!v.paused && Math.abs(t - this.lastT) < 0.01 && end - t > 0.4) {
      if (!this.stuckSince) this.stuckSince = now;
      else if (now - this.stuckSince > 700) {
        let next = null;
        for (let i = 0; i < b.length; i += 1) if (next === null && b.start(i) > t + 0.05) next = b.start(i);
        v.currentTime = next !== null ? next + 0.02 : Math.min(end - 0.1, t + 0.3);
        this.stuckSince = 0;
        return;
      }
    } else {
      this.stuckSince = 0;
    }
    this.lastT = t;
    const lag = end - t;
    if (lag > this.target + JUMP_AFTER) {
      // Never into a hole: no earlier than the start of the newest stretch.
      v.currentTime = Math.max(lastStart + 0.02, end - this.target);
      v.playbackRate = 1;
      return;
    }
    // Faster the further behind, slower when too close; nothing in between
    // (a small dead zone, so the sound never wavers for no reason).
    const off = lag - this.target;
    let rate = 1;
    if (Math.abs(off) > 0.08) rate = Math.min(1.12, Math.max(0.95, 1 + off * 0.12));
    rate = Math.round(rate * 100) / 100;
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
