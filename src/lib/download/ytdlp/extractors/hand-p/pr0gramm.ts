/** Pr0grammIE — ported from yt-dlp pr0gramm.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  mimetype2ext,
  str_or_none,
  url_or_none,
} from '../../utils';
import { make_archive_id, urljoin } from './_helpers';

export class Pr0grammIE extends InfoExtractor {
  static IE_NAME = 'pr0gramm';
  static _VALID_URL = /https?:\/\/pr0gramm\.com\/(?:[^/?#]+\/)+(?<id>[\d]+)(?:[/?#:]|$)/;
  static BASE_URL = 'https://pr0gramm.com';

  protected get _isLoggedIn(): boolean {
    return Boolean(this._get_cookies(Pr0grammIE.BASE_URL).pp);
  }

  protected get _maximumFlags(): number {
    let flags = 0b10001;
    if (this._isLoggedIn) {
      flags |= 0b01000;
      const cookies = this._get_cookies(Pr0grammIE.BASE_URL);
      const me = cookies.me;
      if (me) {
        try {
          const parsed = JSON.parse(decodeURIComponent(me)) as { verified?: boolean };
          if (parsed.verified) flags |= 0b00110;
        } catch {
          /* ignore */
        }
      }
    }
    return flags;
  }

  protected _createSourceUrl(path: string): string {
    return urljoin('https://img.pr0gramm.com', path);
  }

  protected async _callApi(
    endpoint: string,
    videoId: string,
    query: Record<string, string | number>,
    note = 'Downloading API json',
  ): Promise<Record<string, unknown>> {
    const data = await this._download_json<Record<string, unknown>>(
      `https://pr0gramm.com/api/items/${endpoint}`,
      videoId,
      note,
      { query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) as Record<string, string> },
    );
    const error = str_or_none(data.error);
    if (['nsfwRequired', 'nsflRequired', 'nsfpRequired', 'verificationRequired'].includes(error || '')) {
      if (!this._isLoggedIn) this.raise_login_required();
      throw new ExtractorError(`Unverified account cannot access NSFW/NSFL (${error})`, { expected: true });
    }
    if (error) {
      throw new ExtractorError(`API returned error: ${str_or_none(data.msg) || error}`, { expected: true });
    }
    return data;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const listData = await this._callApi('get', videoId, { id: videoId, flags: this._maximumFlags });
    const videoInfo = ((listData.items as unknown[])?.[0] as Record<string, unknown>) || {};
    const source = str_or_none(videoInfo.image);
    if (!source || !source.endsWith('mp4')) {
      this.raise_no_formats('Could not extract a video');
    }

    const metadata = await this._callApi('info', videoId, { itemId: videoId }, 'Downloading tags');
    const tagEntries = (metadata.tags as Array<{ tag?: string; confidence?: number }>) || [];
    const tags = [...tagEntries]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .map((t) => t.tag)
      .filter(Boolean) as string[];

    let formats: Format[];
    if (Array.isArray(videoInfo.variants) && videoInfo.variants.length) {
      formats = (videoInfo.variants as Array<Record<string, unknown>>).map((v) => ({
        format_id: str_or_none(v.name) || 'variant',
        url: this._createSourceUrl(String(v.path ?? '')),
        ext: mimetype2ext(str_or_none(v.mimeType)) || undefined,
        vcodec: str_or_none(v.codec) ?? undefined,
        width: int_or_none(v.width) ?? undefined,
        height: int_or_none(v.height) ?? undefined,
        tbr: float_or_none(v.bitRate) ?? undefined,
        filesize: int_or_none(v.fileSize) ?? undefined,
      }));
    } else {
      formats = [
        {
          ext: 'mp4',
          format_id: 'source',
          url: this._createSourceUrl(source),
          width: int_or_none(videoInfo.width) ?? undefined,
          height: int_or_none(videoInfo.height) ?? undefined,
        },
      ];
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (videoInfo.subtitles as Array<Record<string, unknown>>) || []) {
      const lang = str_or_none(sub.language);
      if (!lang) continue;
      (subtitles[lang] ||= []).push({
        url: this._createSourceUrl(String(sub.path ?? '')),
        ext: 'vtt',
      });
    }

    const flags = int_or_none(videoInfo.flags) ?? 0;
    const created = int_or_none(videoInfo.created);

    return {
      id: videoId,
      title: `pr0gramm-${videoId} by ${videoInfo.user ?? 'unknown'}`,
      tags,
      formats,
      subtitles,
      age_limit: flags & 0b110 ? 18 : 0,
      _old_archive_ids: [make_archive_id('Pr0grammStatic', videoId)],
      uploader: str_or_none(videoInfo.user) ?? undefined,
      uploader_id: str_or_none(videoInfo.userId) ?? undefined,
      like_count: int_or_none(videoInfo.up) ?? undefined,
      dislike_count: int_or_none(videoInfo.down) ?? undefined,
      timestamp: created ?? undefined,
      upload_date: created
        ? new Date(created * 1000).toISOString().slice(0, 10).replace(/-/g, '')
        : undefined,
      thumbnail: url_or_none(videoInfo.thumb)
        ? urljoin('https://thumb.pr0gramm.com', String(videoInfo.thumb))
        : undefined,
    };
  }
}
