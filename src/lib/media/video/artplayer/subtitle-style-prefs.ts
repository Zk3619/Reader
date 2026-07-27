/**
 * Artplayer 字幕外观偏好（底栏「字幕设置」）
 */

export type SubtitleSizePreset = 'small' | 'medium' | 'large' | 'xlarge';
export type SubtitleColorPreset = 'white' | 'yellow' | 'cyan' | 'green';
export type SubtitleStrokePreset = 'none' | 'thin' | 'thick' | 'shadow';
export type SubtitlePositionPreset = 'bottom' | 'top';

export type SubtitleStylePrefs = {
  size: SubtitleSizePreset;
  color: SubtitleColorPreset;
  stroke: SubtitleStrokePreset;
  position: SubtitlePositionPreset;
  /** 0–1 背景不透明度 */
  bgOpacity: number;
  scaleWithPlayer: boolean;
  fade: boolean;
  bilingual: boolean;
};

const STORAGE_KEY = 'reader.artplayer.subtitleStyle.v1';

const DEFAULTS: SubtitleStylePrefs = {
  size: 'medium',
  color: 'white',
  stroke: 'shadow',
  position: 'bottom',
  bgOpacity: 0.35,
  scaleWithPlayer: true,
  fade: false,
  bilingual: false,
};

export const SUBTITLE_SIZE_OPTIONS: Array<{
  value: SubtitleSizePreset;
  label: string;
  fontSize: string;
}> = [
  { value: 'small', label: '较小', fontSize: '16px' },
  { value: 'medium', label: '适中', fontSize: '20px' },
  { value: 'large', label: '较大', fontSize: '28px' },
  { value: 'xlarge', label: '巨大', fontSize: '36px' },
];

export const SUBTITLE_COLOR_OPTIONS: Array<{
  value: SubtitleColorPreset;
  label: string;
  color: string;
}> = [
  { value: 'white', label: '白色', color: '#ffffff' },
  { value: 'yellow', label: '黄色', color: '#ffe566' },
  { value: 'cyan', label: '青色', color: '#7fdbff' },
  { value: 'green', label: '绿色', color: '#9fe870' },
];

export const SUBTITLE_STROKE_OPTIONS: Array<{
  value: SubtitleStrokePreset;
  label: string;
}> = [
  { value: 'none', label: '无描边' },
  { value: 'thin', label: '细描边' },
  { value: 'thick', label: '粗描边' },
  { value: 'shadow', label: '阴影' },
];

export const SUBTITLE_POSITION_OPTIONS: Array<{
  value: SubtitlePositionPreset;
  label: string;
}> = [
  { value: 'bottom', label: '底部居中' },
  { value: 'top', label: '顶部居中' },
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULTS.bgOpacity;
  return Math.min(1, Math.max(0, n));
}

function normalize(p: Partial<SubtitleStylePrefs> = {}): SubtitleStylePrefs {
  return {
    size: SUBTITLE_SIZE_OPTIONS.some((o) => o.value === p.size)
      ? (p.size as SubtitleSizePreset)
      : DEFAULTS.size,
    color: SUBTITLE_COLOR_OPTIONS.some((o) => o.value === p.color)
      ? (p.color as SubtitleColorPreset)
      : DEFAULTS.color,
    stroke: SUBTITLE_STROKE_OPTIONS.some((o) => o.value === p.stroke)
      ? (p.stroke as SubtitleStrokePreset)
      : DEFAULTS.stroke,
    position: SUBTITLE_POSITION_OPTIONS.some((o) => o.value === p.position)
      ? (p.position as SubtitlePositionPreset)
      : DEFAULTS.position,
    bgOpacity: clamp01(Number(p.bgOpacity ?? DEFAULTS.bgOpacity)),
    scaleWithPlayer: p.scaleWithPlayer !== false,
    fade: p.fade === true,
    bilingual: p.bilingual === true,
  };
}

let cache: SubtitleStylePrefs | null = null;

export function getSubtitleStylePrefs(): SubtitleStylePrefs {
  if (cache) return { ...cache };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = normalize(JSON.parse(raw) as Partial<SubtitleStylePrefs>);
      return { ...cache };
    }
  } catch {
    /* */
  }
  cache = { ...DEFAULTS };
  return { ...cache };
}

export function setSubtitleStylePrefs(
  patch: Partial<SubtitleStylePrefs>,
): SubtitleStylePrefs {
  const next = normalize({ ...getSubtitleStylePrefs(), ...patch });
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return { ...next };
}

export function resetSubtitleStylePrefs(): SubtitleStylePrefs {
  cache = { ...DEFAULTS };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* */
  }
  return { ...cache };
}

/** 转为 Artplayer subtitle.style / CSS 变量 */
export function subtitleStyleToCss(
  prefs: SubtitleStylePrefs = getSubtitleStylePrefs(),
): Partial<CSSStyleDeclaration> & Record<string, string> {
  const size =
    SUBTITLE_SIZE_OPTIONS.find((o) => o.value === prefs.size)?.fontSize ?? '20px';
  const color =
    SUBTITLE_COLOR_OPTIONS.find((o) => o.value === prefs.color)?.color ?? '#fff';
  let textShadow = 'none';
  if (prefs.stroke === 'thin') {
    textShadow =
      '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
  } else if (prefs.stroke === 'thick') {
    textShadow =
      '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 3px #000';
  } else if (prefs.stroke === 'shadow') {
    textShadow = '0 1px 2px rgba(0,0,0,.85), 0 0 6px rgba(0,0,0,.55)';
  }
  const bg =
    prefs.bgOpacity <= 0.01
      ? 'transparent'
      : `rgba(0,0,0,${prefs.bgOpacity.toFixed(2)})`;
  return {
    color,
    fontSize: size,
    textShadow,
    backgroundColor: bg,
    bottom: prefs.position === 'top' ? 'auto' : '5%',
    top: prefs.position === 'top' ? '8%' : 'auto',
  };
}
