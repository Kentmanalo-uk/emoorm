/*
 * The seller's side of a live: the camera and microphone, compressed in the
 * browser (WebCodecs, on the phone's own video chip where it has one), cut
 * into one-second pieces of fragmented MP4 and uploaded one after another.
 *
 *   const pub = new LivePublisher({ base, id, key, onStats, onGone });
 *   await pub.start(stream);      // a getUserMedia stream (camera + mic)
 *   pub.replaceStream(stream);    // the other camera
 *   pub.stop();
 *
 * Each piece starts with a key frame, so a viewer can start on any of them,
 * and one that cannot be uploaded in time is dropped whole rather than
 * delaying everything after it. When the upload falls behind, the picture
 * gets lighter (lower bitrate) until it keeps up again.
 */
import {
  initSegment, mediaSegment, avcCodec, aacConfig, VIDEO_TIMESCALE,
} from './fmp4.js';

// A key frame every second (where a viewer can start); each second is
// uploaded whole, up to three at a time.
const SEGMENT_US = 1000000;
const MAX_UPLOADS = 3;
const FPS = 30;
const SAMPLE_RATE = 48000;
const AUDIO_BLOCK = 1024;
// Bits per second, best first. The picture steps down when the upload
// cannot keep up and back up when it has room again.
const LADDER = [1800000, 1200000, 750000, 450000];
const THUMB_EVERY_MS = 12000;

const nowUs = () => Math.round(performance.now() * 1000);

/** Whether this browser can go live, and why not when it cannot. */
export async function liveSupport() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { ok: false, reason: 'This browser cannot send live video. Use Chrome on Android or a computer.' };
  }
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return { ok: false, reason: 'This browser cannot send live sound. Use Chrome on Android or a computer.' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'This browser cannot open the camera here. The page must be opened over https.' };
  }
  return { ok: true };
}

/** The first H.264 set-up the encoder takes, hardware first. */
async function pickVideoConfig(width, height, bitrate) {
  const big = width * height > 1280 * 720;
  const codecs = big ? ['avc1.42E028', 'avc1.4D4028', 'avc1.640028'] : ['avc1.42E01F', 'avc1.4D401F', 'avc1.640028'];
  for (const accel of ['prefer-hardware', 'no-preference']) {
    for (const codec of codecs) {
      const config = {
        codec,
        width,
        height,
        bitrate,
        framerate: FPS,
        latencyMode: 'realtime',
        hardwareAcceleration: accel,
        avc: { format: 'avc' },
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        const { supported } = await VideoEncoder.isConfigSupported(config);
        if (supported) return config;
      } catch { /* try the next */ }
    }
  }
  return null;
}

