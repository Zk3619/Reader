/**
 * writelink / writeurllink / writewebloclink / writedesktoplink — yt-dlp subset.
 */

import type { VideoInfo, YoutubeDLOptions } from './types';

async function writeTextBeside(filename: string, suffix: string, body: string): Promise<void> {
  const base = filename.replace(/\.[^.\\/]+$/, '') || filename;
  const path = `${base}${suffix}`;
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(path, body);
  } catch {
    /* non-tauri / denied */
  }
}

/** Write URL sidecar files next to media when corresponding options are set. */
export async function writeLinkSidecars(
  info: VideoInfo,
  options: YoutubeDLOptions,
): Promise<void> {
  const filename = info._filename;
  if (!filename || filename === '-') return;
  const url = String(info.webpage_url || info.original_url || info.url || '');
  if (!url) return;

  if (options.writelink || options.writeurllink) {
    await writeTextBeside(filename, '.url', `[InternetShortcut]\nURL=${url}\n`);
  }
  if (options.writedesktoplink) {
    await writeTextBeside(
      filename,
      '.desktop',
      `[Desktop Entry]\nType=Link\nName=${info.title || info.id}\nURL=${url}\n`,
    );
  }
  if (options.writewebloclink) {
    await writeTextBeside(
      filename,
      '.webloc',
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ` +
        `"http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
        `<plist version="1.0"><dict><key>URL</key><string>${url.replace(/&/g, '&amp;')}</string></dict></plist>\n`,
    );
  }
}
