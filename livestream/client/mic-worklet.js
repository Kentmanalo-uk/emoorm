/*
 * The microphone, in blocks of 1024 samples, off the page's main thread
 * (publisher.js turns each block into an AudioData for the encoder).
 */
const BLOCK = 1024;

class EmoormMicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(BLOCK);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    const frames = channel ? channel.length : 128;
    for (let i = 0; i < frames; i += 1) {
      this.block[this.filled] = channel ? channel[i] : 0;
      this.filled += 1;
      if (this.filled === BLOCK) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(BLOCK);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('emoorm-mic-tap', EmoormMicTap);