async function pickAudioConfig() {
  const options = [
    { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 64000 },
    {
      codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 48000, opus: { frameDuration: 20000 },
    },
  ];
  for (const config of options) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { supported } = await AudioEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch { /* try the next */ }
  }
  return null;
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export class LivePublisher {
  constructor({
    base, id, key, onStats, onGone, onError,
  }) {
    this.base = base.replace(/\/$/, '');
    this.id = id;
    this.key = key;
    this.onStats = onStats || (() => {});
    this.onGone = onGone || (() => {});
    this.onError = onError || (() => {});
    this.running = false;
    this.rung = 0;
    this.queue = [];
    this.sending = 0;
    this.gop = -1;
    this.part = 0;
    this.frag = 0;
    this.epoch = -1;
    this.t0 = null;
    this.pendingVideo = [];
    this.pendingAudio = [];
    this.audioTick = null;
    this.avcC = null;
    this.size = null;
    this.lastFrameUs = 0;
    this.lastKeyUs = 0;
    this.forceKey = true;
    this.stats = { sentBytes: 0, startedAt: 0, dropped: 0, viewers: 0 };
    this.lastThumbAt = 0;
  }

  /** A new live (after the server lost the old one): same camera, new address. */
  retarget(id, key) {
    this.id = id;
    this.key = key;
    this.queue = [];
    this.gop = -1;
    this.part = 0;
    this.epoch = -1;
    this.gone = false;
    // The next piece starts on a key frame, after a fresh init (the
    // encoder only describes itself once, so the last description is reused).
    this.pendingVideo = [];
    this.pendingAudio = [];
    this.forceKey = true;
    // A new live starts its clock at zero (the next key frame), as a fresh
    // one does: Android's player stalls on one that starts minutes in.
    this.t0 = null;
    this.audioTick = null;
    this.frag = 0;
    if (this.avcC) {
      const avcC = this.avcC;
      this.avcC = null;
      this.newEpoch(avcC);
    }
  }

  async start(stream) {
    this.running = true;
    this.stats.startedAt = Date.now();
    this.audioConfig = await pickAudioConfig();
    if (!this.audioConfig) throw new Error('This browser cannot compress live sound.');
    this.audioCodec = this.audioConfig.codec === 'opus' ? 'opus' : 'aac';
    this.startAudioEncoder();
    await this.attach(stream);
  }

  async replaceStream(stream) {
    this.detach();
    this.forceKey = true;
    await this.attach(stream);
  }

  stop() {
    this.running = false;
    this.detach();
    try { this.videoEncoder?.close(); } catch { /* closed */ }
    try { this.audioEncoder?.close(); } catch { /* closed */ }
    this.queue = [];
  }

  // ── Sources ───────────────────────────────────────────────────────────

  async attach(stream) {
    this.stream = stream;
    const video = stream.getVideoTracks()[0];
    const audio = stream.getAudioTracks()[0];
    if (video) this.readVideo(video);
    if (audio) await this.readAudio(stream);
  }

  detach() {
    this.videoToken = {};
    try { this.videoReader?.cancel(); } catch { /* done */ }
    this.videoReader = null;
    if (this.fallbackVideo) {
      this.fallbackVideo.pause();
      this.fallbackVideo.srcObject = null;
      this.fallbackVideo = null;
    }
    try { this.micNode?.disconnect(); } catch { /* done */ }
    try { this.micSource?.disconnect(); } catch { /* done */ }
    this.micNode = null;
    this.micSource = null;
  }

  readVideo(track) {
    const token = {};
    this.videoToken = token;
    // Chrome hands over the camera's frames as they are; elsewhere they are
    // drawn off a hidden <video>.
    if (typeof window.MediaStreamTrackProcessor === 'function') {
      const reader = new window.MediaStreamTrackProcessor({ track }).readable.getReader();
      this.videoReader = reader;
      const pump = async () => {
        while (this.running && this.videoToken === token) {
          let result;
          try {
            // eslint-disable-next-line no-await-in-loop
            result = await reader.read();
          } catch { return; }
          if (result.done) return;
          this.onFrame(result.value);
        }
      };
      pump();
      return;
    }
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    this.fallbackVideo = el;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const draw = () => {
      if (!this.running || this.videoToken !== token) return;
      if (el.videoWidth) {
        if (canvas.width !== el.videoWidth) { canvas.width = el.videoWidth; canvas.height = el.videoHeight; }
        ctx.drawImage(el, 0, 0);
        this.onFrame(new VideoFrame(canvas, { timestamp: nowUs() }));
      }
      if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(draw);
    else requestAnimationFrame(draw);
  }

  async readAudio(stream) {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      // Served by the live module itself (server/router.js), from this site.
      await this.audioCtx.audioWorklet.addModule(`${this.base}/mic-worklet.js`);
      // The tap must reach the speakers to run; silently.
      this.silence = this.audioCtx.createGain();
      this.silence.gain.value = 0;
      this.silence.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume().catch(() => {});
    const source = this.audioCtx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(this.audioCtx, 'emoorm-mic-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (e) => this.onAudioBlock(e.data);
    source.connect(node);
    node.connect(this.silence);
    this.micSource = source;
    this.micNode = node;
  }

  // ── Video ─────────────────────────────────────────────────────────────

  onFrame(frame) {
    const at = nowUs();
    const tooSoon = this.lastFrameUs && at - this.lastFrameUs < (1000000 / FPS) * 0.8;
    const busy = this.videoEncoder && this.videoEncoder.encodeQueueSize > 2;
    if (!this.running || tooSoon || busy || this.configuring) {
      frame.close();
      return;
    }
    const width = even(frame.displayWidth);
    const height = even(frame.displayHeight);
    if (!this.size || this.size.width !== width || this.size.height !== height) {
      frame.close();
      this.configure(width, height);
      return;
    }
    this.lastFrameUs = at;
    const key = this.forceKey || at - this.lastKeyUs >= SEGMENT_US;
    if (key) {
      this.forceKey = false;
      this.lastKeyUs = at;
    }
    if (Date.now() - this.lastThumbAt > THUMB_EVERY_MS) {
      this.lastThumbAt = Date.now();
      this.sendThumb(frame.clone());
    }
    const stamped = new VideoFrame(frame, { timestamp: at });
    frame.close();
    try {
      this.videoEncoder.encode(stamped, { keyFrame: key });
    } catch (err) {
      this.onError(err);
    }
    stamped.close();
  }

  async configure(width, height, keepSize) {
    if (this.configuring) return;
    this.configuring = true;
    try {
      const config = await pickVideoConfig(width, height, LADDER[this.rung]);
      if (!config) {
        this.onError(new Error('This phone cannot compress live video.'));
        return;
      }
      if (!this.videoEncoder || this.videoEncoder.state === 'closed') {
        this.videoEncoder = new VideoEncoder({
          output: (chunk, meta) => this.onVideoChunk(chunk, meta),
          error: (err) => this.onError(err),
        });
      }
      this.videoEncoder.configure(config);
      if (!keepSize) this.size = { width, height };
      this.forceKey = true;
    } finally {
      this.configuring = false;
    }
  }

  onVideoChunk(chunk, meta) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const key = chunk.type === 'key';
    if (key) {
      if (this.t0 === null) this.t0 = chunk.timestamp;
      // The group of pictures before this one is complete.
      if (this.pendingVideo.length) this.flush(chunk.timestamp, true);
      const description = meta?.decoderConfig?.description;
      if (description) {
        const avcC = new Uint8Array(description.buffer ? description.buffer.slice(description.byteOffset ?? 0, (description.byteOffset ?? 0) + description.byteLength) : description);
        if (!this.avcC || !sameBytes(avcC, this.avcC)) this.newEpoch(avcC);
      }
      // A new group (a second): it goes up whole, in one piece, when the
      // next key frame comes -- one upload a second, as the first version.
      // (Uploading fifths of a second was five trips a second through the
      // site's CDN; the seller fell behind, seconds were dropped half-sent,
      // and viewers froze on the holes.)
      this.gop += 1;
      this.part = 0;
    }
    // Nothing before the first set-up and key frame.
    if (!this.avcC || this.t0 === null) return;
    if (this.gop < 0 || (!this.pendingVideo.length && !key && this.part === 0)) return;
    this.pendingVideo.push({ data, ts: chunk.timestamp, key });
  }

  newEpoch(avcC) {
    this.avcC = avcC;
    this.epoch += 1;
    const audio = this.audioCodec === 'opus'
      ? { codec: 'opus', sampleRate: SAMPLE_RATE, channels: 1, preSkip: 312 }
      : { codec: 'aac', sampleRate: SAMPLE_RATE, channels: 1, config: aacConfig(SAMPLE_RATE, 1) };
    const init = initSegment({ width: this.size.width, height: this.size.height, avcC }, audio);
    const codecs = `${avcCodec(avcC)},${this.audioCodec === 'opus' ? 'opus' : 'mp4a.40.2'}`;
    this.enqueue({
      kind: 'init', epoch: this.epoch, codecs, data: init,
    });
  }

  // ── Audio ─────────────────────────────────────────────────────────────

  startAudioEncoder() {
    this.audioEncoder = new AudioEncoder({
      output: (chunk) => this.onAudioChunk(chunk),
      error: (err) => this.onError(err),
    });
    this.audioEncoder.configure(this.audioConfig);
    this.audioSamples = 0;
    this.audioStartUs = null;
  }

  onAudioBlock(samples) {
    if (!this.running || this.audioEncoder.state !== 'configured') return;
    // The clock of the sound is its own sample count, started from when
    // the first block came in (so it lines up with the camera's).
    if (this.audioStartUs === null) this.audioStartUs = nowUs() - Math.round((AUDIO_BLOCK * 1e6) / SAMPLE_RATE);
    const timestamp = this.audioStartUs + Math.round((this.audioSamples * 1e6) / SAMPLE_RATE);
    this.audioSamples += samples.length;
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: SAMPLE_RATE,
      numberOfFrames: samples.length,
      numberOfChannels: 1,
      timestamp,
      data: samples,
    });
    try {
      this.audioEncoder.encode(data);
    } catch (err) {
      this.onError(err);
    }
    data.close();
  }

  onAudioChunk(chunk) {
    if (this.t0 === null || chunk.timestamp < this.t0) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const duration = this.audioCodec === 'aac'
      ? 1024
      : Math.max(1, Math.round(((chunk.duration || 20000) * SAMPLE_RATE) / 1e6));
    if (this.audioTick === null) this.audioTick = Math.round(((chunk.timestamp - this.t0) * SAMPLE_RATE) / 1e6);
    this.pendingAudio.push({ data, duration, tick: this.audioTick });
    this.audioTick += duration;
  }

  // ── Pieces ────────────────────────────────────────────────────────────

  /**
   * One piece: the frames of a second, up to `nextTs` (the next key frame).
   * `last`: it ends its group of pictures -- always, one piece a second.
   */
  flush(nextTs, last) {
    const frames = this.pendingVideo;
    this.pendingVideo = [];
    const tick = (ts) => Math.round(((ts - this.t0) * VIDEO_TIMESCALE) / 1e6);
    const samples = frames.map((f, i) => {
      const next = i + 1 < frames.length ? frames[i + 1].ts : nextTs;
      return { data: f.data, key: f.key, duration: Math.max(1, tick(next) - tick(f.ts)) };
    });
    const audio = this.pendingAudio;
    this.pendingAudio = [];
    const part = this.part;
    this.part += 1;
    this.frag += 1;
    const data = mediaSegment(
      this.frag,
      { baseTime: tick(frames[0].ts), samples },
      audio.length ? { baseTime: audio[0].tick, samples: audio } : null,
    );
    this.enqueue({
      kind: 'part',
      seq: this.gop,
      part,
      last,
      epoch: this.epoch,
      dur: Math.max(1, Math.round((nextTs - frames[0].ts) / 1000)),
      data,
    });
  }

  /** Milliseconds of video waiting to be uploaded. */
  waitingMs() {
    return this.queue.reduce((n, q) => n + (q.dur || 0), 0);
  }

  enqueue(item) {
    if (item.kind === 'part') {
      const waiting = this.waitingMs();
      // Two seconds behind: the picture gets lighter. Four: the oldest
      // whole second goes (an init never does, nor one being sent), so
      // viewers stay near now -- a clean skip, never half a second.
      if (waiting >= 2000) this.stepDown();
      if (waiting >= 4000) {
        const drop = this.queue.find((q) => q.kind === 'part' && !q.inFlight);
        if (drop) {
          this.queue.splice(this.queue.indexOf(drop), 1);
          this.stats.dropped += 1;
        }
      }
    }
    this.queue.push(item);
    this.pump();
  }

  stepDown() {
    if (this.rung >= LADDER.length - 1 || Date.now() - (this.rungAt || 0) < 4000) return;
    this.rung += 1;
    this.rungAt = Date.now();
    if (this.size) this.configure(this.size.width, this.size.height, true);
  }

  stepUp() {
    if (this.rung === 0 || Date.now() - (this.rungAt || 0) < 20000) return;
    this.rung -= 1;
    this.rungAt = Date.now();
    if (this.size) this.configure(this.size.width, this.size.height, true);
  }

  /**
   * Starts uploads: up to MAX_UPLOADS seconds on their way at once. Through
   * the site's CDN an upload takes one to three seconds, longer than the
   * second it carries, so one at a time could never keep up. A set-up piece
   * (init) goes alone, before the seconds that need it.
   */
  pump() {
    while (this.running && !this.gone && this.sending < MAX_UPLOADS) {
      const item = this.queue.find((q) => !q.inFlight);
      if (!item) return;
      if (this.queue.some((q) => q.inFlight && q.kind === 'init')) return;
      if (item.kind === 'init' && this.sending > 0) return;
      item.inFlight = true;
      this.sending += 1;
      this.send(item);
    }
  }

  async send(item) {
    const started = performance.now();
    const done = await this.upload(item);
    this.sending -= 1;
    this.queue = this.queue.filter((q) => q !== item);
    if (done) {
      this.stats.sentBytes += item.data.byteLength;
      // Sent in well under its own length, with nothing waiting: room for more.
      if (item.kind === 'part' && !this.queue.length && performance.now() - started < item.dur * 0.35) this.stepUp();
      this.onStats({
        ...this.stats,
        seconds: Math.round((Date.now() - this.stats.startedAt) / 1000),
        kbps: Math.round(LADDER[this.rung] / 1000),
        // Seconds of video still to upload.
        behind: Math.floor(this.waitingMs() / 1000),
      });
    }
    this.pump();
  }

  async upload(item) {
    const many = item.sizes ? `&sizes=${item.sizes.join(',')}&durs=${item.durs.join(',')}` : '';
    const url = item.kind === 'init'
      ? `${this.base}/${this.id}/init?epoch=${item.epoch}&codecs=${encodeURIComponent(item.codecs)}`
      : `${this.base}/${this.id}/seg?seq=${item.seq}&part=${item.part}&last=${item.last ? 1 : 0}&epoch=${item.epoch}&dur=${item.dur}${many}`;
    for (let attempt = 0; attempt < 3 && this.running; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(url, {
          method: item.kind === 'init' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Live-Key': this.key },
          body: item.data,
        });
        if (res.ok) {
          if (item.kind === 'part' && item.last) {
            // eslint-disable-next-line no-await-in-loop
            const body = await res.json().catch(() => null);
            if (body?.data?.viewers != null) this.stats.viewers = body.data.viewers;
          } else {
            res.body?.cancel?.().catch?.(() => {});
          }
          return true;
        }
        if (res.status === 404 || res.status === 410 || res.status === 403) {
          // The server no longer has this live (it restarted, or it ended).
          this.gone = true;
          this.queue = [];
          this.onGone();
          return false;
        }
      } catch { /* the network: try again */ }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => { setTimeout(r, 300 * (attempt + 1)); });
    }
    return false;
  }

  async sendThumb(frame) {
    try {
      if (!this.running) return;
      const scale = 360 / Math.max(frame.displayWidth, frame.displayHeight);
      const width = even(frame.displayWidth * scale);
      const height = even(frame.displayHeight * scale);
      const bitmap = await createImageBitmap(frame, { resizeWidth: width, resizeHeight: height });
      frame.close();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise((r) => { canvas.toBlob(r, 'image/jpeg', 0.72); });
      if (!blob || !this.running) return;
      await fetch(`${this.base}/${this.id}/thumb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Live-Key': this.key },
        body: blob,
      });
    } catch { /* a missing picture is fine */ } finally {
      frame.close();
    }
  }
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
