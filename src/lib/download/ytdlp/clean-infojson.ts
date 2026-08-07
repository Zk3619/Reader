/**
 * clean_infojson — strip private / underscored runtime fields (yt-dlp subset).
 */

import type { Format, VideoInfo } from './types';

const KEEP_UNDERSCORE = new Set([
  '_type',
  '_filename',
  '_has_drm',
  '_format_sort_fields',
]);

export function cleanInfoJson(info: VideoInfo): VideoInfo {
  const out: VideoInfo = { ...info };
  for (const key of Object.keys(out)) {
    if (!key.startsWith('_')) continue;
    if (KEEP_UNDERSCORE.has(key)) continue;
    delete (out as Record<string, unknown>)[key];
  }
  if (out.formats) {
    out.formats = out.formats.map((f: Format) => {
      const nf = { ...f };
      for (const k of Object.keys(nf)) {
        if (k.startsWith('__')) delete (nf as Record<string, unknown>)[k];
      }
      return nf;
    });
  }
  if (out.entries) {
    out.entries = out.entries.map((e: VideoInfo | null | undefined) =>
      e ? cleanInfoJson(e) : e,
    );
  }
  return out;
}
