/**
 * 供 Artplayer 命令式 DOM（controls / layers / setting）使用的 Lucide SVG。
 * 与 lucide-solid@1.16.0 路径数据对齐；非 Solid 组件，避免在非 JSX 上下文创建根。
 */

type LucideIconOptions = {
  size?: number;
  className?: string;
  /**
   * 是否填充。默认 false（描边）。
   * Artplayer 全局 `svg { fill }` 会干扰 Lucide，故用 data-lucide-fill 显式控制。
   */
  filled?: boolean;
};

const SVG_BASE =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Lucide 图标内部 path（不含外层 svg） */
const PATHS = {
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'refresh-cw':
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'panel-top':
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
  'flip-horizontal-2':
    '<path d="m3 7 5 5-5 5V7"/><path d="m21 7-5 5 5 5V7"/><path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>',
  'repeat-1':
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>',
  'circle-play':
    '<path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/><circle cx="12" cy="12" r="10"/>',
  gauge:
    '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  ellipsis:
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  star:
    '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  'list-video':
    '<path d="M21 5H3"/><path d="M10 12H3"/><path d="M10 19H3"/><path d="M15 12.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997a1 1 0 0 1-1.517-.86z"/>',
  ratio:
    '<rect width="12" height="20" x="6" y="2" rx="2"/><rect width="20" height="12" x="2" y="6" rx="2"/>',
  crop:
    '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  'skip-back':
    '<path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><path d="M3 20V4"/>',
  'skip-forward':
    '<path d="M21 4v16"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/>',
  'toggle-left':
    '<circle cx="9" cy="12" r="3"/><rect width="20" height="14" x="2" y="5" rx="7"/>',
  'toggle-right':
    '<circle cx="15" cy="12" r="3"/><rect width="20" height="14" x="2" y="5" rx="7"/>',
  'sliders-horizontal':
    '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  settings:
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  copy:
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
} as const;

/**
 * 填充模式下，零面积描边（如 skip 竖线）不可见，改用可填充几何。
 */
const FILLED_PATHS: Partial<Record<keyof typeof PATHS, string>> = {
  'skip-back':
    '<path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z"/><rect x="1.5" y="4" width="4" height="16" rx="2" ry="2"/>',
  'skip-forward':
    '<rect x="19" y="4" width="4" height="16" rx="2" ry="2"/><path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z"/>',
};

export type LucideIconName = keyof typeof PATHS;

export function lucideIconHtml(
  name: LucideIconName,
  options: LucideIconOptions = {},
): string {
  const size = options.size ?? 22;
  const filled = options.filled === true;
  const fillMode = filled ? 'solid' : 'stroke';
  const paint = filled
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="2"';
  const classes = ['reader-lucide-icon', options.className].filter(Boolean).join(' ');
  const paths = (filled && FILLED_PATHS[name]) || PATHS[name];
  return `<svg ${SVG_BASE} ${paint} width="${size}" height="${size}" class="${classes}" data-lucide-fill="${fillMode}">${paths}</svg>`;
}

/** Artplayer `option.icons`：设置弹层相关原生图标统一为 Lucide */
export function artplayerLucideIcons(): Record<string, string> {
  return {
    setting: lucideIconHtml('settings', { size: 22 }),
    arrowLeft: lucideIconHtml('chevron-left', { size: 22 }),
    arrowRight: lucideIconHtml('chevron-right', { size: 22 }),
    check: lucideIconHtml('check', { size: 18 }),
    switchOn: lucideIconHtml('toggle-right', { size: 22 }),
    switchOff: lucideIconHtml('toggle-left', { size: 22 }),
    flip: lucideIconHtml('flip-horizontal-2', { size: 22 }),
    playbackRate: lucideIconHtml('gauge', { size: 22 }),
    aspectRatio: lucideIconHtml('ratio', { size: 22 }),
    config: lucideIconHtml('sliders-horizontal', { size: 22 }),
  };
}
