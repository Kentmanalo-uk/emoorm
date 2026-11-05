/*
 * Fragmented MP4, written by hand: the set-up piece (ftyp + moov) once, then
 * one moof + mdat per second of video. That is all a browser's Media Source,
 * Safari's HLS and the phone app's player need, so there is no muxing
 * library. H.264 video (the encoder's own avcC), AAC or Opus audio.
 *
 * Layout references: ISO/IEC 14496-12 (boxes), 14496-15 (avcC), 14496-14
 * (esds), and the Opus-in-ISOBMFF spec (dOps).
 */

const enc = new TextEncoder();

const u8 = (n) => [n & 0xff];
const u16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const u24 = (n) => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u64 = (n) => {
  const hi = Math.floor(n / 2 ** 32);
  return [...u32(hi), ...u32(n - hi * 2 ** 32)];
};
const str = (s) => [...enc.encode(s)];
const zeros = (n) => new Array(n).fill(0);

/** Joins byte arrays and Uint8Arrays into one Uint8Array. */
const concat = (parts) => {
  let size = 0;
  for (const p of parts) size += p.length;
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A box: size, type, then its contents (byte arrays or Uint8Arrays). */
const box = (type, ...parts) => {
  const body = concat(parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p))));
  return concat([Uint8Array.from([...u32(body.length + 8), ...str(type)]), body]);
};
const fullBox = (type, version, flags, ...parts) => box(type, [version, ...u24(flags)], ...parts);

const MATRIX = [
  ...u32(0x00010000), ...u32(0), ...u32(0),
  ...u32(0), ...u32(0x00010000), ...u32(0),
  ...u32(0), ...u32(0), ...u32(0x40000000),
];

export const VIDEO_TIMESCALE = 90000;
export const VIDEO_TRACK = 1;
export const AUDIO_TRACK = 2;

// ── The set-up piece ────────────────────────────────────────────────────

const tkhd = (id, { width = 0, height = 0, audio = false }) => fullBox('tkhd', 0, 3,
  u32(0), u32(0), u32(id), u32(0), u32(0), // created, modified, id, reserved, duration
  zeros(8), u16(0), u16(0), u16(audio ? 0x0100 : 0), u16(0),
  MATRIX, u32(width << 16), u32(height << 16));

const mdhd = (timescale) => fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(0), u16(0x55c4), u16(0));

const hdlr = (audio) => fullBox('hdlr', 0, 0, u32(0), str(audio ? 'soun' : 'vide'), zeros(12),
  str(audio ? 'SoundHandler' : 'VideoHandler'), [0]);

const dinf = () => box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));

const emptyTables = () => [
  fullBox('stts', 0, 0, u32(0)),
  fullBox('stsc', 0, 0, u32(0)),
  fullBox('stsz', 0, 0, u32(0), u32(0)),
  fullBox('stco', 0, 0, u32(0)),
];

const avc1 = ({ width, height, avcC }) => box('avc1',
  zeros(6), u16(1), // reserved, data reference index
  u16(0), u16(0), zeros(12), // pre-defined, reserved
  u16(width), u16(height),
  u32(0x00480000), u32(0x00480000), u32(0), u16(1),
  zeros(32), // compressor name
  u16(0x0018), u16(0xffff),
  box('avcC', avcC));

/** An MPEG-4 descriptor: tag, length (one byte suffices here), body. */
const descriptor = (tag, body) => [tag, body.length, ...body];

const mp4a = ({ sampleRate, channels, config }) => {
  const asc = [...config];
  const decoderConfig = descriptor(0x04, [
    0x40, // MPEG-4 audio
    0x15, // audio stream
    ...u24(0), ...u32(0), ...u32(0),
    ...descriptor(0x05, asc),
  ]);
  const es = descriptor(0x03, [...u16(AUDIO_TRACK), 0, ...decoderConfig, ...descriptor(0x06, [0x02])]);
  return box('mp4a',
    zeros(6), u16(1), zeros(8),
    u16(channels), u16(16), u16(0), u16(0), u32(sampleRate << 16),
    fullBox('esds', 0, 0, es));
};

const opus = ({ sampleRate, channels, preSkip }) => box('Opus',
  zeros(6), u16(1), zeros(8),
  u16(channels), u16(16), u16(0), u16(0), u32(48000 << 16),
  box('dOps', [0, channels], u16(preSkip), u32(sampleRate), u16(0), [0]));

