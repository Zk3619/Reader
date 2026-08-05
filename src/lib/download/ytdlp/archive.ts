/**
 * download_archive parity — preload Set + append line on record.
 */

import type { VideoInfo } from './types';

export function makeArchiveId(ieKey: string, videoId: string): string {
  return `${ieKey.toLowerCase()} ${videoId}`;
}

export function makeArchiveIdFromInfo(info: VideoInfo): string | null {
  const videoId = info.id ? String(info.id) : '';
  if (!videoId) return null;
  const extractor =
    (info.extractor_key as string | undefined) ||
    (info.ie_key as string | undefined) ||
    (info.extractor as string | undefined);
  if (!extractor) return null;
  return makeArchiveId(extractor, videoId);
}

export class DownloadArchive {
  private readonly ids = new Set<string>();
  private readonly filePath: string | null;
  private loaded = false;

  constructor(source?: string | Set<string> | null) {
    if (source instanceof Set) {
      for (const id of source) this.ids.add(id);
      this.filePath = null;
      this.loaded = true;
    } else if (typeof source === 'string' && source.trim()) {
      this.filePath = source.trim();
    } else {
      this.filePath = null;
      this.loaded = true;
    }
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded || !this.filePath) {
      this.loaded = true;
      return;
    }
    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(this.filePath))) {
        this.loaded = true;
        return;
      }
      const text = await readTextFile(this.filePath);
      for (const line of text.split(/\r?\n/)) {
        const id = line.trim();
        if (id) this.ids.add(id);
      }
    } catch {
      /* browser / missing fs — keep in-memory only */
    }
    this.loaded = true;
  }

  has(info: VideoInfo): boolean {
    const primary = makeArchiveIdFromInfo(info);
    if (primary && this.ids.has(primary)) return true;
    const oldIds = info._old_archive_ids;
    if (Array.isArray(oldIds)) {
      return oldIds.some((id) => this.ids.has(String(id)));
    }
    return false;
  }

  async record(info: VideoInfo): Promise<void> {
    const id = makeArchiveIdFromInfo(info);
    if (!id) return;
    if (this.ids.has(id)) return;
    this.ids.add(id);
    if (!this.filePath) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('append_text_file', { path: this.filePath, text: `${id}\n` });
    } catch {
      try {
        const { writeTextFile, readTextFile, exists } = await import('@tauri-apps/plugin-fs');
        const prev = (await exists(this.filePath)) ? await readTextFile(this.filePath) : '';
        await writeTextFile(this.filePath, `${prev}${id}\n`);
      } catch {
        /* ignore */
      }
    }
  }
}
