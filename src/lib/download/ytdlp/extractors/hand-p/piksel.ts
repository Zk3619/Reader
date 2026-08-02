/** PikselIE — ported from yt-dlp piksel.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, join_nonempty, str_or_none, unescapeHTML } from '../../utils';
import { extractM3u8FormatsAndSubtitles, parseIso8601, urljoin } from './_helpers';

export class PikselIE extends InfoExtractor {
  static IE_NAME = 'piksel';
  static _VALID_URL =
    /https?:\/\/(?:player\.(?:olympusattelecom|vibebyvista)|(?:api|player)\.multicastmedia|(?:api-ovp|player)\.piksel|mz-edge\.stream\.co|movie-s\.nhk\.or|vidego\.baltimorecity)\.(?:com|tech|jp|gov)\/v\/(?:refid\/(?<refid>[^/]+)\/prefid\/)?(?<id>[\w-]+)/;

  protected async _callApi(
    appToken: string,
    resource: string,
    displayId: string,
    query: Record<string, string>,
    host = 'https://player.piksel.tech',
    fatal = true,
  ): Promise<Record<string, unknown>> {
    const url = urljoin(host, `/ws/ws_${resource}/api/${appToken}/mode/json/apiv/5`);
    const response = (await this._download_json<{ response?: Record<string, unknown> }>(url, displayId, undefined, {
      query,
      fatal,
    }))?.response;
    const failure = response ? (response.failure as Record<string, unknown>)?.reason : 'Empty response from API';
    if (failure) {
      if (fatal) throw new ExtractorError(String(failure), { expected: true });
      this.report_warning(String(failure));
    }
    return response || {};
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const refId = m.groups?.refid;
    const displayId = m.groups?.id!;
    const webpage = await this._download_webpage(url, displayId);
    const appToken =
      this._search_regex(/clientAPI\s*:\s*"([^"]+)"/, webpage, 'app token', null, false) ||
      this._search_regex(/data-de-api-key\s*=\s*"([^"]+)"/, webpage, 'app token')!;
    const query: Record<string, string> = refId ? { refid: refId, prefid: displayId } : { v: displayId };
    const program = ((await this._callApi(appToken, 'program', displayId, query, url)).WsProgramResponse as Record<string, unknown>)
      ?.program as Record<string, unknown>;
    const videoData = (program.asset as Record<string, unknown>) || {};
    const videoId = String(program.uuid ?? displayId);
    const assetType = str_or_none(videoData.assetType) || str_or_none(videoData.asset_type);

    const formats: Format[] = [];
    const processAssetFile = (assetFile: Record<string, unknown> | null | undefined) => {
      if (!assetFile) return;
      const httpUrl = str_or_none(assetFile.http_url);
      if (!httpUrl) return;
      const vbr = int_or_none(assetFile.videoBitrate, 1024) ?? undefined;
      const abr = int_or_none(assetFile.audioBitrate, 1024) ?? undefined;
      const tbr = assetType === 'video' ? (vbr || 0) + (abr || 0) : abr;
      formats.push({
        format_id: join_nonempty('http', tbr != null ? String(tbr) : null) || 'http',
        url: unescapeHTML(httpUrl),
        vbr,
        abr,
        width: int_or_none(assetFile.videoWidth) ?? undefined,
        height: int_or_none(assetFile.videoHeight) ?? undefined,
        filesize: int_or_none(assetFile.filesize) ?? undefined,
        tbr: tbr ?? undefined,
      });
    };

    for (const assetFile of (videoData.assetFiles as Array<Record<string, unknown>>) || []) processAssetFile(assetFile);
    processAssetFile(videoData.referenceFile as Record<string, unknown>);

    const m3u8Url =
      str_or_none(videoData.m3u8iPadURL) ||
      str_or_none(videoData.ipadM3u8Url) ||
      str_or_none(videoData.m3u8AndroidURL) ||
      str_or_none(videoData.m3u8iPhoneURL) ||
      str_or_none(videoData.iphoneM3u8Url);
    if (m3u8Url) {
      const res = await extractM3u8FormatsAndSubtitles(this, m3u8Url, videoId, 'hls');
      formats.push(...res.formats);
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const caption of (videoData.captions as Array<Record<string, unknown>>) || []) {
      const captionUrl = str_or_none(caption.url);
      if (!captionUrl) continue;
      const lang = str_or_none(caption.locale) || 'en';
      subtitles[lang] = subtitles[lang] || [];
      subtitles[lang].push({ url: captionUrl, ext: 'vtt' });
    }

    return {
      id: videoId,
      title: String(videoData.title ?? displayId),
      description: str_or_none(videoData.description) ?? undefined,
      thumbnail: str_or_none(videoData.thumbnailUrl) ?? undefined,
      timestamp: parseIso8601(videoData.dateadd) ?? undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}
