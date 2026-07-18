/**
 * Web Audio 增强播放（EQ 预设 / 音量记忆）
 */

import { peekMusicConfigSync, patchMusicConfig } from '@/lib/media/audio/music-config-storage';

const VOLUME_STORAGE_KEY = 'reader_web_audio_gain';

function readPersistedGain(): number {
  try {
    const g = peekMusicConfigSync().volumeGain;
    if (Number.isFinite(g) && g > 0) return g;
  } catch { /* */ }
  try {
    const v = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* */ }
  return 1;
}

function writePersistedGain(gain: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(gain));
  } catch { /* */ }
  patchMusicConfig({ volumeGain: gain });
}
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

export interface ResolvedOutputDevice {
  /** 实际可用的 deviceId（缺失时回退为 'default'） */
  deviceId: string;
  label: string;
  /** 保存的设备已不存在，已回退到默认 */
  missing: boolean;
}

/** 为无 label 的设备生成兜底名称，并美化 default/communications 伪设备 */
function friendlyOutputLabel(
  device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>,
  index: number,
): string {
  const raw = device.label?.trim();
  if (device.deviceId === 'default') {
    return raw ? `系统默认（${raw.replace(/^default\s*-\s*/i, '')}）` : '系统默认';
  }
  if (device.deviceId === 'communications') {
    return raw ? `通信设备（${raw.replace(/^communications\s*-\s*/i, '')}）` : '通信设备';
  }
  return raw || `音频输出 ${index + 1}`;
}

type PitchShifterLoadStatus = 'none' | 'loading' | 'unconnect' | 'connected';

export class WebAudioPlayerEngine {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private audioEl: HTMLAudioElement;
  private pitchShifterNode: AudioWorkletNode | null = null;
  private pitchFactorParam: AudioParam | null = null;
  private pitchLoadStatus: PitchShifterLoadStatus = 'none';
  private pitchFactor = 1;

  constructor(options: WebAudioPlayerOptions) {
    this.audioEl = options.audioElement;
    const savedGain = readSavedGain();
    this.ensureGraph(options.gain ?? savedGain, options.eqPreset ?? 'flat');
    if (options.eqCustomGains) this.applyCustomEq(options.eqCustomGains);
    this.setMaxChannels(options.maxChannels ?? 2);
    if (options.outputDeviceId) void this.setOutputDevice(options.outputDeviceId);
  }

  private lastEqNode(): AudioNode | null {
    return this.eqNodes[this.eqNodes.length - 1] ?? this.source;
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
    // source -> eq -> gain -> analyser -> destination（音调节点按需插入）
    prev.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
    this.applyEqPreset(preset);
  }

  private connectPitchShifter(): void {
    if (!this.pitchShifterNode || !this.gainNode || !this.pitchFactorParam) return;
    if (this.pitchLoadStatus === 'connected') {
      this.pitchFactorParam.value = this.pitchFactor;
      return;
    }
    const lastEq = this.lastEqNode();
    if (!lastEq) return;
    try {
      lastEq.disconnect();
      lastEq.connect(this.pitchShifterNode);
      this.pitchShifterNode.connect(this.gainNode);
      this.pitchLoadStatus = 'connected';
      this.pitchFactorParam.value = this.pitchFactor;
    } catch (err) {
      console.warn('[music] connect pitch shifter failed', err);
    }
  }

  private disconnectPitchShifter(): void {
    if (this.pitchLoadStatus !== 'connected' || !this.pitchShifterNode || !this.gainNode) {
      return;
    }
    const lastEq = this.lastEqNode();
    if (!lastEq) return;
    try {
      lastEq.disconnect();
      this.pitchShifterNode.disconnect();
      lastEq.connect(this.gainNode);
      this.pitchLoadStatus = 'unconnect';
    } catch (err) {
      console.warn('[music] disconnect pitch shifter failed', err);
    }
  }

  private loadPitchShifter(): void {
    if (!this.ctx || this.pitchLoadStatus === 'loading') return;
    this.pitchLoadStatus = 'loading';
    void import('./pitch-shifter/phase-vocoder.js?worker&url')
      .then(({ default: url }) => this.ctx!.audioWorklet.addModule(url))
      .then(() => {
        if (!this.ctx) return;
        this.pitchShifterNode = new AudioWorkletNode(this.ctx, 'phase-vocoder-processor', {
          outputChannelCount: [2],
        });
        const param = this.pitchShifterNode.parameters.get('pitchFactor');
        if (!param) {
          this.pitchLoadStatus = 'none';
          return;
        }
        this.pitchFactorParam = param;
        this.pitchLoadStatus = 'unconnect';
        if (this.pitchFactor !== 1) this.connectPitchShifter();
      })
      .catch((err) => {
        console.warn('[music] pitch shifter worklet failed to load', err);
        this.pitchLoadStatus = 'none';
      });
  }

