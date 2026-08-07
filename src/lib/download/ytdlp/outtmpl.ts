/**
 * Output template → filename (yt-dlp DEFAULT_OUTTMPL subset).
 */

import type { VideoInfo, YoutubeDLOptions } from './types';
import { sanitize_filename, sanitize_path_segment } from './utils/sanitize-filename';

export const DEFAULT_OUTTMPL = '%(title)s [%(id)s].%(ext)s';

const FIELD_RE = /%\((\w+)\)(?:\.(\d+))?([sd])/g;

function fieldValue(info: VideoInfo, key: string): string {
  const raw = (info as Record<string, unknown>)[key];
  if (raw == null || raw === '') {
    if (key === 'ext') return 'mp4';
    if (key === 'title') return String(info.id || 'video');
    return '';
  }
  return String(raw);
}

/**
 * Expand `%(field)s` / `%(field).Ns` placeholders.
 * Unknown empty fields become empty string (NA placeholder `_` when restricted).
 */
export function expandOuttmpl(
  tmpl: string,
  info: VideoInfo,
  opts?: { restricted?: boolean; naPlaceholder?: string },
): string {
  const restricted = !!opts?.restricted;
  const na = opts?.naPlaceholder ?? '';
  return tmpl.replace(FIELD_RE, (_m, key: string, precision: string | undefined, type: string) => {
    let v = fieldValue(info, key);
    if (!v) v = na;
    if (type === 'd') {
      const n = Number(v) || 0;
      const width = precision ? Number(precision) : 0;
      return width > 0 ? String(n).padStart(width, '0') : String(n);
    }
    if (precision) {
      const max = Number(precision);
      if (max > 0 && v.length > max) v = v.slice(0, max);
    }
    const isId = key === 'id' || key.endsWith('_id');
    return sanitize_filename(v, restricted, isId);
  });
}

function resolveTemplate(options: YoutubeDLOptions | undefined): string {
  const ot = options?.outtmpl;
  if (!ot) return DEFAULT_OUTTMPL;
  if (typeof ot === 'string') return ot || DEFAULT_OUTTMPL;
  return String(ot.default || ot[''] || DEFAULT_OUTTMPL);
}

/**
 * Build output filename from outtmpl + optional paths.home / paths.temp.
 * Does not create directories.
 */
export function prepareFilename(
  info: VideoInfo,
  options?: YoutubeDLOptions,
  dirType: '' | 'home' | 'temp' = '',
): string {
  const tmpl = resolveTemplate(options);
  const restricted =
    !!(options as { restrictfilenames?: boolean } | undefined)?.restrictfilenames ||
    !!options?.windowsfilenames;
  const na =
    options?.outtmpl_na_placeholder != null
      ? String(options.outtmpl_na_placeholder)
      : restricted
        ? 'NA'
        : '';
  let name = expandOuttmpl(tmpl, info, { restricted, naPlaceholder: na });

  const trim = Number(options?.trim_file_name) || 0;
  if (trim > 0 && name.length > trim) {
    const extMatch = name.match(/(\.[^.\\/]+)$/);
    const ext = extMatch?.[1] || '';
    const stem = name.slice(0, name.length - ext.length);
    name = stem.slice(0, Math.max(1, trim - ext.length)) + ext;
  }

  if (options?.windowsfilenames) {
    name = name.replace(/[<>:"|?*]/g, '_');
  }

  // Flatten accidental path separators from title into one segment basename
  const parts = name.split(/[/\\]+/).filter(Boolean);
  if (parts.length > 1) {
    name = parts.map(sanitize_path_segment).join('/');
  }

  const paths = options?.paths;
  const baseDir =
    (dirType === 'temp' && paths?.temp) ||
    (dirType === 'home' && paths?.home) ||
    paths?.home ||
    '';
  if (baseDir && name !== '-' && !/^[a-zA-Z]:[\\/]/.test(name) && !name.startsWith('/')) {
    const sep = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/';
    const joined = `${baseDir.replace(/[/\\]+$/, '')}${sep}${name}`;
    return joined;
  }
  return name;
}