const trak = (id, { audio, timescale, entry, width, height }) => box('trak',
  tkhd(id, { width, height, audio }),
  box('mdia',
    mdhd(timescale),
    hdlr(audio),
    box('minf',
      audio ? fullBox('smhd', 0, 0, u16(0), u16(0)) : fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
      dinf(),
      box('stbl', fullBox('stsd', 0, 0, u32(1), entry), ...emptyTables()))));

const trex = (id) => fullBox('trex', 0, 0, u32(id), u32(1), u32(0), u32(0), u32(0));

/**
 * @param {Object} video - { width, height, avcC: Uint8Array }
 * @param {Object|null} audio - { codec: 'aac'|'opus', sampleRate, channels, config?: Uint8Array, preSkip? }
 * @returns {Uint8Array}
 */
export function initSegment(video, audio) {
  const ftyp = box('ftyp', str('isom'), u32(1), str('isom'), str('iso6'), str('mp41'), str('avc1'));
  const traks = [trak(VIDEO_TRACK, {
    audio: false, timescale: VIDEO_TIMESCALE, entry: avc1(video), width: video.width, height: video.height,
  })];
  const trexes = [trex(VIDEO_TRACK)];
  if (audio) {
    const timescale = audio.codec === 'opus' ? 48000 : audio.sampleRate;
    traks.push(trak(AUDIO_TRACK, {
      audio: true,
      timescale,
      entry: audio.codec === 'opus' ? opus(audio) : mp4a(audio),
    }));
    trexes.push(trex(AUDIO_TRACK));
  }
  const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0),
    u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(audio ? 3 : 2));
  return concat([ftyp, box('moov', mvhd, ...traks, box('mvex', ...trexes))]);
}

// ── One second of video ─────────────────────────────────────────────────

const KEY_FLAGS = 0x02000000; // depends on nothing
const DELTA_FLAGS = 0x01010000; // depends on others, not a sync sample

const traf = (id, baseTime, samples, dataOffset, video) => {
  const flags = video ? 0x000701 : 0x000301; // offset, duration, size (+ flags for video)
  const entries = [];
  for (const s of samples) {
    entries.push(...u32(s.duration), ...u32(s.data.byteLength));
    if (video) entries.push(...u32(s.key ? KEY_FLAGS : DELTA_FLAGS));
  }
  return box('traf',
    fullBox('tfhd', 0, 0x020000, u32(id)), // default-base-is-moof
    fullBox('tfdt', 1, 0, u64(baseTime)),
    fullBox('trun', 0, flags, u32(samples.length), u32(dataOffset), entries));
};

/**
 * @param {Number} seq - fragment sequence number (from 1)
 * @param {Object} video - { baseTime, samples: [{ data, duration, key }] } (90 kHz)
 * @param {Object|null} audio - { baseTime, samples: [{ data, duration }] } (its own clock)
 * @returns {Uint8Array}
 */
export function mediaSegment(seq, video, audio) {
  const hasAudio = Boolean(audio && audio.samples.length);
  const build = (videoOffset, audioOffset) => box('moof',
    fullBox('mfhd', 0, 0, u32(seq)),
    traf(VIDEO_TRACK, video.baseTime, video.samples, videoOffset, true),
    ...(hasAudio ? [traf(AUDIO_TRACK, audio.baseTime, audio.samples, audioOffset, false)] : []));
  // The offsets do not change the size: build once to measure, once for real.
  const size = build(0, 0).length;
  const videoBytes = video.samples.reduce((n, s) => n + s.data.byteLength, 0);
  const moof = build(size + 8, size + 8 + videoBytes);
  const payload = [...video.samples.map((s) => s.data), ...(hasAudio ? audio.samples.map((s) => s.data) : [])];
  const mdatSize = 8 + payload.reduce((n, p) => n + p.byteLength, 0);
  return concat([moof, Uint8Array.from([...u32(mdatSize), ...str('mdat')]), ...payload]);
}

/** The codecs string for Media Source, from the avcC: avc1.PPCCLL. */
export function avcCodec(avcC) {
  const hex = (n) => n.toString(16).padStart(2, '0');
  return `avc1.${hex(avcC[1])}${hex(avcC[2])}${hex(avcC[3])}`;
}

/** AudioSpecificConfig for AAC-LC when the encoder gives none. */
export function aacConfig(sampleRate, channels) {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const index = Math.max(0, rates.indexOf(sampleRate));
  return Uint8Array.from([(2 << 3) | (index >> 1), ((index & 1) << 7) | (channels << 3)]);
}