  /** 对齐 lx setPitchShifter：1 为原调，偏离时接入 phase-vocoder */
  setPitchShifter(rate: number): void {
    const next = Math.max(0.5, Math.min(1.5, Math.round(rate * 100) / 100));
    this.pitchFactor = next;
    switch (this.pitchLoadStatus) {
      case 'loading':
        break;
      case 'none':
        if (next !== 1) this.loadPitchShifter();
        break;
      case 'connected':
        if (next === 1) this.disconnectPitchShifter();
        else if (this.pitchFactorParam) this.pitchFactorParam.value = next;
        break;
      case 'unconnect':
        if (next !== 1) this.connectPitchShifter();
        break;
    }
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

  private freqData: Uint8Array | null = null;

  getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    if (!this.freqData || this.freqData.length !== this.analyserNode.frequencyBinCount) {
      this.freqData = new Uint8Array(this.analyserNode.frequencyBinCount);
    }
    this.analyserNode.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  static supportsOutputSelection(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  static supportsDeviceEnumeration(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.enumerateDevices;
  }

  /**
   * 请求媒体权限以显示设备名称：浏览器/WebView 未授权时 enumerateDevices
   * 返回的 audiooutput label 为空，需先获取一次麦克风权限才能读取标签。
   * 返回是否成功解锁标签。
   */
  static async requestDeviceLabelPermission(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 立即释放，仅为解锁设备标签
      for (const track of stream.getTracks()) track.stop();
      return true;
    } catch {
      return false;
    }
  }

  static async enumerateOutputDevices(): Promise<AudioOutputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === 'audiooutput');
    const seen = new Set<string>();
    const result: AudioOutputDevice[] = [];
    outputs.forEach((device, index) => {
      // 未授权时 deviceId 为空字符串，不能据此丢弃设备
      if (device.deviceId && seen.has(device.deviceId)) return;
      if (device.deviceId) seen.add(device.deviceId);
      result.push({
        deviceId: device.deviceId,
        label: friendlyOutputLabel(device, index),
        isDefault: device.deviceId === 'default' || !device.deviceId,
      });
    });
    // 未授权时可能只拿到空 id 设备：合并为一条“系统默认”，保证可选可用
    if (result.length > 0 && !result.some((device) => device.deviceId)) {
      return [{ deviceId: 'default', label: '系统默认', isDefault: true }];
    }
    return result;
  }

  /** 枚举结果是否受权限限制（存在设备但拿不到真实 deviceId/label） */
  static async isEnumerationRestricted(): Promise<boolean> {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === 'audiooutput');
    if (outputs.length === 0) return false;
    return outputs.every((device) => !device.deviceId || device.deviceId === 'default');
  }

  /** 是否有任何设备缺少可读标签（需请求权限才能显示名称） */
  static async hasReadableDeviceLabels(): Promise<boolean> {
    if (!navigator.mediaDevices?.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === 'audiooutput');
    if (outputs.length === 0) return true;
    return outputs.some((device) => device.label.trim().length > 0);
  }

  /**
   * 解析保存的输出设备：对齐 LX 的 getMediaDevice —— 找不到则回退 'default'，
   * 并标记 missing 以便调用方持久化回退结果。
   */
  static async resolveOutputDevice(savedId: string): Promise<ResolvedOutputDevice> {
    const devices = await WebAudioPlayerEngine.enumerateOutputDevices();
    const wanted = savedId || 'default';
    const exact = devices.find((device) => device.deviceId === wanted);
    if (exact) {
      return { deviceId: exact.deviceId, label: exact.label, missing: false };
    }
    // 未授权时列表只有伪“默认”项，看不到真实设备，不能据此判定保存的设备已失效
    const restricted = await WebAudioPlayerEngine.isEnumerationRestricted();
    if (restricted && savedId) {
      return { deviceId: savedId, label: '', missing: false };
    }
    const fallback =
      devices.find((device) => device.deviceId === 'default') ?? devices[0];
    return {
      deviceId: fallback?.deviceId ?? 'default',
      label: fallback?.label ?? '系统默认',
      missing: Boolean(savedId),
    };
  }

  setGain(value: number): void {
    const clamped = Math.max(0, Math.min(2, value));
    if (this.gainNode) this.gainNode.gain.value = clamped;
    try {
      writePersistedGain(clamped);
    } catch {
      // ignore
    }
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }

  dispose(): void {
    try {
      this.disconnectPitchShifter();
      this.pitchShifterNode?.disconnect();
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
    this.pitchShifterNode = null;
    this.pitchFactorParam = null;
    this.pitchLoadStatus = 'none';
    this.pitchFactor = 1;
  }
}

function readSavedGain(): number {
  try {
    const v = readPersistedGain();
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

export { EQ_PRESETS };
