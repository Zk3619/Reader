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
  eqCustomGains?: number[] | null;
  outputDeviceId?: string;
  maxChannels?: number;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export class WebAudioPlayerEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private audioEl: HTMLAudioElement;

  constructor(options: WebAudioPlayerOptions) {
    this.audioEl = options.audioElement;
    const savedGain = readSavedGain();
    this.ensureGraph(options.gain ?? savedGain, options.eqPreset ?? 'flat');
    if (options.eqCustomGains) this.applyCustomEq(options.eqCustomGains);
    this.setMaxChannels(options.maxChannels ?? 2);
    if (options.outputDeviceId) void this.setOutputDevice(options.outputDeviceId);
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
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 256;
    prev.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    this.applyEqPreset(preset);
  }

  applyEqPreset(preset: keyof typeof EQ_PRESETS): void {
    const gains = EQ_PRESETS[preset] ?? EQ_PRESETS.flat;
    for (let i = 0; i < this.eqNodes.length; i++) {
      this.eqNodes[i]!.gain.value = gains[i] ?? 0;
    }
  }

  applyCustomEq(gains: readonly number[]): void {
    for (let i = 0; i < this.eqNodes.length; i++) {
      this.eqNodes[i]!.gain.value = Math.max(-12, Math.min(12, gains[i] ?? 0));
    }
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    const target = this.audioEl as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    if (!target.setSinkId) return false;
    try {
      await target.setSinkId(deviceId || 'default');
      return true;
    } catch {
      if (deviceId) {
        await target.setSinkId('default').catch(() => undefined);
      }
      return false;
    }
  }

  setMaxChannels(channels: number): void {
    if (!this.ctx) return;
    const destination = this.ctx.destination;
    const max = Math.max(1, Math.min(destination.maxChannelCount || 2, Math.round(channels)));
    try {
      destination.channelCountMode = 'explicit';
      destination.channelCount = max;
    } catch {
      // 部分 WebView 不允许修改 destination 声道数。
    }
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  static supportsOutputSelection(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  static async enumerateOutputDevices(): Promise<AudioOutputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audiooutput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `音频输出 ${index + 1}`,
        isDefault: device.deviceId === 'default',
      }));
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
      this.analyserNode?.disconnect();
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.source = null;
    this.gainNode = null;
    this.analyserNode = null;
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
