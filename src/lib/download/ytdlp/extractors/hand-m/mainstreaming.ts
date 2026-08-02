/** MainStreamingIE — ported from yt-dlp mainstreaming.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, js_to_json, parse_duration, try_get } from '../../utils';
import { urljoin } from './_helpers';
import { extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class MainStreamingIE extends InfoExtractor {
  static IE_NAME = 'mainstreaming';
  static IE_DESC = 'MainStreaming Player';
  static _VALID_URL =
    /https?:\/\/(?:webtools-?)?(?<host>[A-Za-z0-9-]*\.msvdn\.net)\/(?:embed|amp_embed|content)\/(?<id>\w+)/;
  static _EMBED_REGEX = [
    /<iframe[^>]+?src=["']?(?<url>https?:\/\/(?:webtools-?)?[A-Za-z0-9-]*\.msvdn\.net\/(?:embed|amp_embed|content)\/\w+)["']?/,
  ];

  protected _playlistEntries(host: string, playlistContent: Array<Record<string, unknown>>): VideoInfo[] {
    return playlistContent
      .map((entry) => {
        const contentId = entry.contentID;
        if (!contentId) return null;
        return this.url_result(`https://${host}/embed/${contentId}`, 'MainStreaming', String(contentId), str_or_none(entry.title) ?? undefined);
      })
      .filter(Boolean) as VideoInfo[];
  }

  protected static _getWebtoolsHost(host: string): string {
    if (!host.startsWith('webtools')) {
      host = 'webtools' + (host.startsWith('.') ? '' : '-') + host;
    }
    return host;
  }

  protected _getWebtoolsBaseUrl(host: string): string {
    return `https://${MainStreamingIE._getWebtoolsHost(host)}`;
  }

  protected async _callApi(
    host: string,
    path: string,
    itemId: string,
    query?: Record<string, string>,
    note = 'Downloading API JSON',
    fatal = false,
  ): Promise<Record<string, unknown> | null> {
    return this._callWebtoolsApi(host, `/api/v2/${path}`, itemId, query, note, fatal);
  }

  protected async _callWebtoolsApi(
    host: string,
    path: string,
    itemId: string,
    query?: Record<string, string>,
    note = 'Downloading webtools API JSON',
    fatal = false,
  ): Promise<Record<string, unknown> | null> {
    return (
      (await this._download_json<Record<string, unknown>>(
        urljoin(this._getWebtoolsBaseUrl(host), path),
        itemId,
        note,
        { query, fatal },
      )) || null
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let host = m.groups!.host!;
    let videoId = m.groups!.id!;
    let contentInfo = try_get(
      await this._callApi(host, `content/${videoId}`, videoId, undefined, 'Downloading content info API JSON'),
      (x) => (x as Record<string, unknown>).playerContentInfo,
    ) as Record<string, unknown> | undefined;

    if (!contentInfo) {
      const webpage = await this._download_webpage(url, videoId);
      const playerConfigRaw =
        this._search_regex(/config\s*=\s*(\{[\s\S]+?\})\s*;/, webpage, 'mainstreaming player config', '{}', false) ||
        '{}';
      const playerConfig =
        this._parse_json<Record<string, unknown>>(js_to_json(playerConfigRaw), videoId, undefined, false) || {};
      contentInfo = playerConfig.contentInfo as Record<string, unknown>;
    }

    host = str_or_none(contentInfo.host) || host;
    videoId = str_or_none(contentInfo.contentID) || videoId;
    const title = str_or_none(contentInfo.title);
    const description =
      str_or_none(contentInfo.longDescription) || str_or_none(contentInfo.shortDescription) || undefined;
    let liveStatus: VideoInfo['live_status'] = 'not_live';
    if (contentInfo.drmEnabled) this.report_warning(`DRM protected: ${videoId}`);

    const altId = contentInfo.alternativeContentID;
    if (altId) this.report_warning(`Ignoring alternative content ID: ${altId}`);

    const contentType = int_or_none(contentInfo.contentType);
    let formatBaseUrl: string | null = null;
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    if (contentType === 20) {
      const dvrEnabled = !!(contentInfo.playerSettings as Record<string, unknown>)?.dvrEnabled;
      formatBaseUrl = `https://${host}/live/${contentInfo.liveSourceID}/${videoId}/%s${dvrEnabled ? '?DVR' : ''}`;
      liveStatus = 'is_live';
      const heartbeat = (await this._callApi(host, `heartbeat/${videoId}`, videoId, undefined, 'Checking stream status')) || {};
      if (heartbeat.heartBeatUp === false) {
        this.raise_no_formats(`MainStreaming said: ${heartbeat.responseMessage}`, true);
        liveStatus = 'was_live';
      }
    } else if (contentType === 31) {
      const playlist = (contentInfo.playlistContents as Array<Record<string, unknown>>) || [];
      return this.playlist_result(this._playlistEntries(host, playlist), videoId, title, description);
    } else if (contentType === 10) {
      formatBaseUrl = `https://${host}/vod/${videoId}/%s`;
      formats.push({
        url: formatBaseUrl.replace('%s', 'original.mp4'),
        format_id: 'original',
        format_note: 'original',
        quality: 1,
      });
    } else {
      this.raise_no_formats(`Unknown content type ${contentType}`);
    }

    if (formatBaseUrl) {
      const m3u8 = await extractM3u8FormatsAndSubtitles(this, formatBaseUrl.replace('%s', 'playlist.m3u8'), videoId, 'hls');
      const mpd = await extractMpdFormatsAndSubtitles(this, formatBaseUrl.replace('%s', 'manifest.mpd'), videoId, 'dash');
      mergeSubtitles(subtitles, m3u8.subtitles);
      mergeSubtitles(subtitles, mpd.subtitles);
      formats.push(...m3u8.formats, ...mpd.formats);
    }

    return {
      id: videoId,
      title: title ?? undefined,
      description,
      formats,
      live_status: liveStatus,
      duration: parse_duration(contentInfo.duration) ?? undefined,
      tags: Array.isArray(contentInfo.tags) ? (contentInfo.tags as string[]) : undefined,
      subtitles,
      thumbnail: urljoin(this._getWebtoolsBaseUrl(host), `image/${videoId}/poster`),
    };
  }
}

function str_or_none(v: unknown): string | null {
  return v == null ? null : String(v);
}
