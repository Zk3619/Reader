/** SharePointIE — ported from yt-dlp sharepoint.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, update_url_query, url_or_none } from '../../utils';

const BASE_URL_RE = String.raw`https?:\/\/[\w-]+\.sharepoint\.com\/`;

export class SharePointIE extends InfoExtractor {
  static IE_NAME = 'sharepoint';
  static _VALID_URL = [
    new RegExp(`${BASE_URL_RE}:v:/[a-z]/(?:[^/?#]+/)*(?<id>[^/?#]{46})/?(?:$|[?#])`),
    new RegExp(`${BASE_URL_RE}(?!:v:)(?:[^/?#]+/)*stream\\.aspx\\?(?:[^#]+&)?id=(?<id>[^&#]+)`),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = decodeURIComponent(this._match_id(url));
    const { webpage, finalUrl } = await this._download_webpage_with_url(url, displayId);
    if (finalUrl.includes('login.microsoftonline.com')) {
      this.raise_login_required(
        'Session cookies are required for this URL and can be passed with the --cookies option. The --cookies-from-browser option will not work',
        undefined,
        null,
      );
    }

    const videoData = this._search_json<Record<string, unknown>>(/g_fileInfo\s*=/, webpage, 'player config', displayId)!;
    const videoId = String(videoData.VroomItemId);

    const parsed = new URL(String(videoData['.transformUrl']));
    parsed.pathname = parsed.pathname.replace(/\/?$/, '/../videomanifest');
    const qs = new URLSearchParams(parsed.search);
    for (const [k, v] of Object.entries(Object.fromEntries(new URLSearchParams(parsed.search)))) qs.set(k, v);
    qs.set('cTag', String(videoData['.ctag']));
    qs.set('action', 'Access');
    qs.set('part', 'index');
    parsed.search = qs.toString();
    const baseMediaUrl = parsed.toString();

    const formats: Format[] = [];
    formats.push(
      ...(await this._extract_mpd_formats(
        update_url_query(baseMediaUrl, { format: 'dash' }),
        videoId,
        'dash',
        undefined,
        false,
      )),
    );
    for (const hlsType of ['hls', 'hls-vnext']) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          update_url_query(baseMediaUrl, { format: hlsType }),
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          -2,
          hlsType,
          undefined,
          false,
        )),
      );
    }

    const downloadUrl = url_or_none(videoData.downloadUrl);
    if (downloadUrl) {
      formats.push({
        url: downloadUrl,
        ext: determine_ext(String(videoData.extension || videoData.name || '')),
        quality: 1,
        format_id: 'source',
        filesize: int_or_none(videoData.size) ?? undefined,
        vcodec: videoData.isAudio === true ? 'none' : undefined,
      });
    }

    let duration: number | undefined;
    try {
      const meta = JSON.parse(String((videoData.MediaServiceFastMetadata as string) || '{}')) as {
        media?: { duration?: number };
      };
      if (meta.media?.duration != null) duration = meta.media.duration / 10_000_000;
    } catch {
      /* ignore */
    }

    return {
      id: videoId,
      formats,
      title: (videoData.title as string | undefined) || (videoData.displayName as string | undefined),
      display_id: displayId,
      uploader_id: videoData.authorId as string | undefined,
      duration,
      thumbnail: url_or_none(videoData.thumbnailUrl) ?? undefined,
    };
  }

  protected async _download_webpage_with_url(
    url: string,
    videoId: string,
  ): Promise<{ webpage: string; finalUrl: string }> {
    const resp = await this._request_webpage(url, videoId, undefined, { fatal: true });
    return { webpage: resp!.text, finalUrl: resp!.url || url };
  }
}
