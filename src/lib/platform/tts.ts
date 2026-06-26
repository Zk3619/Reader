/**
 * 文本转语音（TTS）工具
 * 支持 Web Speech API
 * 对应 legado 项目的 TTS 功能
 * 
 * 自动检测运行环境：
 * - Tauri环境：使用 Web Speech API（Tauri 运行在浏览器环境中）
 * - Web环境：使用 Web Speech API
 */

/**
 * TTS 语音信息接口
 */
export interface TtsVoice {
  /** 语音标识符 */
  voiceURI: string;
  /** 语音名称 */
  name: string;
  /** 语言代码（如：zh-CN, en-US） */
  lang: string;
  /** 是否为本地语音 */
  localService: boolean;
  /** 是否为默认语音 */
  default?: boolean;
}

/**
 * TTS 配置接口
 */
export interface TtsConfig {
  /** 语速（0.1 - 10，默认 1） */
  rate?: number;
  /** 音调（0 - 2，默认 1） */
  pitch?: number;
  /** 音量（0 - 1，默认 1） */
  volume?: number;
  /** 语音标识符 */
  voiceURI?: string;
  /** 语言代码 */
  lang?: string;
  /** 字/句边界（Web Speech API onboundary） */
  onBoundary?: (charIndex: number, charLength: number) => void;
}

/**
 * TTS 状态监听器接口
 */
export interface TtsStateListener {
  /** 开始朗读时调用 */
  onStart?: () => void;
  /** 结束朗读时调用 */
  onDone?: () => void;
  /** 暂停朗读时调用 */
  onPause?: () => void;
  /** 恢复朗读时调用 */
  onResume?: () => void;
  /** 发生错误时调用 */
  onError?: (error: Error) => void;
}

/**
 * TTS 提供者接口
 */
interface TtsProvider {
  /** 是否正在朗读 */
  isSpeaking(): boolean;
  /** 是否已暂停 */
  isPaused(): boolean;
  /** 朗读文本 */
  speak(text: string, config?: TtsConfig): Promise<void>;
  /** 停止朗读 */
  stop(): void;
  /** 暂停朗读 */
  pause(): void;
  /** 恢复朗读 */
  resume(): void;
  /** 设置语速 */
  setRate(rate: number): void;
  /** 设置音调 */
  setPitch(pitch: number): void;
  /** 设置音量 */
  setVolume(volume: number): void;
  /** 设置语音 */
  setVoice(voiceURI: string): void;
  /** 设置语言 */
  setLang(lang: string): void;
  /** 获取所有可用语音 */
  getVoices(): Promise<TtsVoice[]>;
  /** 设置状态监听器 */
  setStateListener(listener: TtsStateListener): void;
  /** 移除状态监听器 */
  removeStateListener(): void;
}

/**
 * Web Speech API 实现（适用于 Web 和 Tauri）
 */
class WebTtsProvider implements TtsProvider {
  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private stateListener: TtsStateListener | null = null;
  private config: TtsConfig = {
    rate: 1,
    pitch: 1,
    volume: 1,
  };
  private isPausedFlag = false;
  private cancelling = false;

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('Web Speech API 不支持当前环境');
    }
    this.synth = window.speechSynthesis;
  }

  isSpeaking(): boolean {
    return this.synth.speaking && !this.isPausedFlag;
  }

  isPaused(): boolean {
    return this.isPausedFlag;
  }

  async speak(text: string, config?: TtsConfig): Promise<void> {
    // 停止当前朗读
    this.stop();

    // 合并配置
    const finalConfig = { ...this.config, ...config };

    // 创建新的语音合成对象
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = finalConfig.rate ?? 1;
    utterance.pitch = finalConfig.pitch ?? 1;
    utterance.volume = finalConfig.volume ?? 1;

    // 设置语音
    if (finalConfig.voiceURI) {
      const voices = await this.getVoices();
      const voice = voices.find(v => v.voiceURI === finalConfig.voiceURI);
      if (voice) {
        utterance.voice = this.synth.getVoices().find(v => v.voiceURI === voice.voiceURI) || null;
      }
    }

    // 设置语言
    if (finalConfig.lang) {
      utterance.lang = finalConfig.lang;
    }

    // 设置事件监听
    utterance.onstart = () => {
      this.isPausedFlag = false;
      this.currentUtterance = utterance;
      this.stateListener?.onStart?.();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      this.isPausedFlag = false;
      this.stateListener?.onDone?.();
    };

    utterance.onerror = (event) => {
      const speechEvent = event as SpeechSynthesisErrorEvent;
      const benign =
        this.cancelling ||
        speechEvent.error === 'interrupted' ||
        speechEvent.error === 'canceled';
      this.cancelling = false;
      this.currentUtterance = null;
      this.isPausedFlag = false;
      if (benign) return;
      const error = new Error(`TTS 错误: ${speechEvent.error}`);
      this.stateListener?.onError?.(error);
      console.error('TTS 错误:', event);
    };

    utterance.onpause = () => {
      this.isPausedFlag = true;
      this.stateListener?.onPause?.();
    };

    utterance.onresume = () => {
      this.isPausedFlag = false;
      this.stateListener?.onResume?.();
    };

    utterance.onboundary = (event) => {
      finalConfig.onBoundary?.(event.charIndex, event.charLength);
    };

    // 开始朗读
    this.synth.speak(utterance);
  }

  stop(): void {
    this.cancelling = true;
    this.synth.cancel();
    this.currentUtterance = null;
    this.isPausedFlag = false;
  }

  pause(): void {
    if (this.synth.speaking && !this.isPausedFlag) {
      this.synth.pause();
      this.isPausedFlag = true;
    }
  }

  resume(): void {
    if (this.isPausedFlag) {
      this.synth.resume();
      this.isPausedFlag = false;
    }
  }

  setRate(rate: number): void {
    this.config.rate = Math.max(0.1, Math.min(10, rate));
    if (this.currentUtterance) {
      this.currentUtterance.rate = this.config.rate;
    }
  }

  setPitch(pitch: number): void {
    this.config.pitch = Math.max(0, Math.min(2, pitch));
    if (this.currentUtterance) {
      this.currentUtterance.pitch = this.config.pitch;
    }
  }

  setVolume(volume: number): void {
    this.config.volume = Math.max(0, Math.min(1, volume));
    if (this.currentUtterance) {
      this.currentUtterance.volume = this.config.volume;
    }
  }

  setVoice(voiceURI: string): void {
    this.config.voiceURI = voiceURI;
  }

  setLang(lang: string): void {
    this.config.lang = lang;
  }

  async getVoices(): Promise<TtsVoice[]> {
    // Web Speech API 的 getVoices() 在某些浏览器中需要等待加载
    return new Promise((resolve) => {
      const voices = this.synth.getVoices();
      if (voices.length > 0) {
        resolve(this.mapVoices(voices));
      } else {
        // 如果语音列表为空，等待加载完成
        this.synth.onvoiceschanged = () => {
          resolve(this.mapVoices(this.synth.getVoices()));
        };
        // 超时保护
        setTimeout(() => {
          resolve(this.mapVoices(this.synth.getVoices()));
        }, 1000);
      }
    });
  }

  private mapVoices(voices: SpeechSynthesisVoice[]): TtsVoice[] {
    return voices.map(voice => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
      default: voice.default,
    }));
  }

  setStateListener(listener: TtsStateListener): void {
    this.stateListener = listener;
  }

  removeStateListener(): void {
    this.stateListener = null;
  }
}

