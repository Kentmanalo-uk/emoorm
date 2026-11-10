/* Moormy's ear: takes the microphone at whatever rate the browser runs
 * (44.1 or 48 kHz, usually), averages it down to 16 kHz mono and posts
 * pieces of 2048 samples (128 ms) to the page. Nothing is kept or sent
 * anywhere; the page turns each piece into numbers and lets it go.
 * (web/src/lib/moormy/wake/listener.js) */
class MoormyCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000; // input samples per output sample
    this.pos = 0; // how far into the current output sample we are
    this.sum = 0;
    this.count = 0;
    this.out = new Float32Array(2048);
    this.n = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    const len = channels[0].length;
    for (let i = 0; i < len; i += 1) {
      let v = 0;
      for (let c = 0; c < channels.length; c += 1) v += channels[c][i];
      this.sum += v / channels.length;
      this.count += 1;
      this.pos += 1;
      if (this.pos >= this.step) {
        this.pos -= this.step;
        this.out[this.n] = this.sum / this.count;
        this.n += 1;
        this.sum = 0;
        this.count = 0;
        if (this.n === this.out.length) {
          this.port.postMessage(this.out, [this.out.buffer]);
          this.out = new Float32Array(2048);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('moormy-capture', MoormyCapture);
