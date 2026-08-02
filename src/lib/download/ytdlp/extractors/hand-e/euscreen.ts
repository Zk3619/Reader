/**
 * EUScreenIE — ported from yt-dlp euscreen.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, parse_duration } from '../../utils';

const EUSCREEN_PAYLOAD =
  '<fsxml><screen><properties><screenId>-1</screenId></properties><capabilities id="1"><properties><platform>Win32</platform><appcodename>Mozilla</appcodename><appname>Netscape</appname><appversion>5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36</appversion><useragent>Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36</useragent><cookiesenabled>true</cookiesenabled><screenwidth>784</screenwidth><screenheight>758</screenheight><orientation>undefined</orientation><smt_browserid>Sat, 07 Oct 2021 08:56:50 GMT</smt_browserid><smt_sessionid>1633769810758</smt_sessionid></properties></capabilities></screen></fsxml>';

export class EUScreenIE extends InfoExtractor {
  static IE_NAME = 'euscreen';
  static _VALID_URL = /https?:\/\/(?:www\.)?euscreen\.eu\/item\.html\?id=(?<id>[^&?$/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const louUrl =
      'https://euscreen.eu/lou/LouServlet/domain/euscreenxl/html5application/euscreenxlitem';

    const argsRes = await this._request_webpage(
      {
        url: `${louUrl}?actionlist=itempage&id=${encodeURIComponent(videoId)}`,
        data: EUSCREEN_PAYLOAD,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      videoId,
    );
    const argsForJsRequest = argsRes?.text ?? '';

    const infoRes = await this._request_webpage(
      {
        url: louUrl,
        data: argsForJsRequest.replace(/screenid/g, 'screenId'),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      videoId,
    );
    const infoJs = infoRes?.text ?? '';

    const videoJson = this._parse_json<{ sources?: Array<{ src: string }>; screenshot?: string }>(
      this._search_regex(/setVideo\(({.+})\)\(\$end\$\)put/, infoJs, 'Video JSON')!,
      videoId,
      js_to_json,
    )!;

    const metaJson = this._parse_json<Record<string, unknown>>(
      this._search_regex(/setData\(({.+})\)\(\$end\$\)/, infoJs, 'Metadata JSON')!,
      videoId,
      js_to_json,
    )!;

    const formats: Format[] = (videoJson.sources || []).map((source, i) => ({
      format_id: String(i),
      url: source.src,
    }));

    const summaryOriginal = String(metaJson.summaryOriginal ?? '');
    const summaryEnglish = String(metaJson.summaryEnglish ?? '');

    return {
      id: videoId,
      title: (metaJson.originalTitle as string) || undefined,
      alt_title: (metaJson.title as string) || undefined,
      duration: parse_duration(metaJson.duration) ?? undefined,
      description: `${summaryOriginal}\n${summaryEnglish}`.trim() || undefined,
      series: (metaJson.series as string) || (metaJson.seriesEnglish as string) || undefined,
      episode: (metaJson.episodeNumber as string) || undefined,
      uploader: (metaJson.provider as string) || undefined,
      thumbnail: (metaJson.screenshot as string) || videoJson.screenshot || undefined,
      formats,
    };
  }
}