/**
 * 检测是否支持 TTS
 */
function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 创建 TTS 实例
 */
function createTtsProvider(): TtsProvider {
  if (!isTtsSupported()) {
    throw new Error('当前环境不支持 TTS 功能');
  }
  return new WebTtsProvider();
}

/**
 * 默认 TTS 实例
 */
let defaultTtsInstance: TtsProvider | null = null;

/**
 * 获取 TTS 实例（单例模式）
 */
function getTtsInstance(): TtsProvider {
  if (!defaultTtsInstance) {
    defaultTtsInstance = createTtsProvider();
  }
  return defaultTtsInstance;
}

/**
 * TTS API
 */
export const tts = {
  /**
   * 检查是否支持 TTS
   */
  isSupported(): boolean {
    return isTtsSupported();
  },

  /**
   * 是否正在朗读
   */
  isSpeaking(): boolean {
    if (!isTtsSupported()) return false;
    return getTtsInstance().isSpeaking();
  },

  /**
   * 是否已暂停
   */
  isPaused(): boolean {
    if (!isTtsSupported()) return false;
    return getTtsInstance().isPaused();
  },

  /**
   * 朗读文本
   */
  async speak(text: string, config?: TtsConfig): Promise<void> {
    if (!isTtsSupported()) {
      throw new Error('当前环境不支持 TTS 功能');
    }
    return getTtsInstance().speak(text, config);
  },

  /**
   * 停止朗读
   */
  stop(): void {
    if (!isTtsSupported()) return;
    getTtsInstance().stop();
  },

  /**
   * 暂停朗读
   */
  pause(): void {
    if (!isTtsSupported()) return;
    getTtsInstance().pause();
  },

  /**
   * 恢复朗读
   */
  resume(): void {
    if (!isTtsSupported()) return;
    getTtsInstance().resume();
  },

  /**
   * 设置语速（0.1 - 10）
   */
  setRate(rate: number): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setRate(rate);
  },

  /**
   * 设置音调（0 - 2）
   */
  setPitch(pitch: number): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setPitch(pitch);
  },

  /**
   * 设置音量（0 - 1）
   */
  setVolume(volume: number): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setVolume(volume);
  },

  /**
   * 设置语音
   */
  setVoice(voiceURI: string): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setVoice(voiceURI);
  },

  /**
   * 设置语言
   */
  setLang(lang: string): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setLang(lang);
  },

  /**
   * 获取所有可用语音
   */
  async getVoices(): Promise<TtsVoice[]> {
    if (!isTtsSupported()) {
      return [];
    }
    return getTtsInstance().getVoices();
  },

  /**
   * 设置状态监听器
   */
  setStateListener(listener: TtsStateListener): void {
    if (!isTtsSupported()) return;
    getTtsInstance().setStateListener(listener);
  },

  /**
   * 移除状态监听器
   */
  removeStateListener(): void {
    if (!isTtsSupported()) return;
    getTtsInstance().removeStateListener();
  },
};
