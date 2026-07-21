/**
 * 卷积环境音预设：对齐 LX Desktop `plugins/player` convolutions 增益与文件名。
 * WAV 可选：将 LX `assets/medias/filters/*.wav` 放到 `public/music-ir/`；缺失时回退程序化 IR。
 */

export type SoundConvolutionPreset =
  | 'off'
  | 'room'
  | 'hall'
  | 'telephone'
  | 'church'
  | 'cinema'
  | 'dining'
  | 'bathroom'
  | 'spring'
  | 'matrix1'
  | 'matrix2'
  | 'stereo'
  | 'cardiod'
  | 'magnetic';

/** LX 文件名式预设的中文标签（对齐 zh-cn 文案） */
export const SOUND_CONVOLUTION_PRESET_LABELS: Record<
  Exclude<SoundConvolutionPreset, 'off'>,
  string
> = {
  room: '室内',
  hall: '大厅',
  telephone: '电话',
  church: '教堂',
  cinema: '电影院',
  dining: '餐厅',
  bathroom: '卫生间',
  spring: '反馈弹簧',
  matrix1: '矩阵混响（1）',
  matrix2: '矩阵混响（2）',
  stereo: '立体声',
  cardiod: '心形扩散',
  magnetic: '磁性立体声',
};

export const SOUND_CONVOLUTION_PRESETS: readonly SoundConvolutionPreset[] = [
  'off',
  'room',
  'hall',
  'telephone',
  'church',
  'cinema',
  'dining',
  'bathroom',
  'spring',
  'matrix1',
  'matrix2',
  'stereo',
  'cardiod',
  'magnetic',
];

export type SoundConvolutionGainPair = {
  mainGain: number;
  sendGain: number;
};

/** LX source 文件名（相对 public/music-ir/） */
export const SOUND_CONVOLUTION_WAV_FILES: Record<
  Exclude<SoundConvolutionPreset, 'off'>,
  string
> = {
  telephone: 'filter-telephone.wav',
  church: 's2_r4_bd.wav',
  hall: 'bright-hall.wav',
  cinema: 'cinema-diningroom.wav',
  dining: 'dining-living-true-stereo.wav',
  bathroom: 'living-bedroom-leveled.wav',
  room: 'spreader50-65ms.wav',
  stereo: 's3_r1_bd.wav',
  matrix1: 'matrix-reverb1.wav',
  matrix2: 'matrix-reverb2.wav',
  cardiod: 'cardiod-35-10-spread.wav',
  magnetic: 'tim-omni-35-10-magnetic.wav',
  spring: 'feedback-spring.wav',
};

/**
 * LX `convolutions[].mainGain / sendGain`（直接作为 AudioNode gain）。
 * 对应设置里 LX UI 存值 = 本值 × 10。
 */
export const SOUND_CONVOLUTION_DEFAULT_GAINS: Record<
  Exclude<SoundConvolutionPreset, 'off'>,
  SoundConvolutionGainPair
> = {
  telephone: { mainGain: 0.0, sendGain: 3.0 },
  church: { mainGain: 1.8, sendGain: 0.9 },
  hall: { mainGain: 0.8, sendGain: 2.4 },
  cinema: { mainGain: 0.6, sendGain: 2.3 },
  dining: { mainGain: 0.6, sendGain: 1.8 },
  bathroom: { mainGain: 0.6, sendGain: 2.1 },
  room: { mainGain: 1.0, sendGain: 2.5 },
  stereo: { mainGain: 1.8, sendGain: 0.8 },
  matrix1: { mainGain: 1.5, sendGain: 0.9 },
  matrix2: { mainGain: 1.3, sendGain: 1.0 },
  cardiod: { mainGain: 1.8, sendGain: 0.6 },
  magnetic: { mainGain: 1.0, sendGain: 0.2 },
  spring: { mainGain: 1.8, sendGain: 0.8 },
};

const wavCache = new Map<string, AudioBuffer>();

export function defaultGainsForConvolutionPreset(
  preset: SoundConvolutionPreset,
): SoundConvolutionGainPair {
  if (preset === 'off') return { mainGain: 0.75, sendGain: 0.35 };
  return SOUND_CONVOLUTION_DEFAULT_GAINS[preset];
}

/** 尝试加载 public/music-ir 下的 LX WAV；失败返回 null（调用方用程序化 IR） */
export async function loadConvolutionWavBuffer(
  ctx: AudioContext,
  preset: Exclude<SoundConvolutionPreset, 'off'>,
): Promise<AudioBuffer | null> {
  const file = SOUND_CONVOLUTION_WAV_FILES[preset];
  const cached = wavCache.get(file);
  if (cached) return cached;
  try {
    const res = await fetch(`/music-ir/${file}`);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(raw.slice(0));
    wavCache.set(file, buffer);
    return buffer;
  } catch {
    return null;
  }
}
