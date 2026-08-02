/**
 * CeskaTelevizeIE — ported from yt-dlp ceskatelevize.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { float_or_none, str_or_none, traverse_obj } from '../../utils';
import { searchNextjsData, urlencodePostdata } from './_helpers';

const USER_AGENTS = {
  Safari:
    'Mozilla/5.0 (X11; Linux x86_64; rv:10.0) AppleWebKit/533.20.25 (KHTML, like Gecko) Version/5.0.4 Safari/533.20.27',
};

const NOT_AVAILABLE_STRING =
  'This content is not available at your territory due to limited copyright.';

function msecToTimecode(msec: number): string {
  const components: number[] = [];
  let rest = msec;
  for (const divider of [1000, 60, 60, 100]) {
    components.push(rest % divider);
    rest = Math.floor(rest / divider);
  }
  return `${String(components[3]).padStart(2, '0')}:${String(components[2]).padStart(2, '0')}:${String(components[1]).padStart(2, '0')},${String(components[0]).padStart(3, '0')}`;
}

function fixSubtitles(subtitles: string): string {
  const lines: string[] = [];
  for (const line of subtitles.split(/\r?\n/)) {
    const m = /^\s*([0-9]+);\s*([0-9]+)\s+([0-9]+)\s*$/.exec(line);
    if (m) {
      lines.push(m[1]!);
      lines.push(`${msecToTimecode(Number(m[2]))} --> ${msecToTimecode(Number(m[3]))}`);
    } else {
      lines.push(line);
    }
  }
  return lines.join('\r\n');
}

export class CeskaTelevizeIE extends InfoExtractor {
  static IE_NAME = 'ceskatelevize';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?ceskatelevize\.cz\/(?:ivysilani|porady|zive)\/(?:[^/?#&]+\/)*(?<id>[^/#?]+)/;

  private async _getSubtitles(episodeId: string, subs: Array<{ url: string }>): Promise<Record<string, Subtitle[]>> {
    const originalSubtitles = await this._download_webpage(subs[0]!.url, episodeId, 'Downloading subtitles');
    return {
      cs: [{ ext: 'srt', data: fixSubtitles(originalSubtitles) }],
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const pageHandle = await this._request_webpage(url, playlistId);
    if (!pageHandle) throw new ExtractorError(`Unable to download webpage: ${url}`);
    let webpage = pageHandle.text;
    const parsedUrl = new URL(pageHandle.url);

    const siteName = this._og_search_property('site_name', webpage, undefined, false) || 'Česká televize';
    let playlistTitle = this._og_search_title(webpage) ?? undefined;
    if (siteName && playlistTitle) {
      playlistTitle = playlistTitle.split(new RegExp(`\\s*[—|]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))[0];
    }
    let playlistDescription = this._og_search_description(webpage) ?? undefined;
    if (playlistDescription) playlistDescription = playlistDescription.replace(/\xa0/g, ' ');

    let idec: string | undefined;
    let typeKey = 'IDEC';

    if (/(^\/porady|\/zive)\//.test(parsedUrl.pathname)) {
      const nextData = searchNextjsData(this, webpage, playlistId);
      if (parsedUrl.pathname.includes('/zive/')) {
        idec = str_or_none(
          traverse_obj(nextData, ['pageProps', 'data', 'liveBroadcast', 'current', 'idec']),
        ) ?? undefined;
      } else {
        idec =
          str_or_none(traverse_obj(nextData, ['pageProps', 'data', 'show', 'mediaMeta', 'idec'])) ??
          str_or_none(traverse_obj(nextData, ['pageProps', 'data', 'mediaMeta', 'idec'])) ??
          undefined;
        if (!idec) {
          idec =
            str_or_none(traverse_obj(nextData, ['pageProps', 'data', 'videobonusDetail', 'bonusId'])) ??
            undefined;
          if (idec) typeKey = 'bonus';
        }
      }
      if (!idec) throw new ExtractorError('Failed to find IDEC id');

      const iframeHash = await this._download_webpage(
        'https://www.ceskatelevize.cz/v-api/iframe-hash/',
        playlistId,
        'Getting IFRAME hash',
      );
      webpage = await this._download_webpage(
        'https://www.ceskatelevize.cz/ivysilani/embed/iFramePlayer.php',
        playlistId,
        'Downloading player',
        {
          query: { hash: iframeHash.trim(), origin: 'iVysilani', autoStart: 'true', [typeKey]: idec },
        },
      );
    }

    if (webpage.includes(`${NOT_AVAILABLE_STRING}</p>`)) {
      this.raise_geo_restricted(NOT_AVAILABLE_STRING);
    }
    if (
      webpage.includes('Neplatný parametr pro videopřehrávač') ||
      webpage.includes('IDEC nebyl nalezen')
    ) {
      throw new ExtractorError('no video with IDEC available', { expected: true });
    }

    let type_: string | null = null;
    let episodeId: string | null = null;

    const playlistJson = this._search_regex(
      /getPlaylistUrl\(\[({.+?})\]/,
      webpage,
      'playlist',
      '{}',
      false,
    );
    const playlist = this._parse_json<Record<string, unknown>>(playlistJson, playlistId, null, false);
    if (playlist && Object.keys(playlist).length) {
      type_ = str_or_none(playlist.type);
      episodeId = str_or_none(playlist.id);
    }

    if (!type_) {
      type_ = this._html_search_regex(
        /getPlaylistUrl\(\[\{"type":"(.+?)","id":".+?"\}\],/,
        webpage,
        'type',
      );
    }
    if (!episodeId) {
      episodeId = this._html_search_regex(
        /getPlaylistUrl\(\[\{"type":".+?","id":"(.+?)"\}\],/,
        webpage,
        'episode_id',
      );
    }

    const data: Record<string, string> = {
      'playlist[0][type]': type_!,
      'playlist[0][id]': episodeId!,
      requestUrl: parsedUrl.pathname,
      requestSource: 'iVysilani',
    };

    const entries: VideoInfo[] = [];

    for (const userAgent of [undefined, USER_AGENTS.Safari]) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-addr': '127.0.0.1',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: url,
      };
      if (userAgent) headers['User-Agent'] = userAgent;

      const playlistpage = await this._download_json<Record<string, unknown>>(
        'https://www.ceskatelevize.cz/ivysilani/ajax/get-client-playlist/',
        playlistId,
        undefined,
        { data: urlencodePostdata(data), headers, method: 'POST', fatal: false },
      );

      if (!playlistpage || !Object.keys(playlistpage).length) continue;

      const playlistUrlRaw = str_or_none(playlistpage.url);
      if (!playlistUrlRaw) continue;
      if (playlistUrlRaw === 'error_region') {
        throw new ExtractorError(NOT_AVAILABLE_STRING, { expected: true });
      }

      const playlistUrl = decodeURIComponent(playlistUrlRaw);
      const playlistData = await this._download_json<Record<string, unknown>>(
        playlistUrl,
        playlistId,
        undefined,
        { headers: { Referer: url }, fatal: false },
      );
      if (!playlistData || !Object.keys(playlistData).length) continue;

      const items = playlistData.playlist;
      if (!Array.isArray(items)) continue;

      const playlistLen = items.length;

      for (let num = 0; num < items.length; num++) {
        const item = items[num] as Record<string, unknown>;
        const isLive = item.type === 'LIVE';
        const formats: Format[] = [];

        const streamUrls = (item.streamUrls as Record<string, string>) || {};
        for (const [formatId, streamUrl] of Object.entries(streamUrls)) {
          let streamFormats: Format[];
          if (streamUrl.includes('playerType=flash')) {
            streamFormats = await this._extract_m3u8_formats(
              streamUrl,
              playlistId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              `hls-${formatId}`,
              undefined,
              false,
            );
          } else {
            streamFormats = await this._extract_mpd_formats(
              streamUrl,
              playlistId,
              `dash-${formatId}`,
              undefined,
              false,
            );
          }
          if (streamUrl.includes('drmOnly=true')) {
            for (const f of streamFormats) f.has_drm = true;
          }
          if (formatId === 'audioDescription') {
            for (const f of streamFormats) f.source_preference = -10;
          }
          formats.push(...streamFormats);
        }

        if (userAgent && entries.length === playlistLen) {
          entries[num]!.formats = [...(entries[num]!.formats || []), ...formats];
          continue;
        }

        const itemId = str_or_none(item.id) || str_or_none(item.assetId) || undefined;
        const title = String(item.title ?? itemId ?? playlistId);
        const duration = float_or_none(item.duration) ?? undefined;
        const thumbnail = str_or_none(item.previewImageUrl) ?? undefined;

        let subtitles: Record<string, Subtitle[]> | undefined;
        if (item.type === 'VOD') {
          const subs = item.subtitles as Array<{ url: string }> | undefined;
          if (subs?.length && episodeId) {
            subtitles = await this._getSubtitles(episodeId, subs);
          }
        }

        const finalTitle =
          playlistLen === 1 ? playlistTitle || title : `${playlistTitle || playlistId} (${title})`;

        entries.push({
          id: itemId || playlistId,
          title: finalTitle,
          description: playlistLen === 1 ? playlistDescription : undefined,
          thumbnail,
          duration,
          formats,
          subtitles,
          is_live: isLive,
        });
      }
    }

    if (entries.length === 1) return entries[0]!;
    return this.playlist_result(entries, playlistId, playlistTitle, playlistDescription);
  }
}
