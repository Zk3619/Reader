/**
 * 影视壁纸 UI 偏好（对齐 fongmi Setting.wall / wall_type + 音乐「跟随主程序」）
 *
 * mode:
 * - follow：跟随主程序 / module.tv 主题，不绘制自定义壁纸层
 * - url：配置 URL（含从源库 wallpaper 选取）
 * - local：本地文件
 * - builtin：内置色板 1–4
 */

import { createStore } from 'solid-js/store';

export type TvWallType = 0 | 1 | 2;
export type TvWallSourceMode = 'follow' | 'url' | 'local' | 'builtin';

export interface TvWallUiState {
  mode: TvWallSourceMode;
  /** builtin 时 1–4；url/local 时为 0 */
  wall: number;
  wallType: TvWallType;
  /** 当前壁纸配置 URL（接口 wallpaper 或手动设置） */
  configUrl: string;
  /** 本地文件显示名 */
  localName: string;
  /** 可渲染的 blob:/http: 地址（自定义时） */
  displaySrc: string;
  loading: boolean;
  error: string;
  revision: number;
}

const STORAGE_KEY = 'tv_wall_ui_v1';

function migrateMode(
  parsed: Partial<TvWallUiState> & { wall?: number },
): TvWallSourceMode {
  if (
    parsed.mode === 'follow' ||
    parsed.mode === 'url' ||
    parsed.mode === 'local' ||
    parsed.mode === 'builtin'
  ) {
    return parsed.mode;
  }
  const wall = Number(parsed.wall);
  if (wall >= 1 && wall <= 4) return 'builtin';
  if (wall === 0 && typeof parsed.configUrl === 'string' && parsed.configUrl) {
    return parsed.configUrl.startsWith('file:') ? 'local' : 'url';
  }
  return 'follow';
}

function load(): Pick<
  TvWallUiState,
  'mode' | 'wall' | 'wallType' | 'configUrl' | 'localName'
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { mode: 'follow', wall: 1, wallType: 0, configUrl: '', localName: '' };
    }
    const parsed = JSON.parse(raw) as Partial<TvWallUiState>;
    const wall = Number(parsed.wall);
    const wallType = Number(parsed.wallType);
    const mode = migrateMode(parsed);
    return {
      mode,
      wall: wall >= 0 && wall <= 4 ? wall : 1,
      wallType: wallType === 1 || wallType === 2 ? wallType : 0,
      configUrl: typeof parsed.configUrl === 'string' ? parsed.configUrl : '',
      localName: typeof parsed.localName === 'string' ? parsed.localName : '',
    };
  } catch {
    return { mode: 'follow', wall: 1, wallType: 0, configUrl: '', localName: '' };
  }
}

function persist(state: TvWallUiState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        mode: state.mode,
        wall: state.wall,
        wallType: state.wallType,
        configUrl: state.configUrl,
        localName: state.localName,
      }),
    );
  } catch {
    /* */
  }
}

const initial = load();
const [tvWallUi, setTvWallUi] = createStore<TvWallUiState>({
  ...initial,
  displaySrc: '',
  loading: false,
  error: '',
  revision: 0,
});

export function getTvWallUi(): TvWallUiState {
  return tvWallUi;
}

export function bumpTvWallRevision(): void {
  setTvWallUi('revision', tvWallUi.revision + 1);
  persist(tvWallUi);
}

export function setTvWallMode(mode: TvWallSourceMode): void {
  setTvWallUi({ mode, error: '' });
  if (mode === 'builtin') {
    const w = tvWallUi.wall >= 1 && tvWallUi.wall <= 4 ? tvWallUi.wall : 1;
    setTvWallUi({ wall: w, wallType: 0 });
  } else if (mode === 'url' || mode === 'local') {
    setTvWallUi('wall', 0);
  }
  bumpTvWallRevision();
}

export function setTvWallIndex(wall: number): void {
  const next = Math.max(0, Math.min(4, Math.floor(wall)));
  setTvWallUi({
    wall: next,
    mode: next >= 1 ? 'builtin' : tvWallUi.mode === 'follow' ? 'url' : tvWallUi.mode,
    error: '',
  });
  if (next >= 1) setTvWallUi('wallType', 0);
  bumpTvWallRevision();
}

export function setTvWallType(wallType: TvWallType): void {
  setTvWallUi('wallType', wallType);
  persist(tvWallUi);
}

export function setTvWallConfigUrl(url: string): void {
  setTvWallUi('configUrl', url.trim());
  persist(tvWallUi);
}

export function setTvWallLocalName(name: string): void {
  setTvWallUi('localName', name);
  persist(tvWallUi);
}

export function setTvWallDisplaySrc(src: string): void {
  const prev = tvWallUi.displaySrc;
  if (prev && prev.startsWith('blob:') && prev !== src) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      /* */
    }
  }
  setTvWallUi('displaySrc', src);
  bumpTvWallRevision();
}

export function setTvWallLoading(loading: boolean): void {
  setTvWallUi('loading', loading);
}

export function setTvWallError(error: string): void {
  setTvWallUi('error', error);
}

/** 内置壁纸循环 1→2→3→4→1 */
export function cycleTvBuiltinWall(): void {
  setTvWallMode('builtin');
  const cur = tvWallUi.wall >= 1 && tvWallUi.wall <= 4 ? tvWallUi.wall : 1;
  const next = cur >= 4 ? 1 : cur + 1;
  setTvWallIndex(next);
}

/** 对齐 fongmi 内置壁纸主色 */
export const TV_BUILTIN_WALL_COLORS = [
  '', // index 0 unused
  '#40C090',
  '#4870E0',
  '#48B0C0',
  '#404040',
] as const;

export const TV_WALL_MODE_LABELS: Record<TvWallSourceMode, string> = {
  follow: '跟随主程序',
  url: '应用 URL',
  local: '本地文件',
  builtin: '内置色板',
};
