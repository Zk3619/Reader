/** SkebIE — ported from yt-dlp skeb.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, url_or_none } from '../../utils';

export class SkebIE extends InfoExtractor {
  static IE_NAME = 'skeb';
  static _VALID_URL = /https?:\/\/skeb\.jp\/@(?<uploader_id>[^/?#]+)\/works\/(?<id>\d+)/;

  protected async _callApi(uploaderId: string, workId: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(
      `https://skeb.jp/api/users/${uploaderId}/works/${workId}`,
      workId,
      undefined,
      { headers: { Accept: 'application/json', Authorization: 'Bearer null' } },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uploader_id!;
    const workId = m.groups!.id!;
    let works: Record<string, unknown>;
    try {
      works = await this._callApi(uploaderId, workId);
    } catch (e) {
      const err = e as { cause?: { status?: number; response?: { text?: () => Promise<string> } } };
      if (err.cause?.status !== 429) throw e;
      const webpage = await err.cause.response?.text?.().catch(() => '') || '';
      const value = this._search_regex(/document\.cookie\s*=\s*["']request_key=([^;"']+)/, webpage, 'request key')!;
      // cookie jar best-effort via downloader if available
      works = await this._callApi(uploaderId, workId);
      void value;
    }

    const info: Partial<VideoInfo> = {
      uploader_id: uploaderId,
      age_limit: works.nsfw ? 18 : undefined,
      description:
        clean_html(String((works.source_body as string | undefined) || (works.body as string | undefined) || '')) ||
        undefined,
      genres: works.genre ? [String(works.genre)] : undefined,
      tags: ((works.tag_list as string[]) || []).filter(Boolean),
      uploader: (works.creator as Record<string, unknown> | undefined)?.name as string | undefined,
    };

    const entries: VideoInfo[] = [];
    for (const [idx, preview] of ((works.previews as Array<Record<string, unknown>>) || []).entries()) {
      const pUrl = url_or_none(preview.url);
      if (!pUrl) continue;
      const ext = str_or_none((preview.information as Record<string, unknown> | undefined)?.extension);
      if (ext && !['mp3', 'mp4', 'wav'].includes(ext)) {
        this.report_warning(`Skipping unsupported extension "${ext}"`);
        continue;
      }
      const vttUrl = url_or_none(preview.vtt_url);
      entries.push({
        ...info,
        ext: ext || undefined,
        title: `${workId}-${idx + 1}`,
        subtitles: vttUrl ? { ja: [{ url: vttUrl, ext: 'vtt' }] } : undefined,
        vcodec: ext && ['mp3', 'wav'].includes(ext) ? 'none' : undefined,
        id: str_or_none(preview.id) || `${workId}-${idx + 1}`,
        thumbnail: url_or_none(preview.poster_url) ?? undefined,
        url: pUrl,
        duration: int_or_none((preview.information as Record<string, unknown> | undefined)?.duration) ?? undefined,
        fps: int_or_none((preview.information as Record<string, unknown> | undefined)?.frame_rate) ?? undefined,
        height: int_or_none((preview.information as Record<string, unknown> | undefined)?.height) ?? undefined,
        width: int_or_none((preview.information as Record<string, unknown> | undefined)?.width) ?? undefined,
      });
    }

    return this.playlist_result(entries, workId, works.title as string | undefined, info.description);
  }
}
