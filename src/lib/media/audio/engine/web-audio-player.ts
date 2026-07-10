/**
 * Web Audio 增强播放（EQ 预设 / 音量记忆）
 */

const VOLUME_STORAGE_KEY = 'reader_web_audio_gain';
const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop: [3, 2, 0, -1, -2, -1, 0, 1, 2, 3],
  rock: [4, 3, 1, 0, -1, 0, 1, 2, 3, 4],
  jazz: [2, 1, 0, 1, 2, 2, 1, 0, 1, 2],
  classical: [3, 2, 1, 0, 0, 0, 1, 2, 3, 4],
};

export interface WebAudioPlayerOptions {
  audioElement: HTMLAudioElement;
  gain?: number;
  eqPreset?: keyof typeof EQ_PRESETS;
}

export class WebAudioPlayerEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private audioEl: HTMLAudioElement;

  constructor(options: WebAudioPlayerOptions) {
    this.audioEl = options.audioElement;
    const savedGain = readSavedGain();
    this.ensureGraph(options.gain ?? savedGain, options.eqPreset ?? 'flat');
  }

  private ensureGraph(gain: number, preset: keyof typeof EQ_PRESETS): void {
    if (this.ctx) {
      if (this.gainNode) this.gainNode.gain.value = gain;
      this.applyEqPreset(preset);
      return;
    }
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaElementSource(this.audioEl);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = gain;

    const freqs = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    let prev: AudioNode = this.source;
    this.eqNodes = freqs.map((freq) => {
      const node = this.ctx!.createBiquadFilter();
      node.type = 'peaking';
      node.frequency.value = freq;
      node.Q.value = 1;
      node.gain.value = 0;
      prev.connect(node);
      prev = node;
      return node;
    });
    prev.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    this.applyEqPreset(preset);
  }

  applyEqPreset(preset: keyof typeof EQ_PRESETS): void {
    const gains = EQ_PRESETS[preset] ?? EQ_PRESETS.flat;
    for (let i = 0; i < this.eqNodes.length; i++) {
      this.eqNodes[i]!.gain.value = gains[i] ?? 0;
    }
  }

  setGain(value: number): void {
    const clamped = Math.max(0, Math.min(2, value));
    if (this.gainNode) this.gainNode.gain.value = clamped;
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  dispose(): void {
    try {
      this.source?.disconnect();
      for (const n of this.eqNodes) n.disconnect();
      this.gainNode?.disconnect();
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.source = null;
    this.gainNode = null;
    this.eqNodes = [];
  }
}

function readSavedGain(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

export { EQ_PRESETS };
