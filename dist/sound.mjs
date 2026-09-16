// Local synthesized placeholders: no network, prerecorded voices, or music service.
export class Soundscape {
  context = null;
  master = null;
  level = 0.35;
  rain = null;
  music = null;
  async unlock() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Audio unavailable");
    if (!this.context) {
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.gain.value = this.level * 0.25;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }
  volume(value) {
    this.level = Math.max(0, Math.min(100, value)) / 100;
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.level * 0.25,
        this.context.currentTime,
        0.1,
      );
  }
  async toggle(kind) {
    await this.unlock();
    if (this[kind]) {
      this[kind].stop();
      this[kind] = null;
      return false;
    }
    if (kind === "rain") this.rain = this.makeRain();
    if (kind === "music") this.music = this.makeMusic();
    return true;
  }
  makeRain() {
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    const buffer = c.createBuffer(2, c.sampleRate * 4, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.025;
        data[i] = last * 5;
      }
    }
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    gain.gain.value = 0.65;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return {
      stop: () => {
        source.stop();
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      },
    };
  }
  makeMusic() {
    const c = this.context,
      source = c.createBufferSource();
    const seconds = 32,
      buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate),
      data = buffer.getChannelData(0);
    const chords = [
      [130.81, 164.81, 196, 246.94],
      [110, 130.81, 164.81, 196],
      [87.31, 110, 130.81, 164.81],
      [98, 123.47, 146.83, 196],
    ];
    for (let i = 0; i < data.length; i++) {
      const t = i / c.sampleRate,
        section = Math.floor(t / 8),
        local = t % 8,
        envelope = Math.sin((Math.PI * local) / 8) ** 2;
      let value = 0;
      for (const hz of chords[section])
        value += Math.sin(2 * Math.PI * hz * t) * 0.12 * envelope;
      const beat = t % 2,
        frequency = chords[section][Math.floor(local / 2)];
      value +=
        Math.sin(2 * Math.PI * frequency * 2 * t) * Math.exp(-beat * 3) * 0.08;
      data[i] = value * 0.45;
    }
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.master);
    source.start();
    return {
      stop: () => {
        source.stop();
        source.disconnect();
      },
    };
  }
  async chime() {
    if (!this.context || this.context.state !== "running") return;
    const c = this.context;
    for (const [offset, hz] of [
      [0, 659.25],
      [0.18, 880],
    ]) {
      const osc = c.createOscillator(),
        gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0, c.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.4, c.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        c.currentTime + offset + 0.9,
      );
      osc.connect(gain).connect(this.master);
      osc.start(c.currentTime + offset);
      osc.stop(c.currentTime + offset + 1);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }
}
