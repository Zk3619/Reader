// @ts-nocheck
/** UstreamIE / UstreamChannelIE â€?ported from yt-dlp ustream.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none } from '../../utils';
import { urljoin } from './_helpers';

export class UstreamIE extends InfoExtractor {
  static IE_NAME = 'ustream';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:ustream\.tv|video\.ibm\.com)\/(?<type>recorded|embed|embed\/recorded)\/(?<id>\d+)/;

  protected async _getStreamInfo(
    url: string,
    videoId: string,
    appIdVer: [number, number],
    extraNote = '',
  ): Promise<unknown> {
    const rnd = (x: number) => Math.floor(Math.random() * x);
    const numToHex = (n: number) => n.toString(16);

    const connInfo = await this._download_json<Array<Record<string, unknown>>>(
      `http://r${rnd(1e8)}-1-${videoId}-recorded-lp-live.ums.ustream.tv/1/ustream`,
      videoId,
      `Downloading connection info${extraNote}`,
      {
        query: {
          type: 'viewer',
          appId: String(appIdVer[0]),
          appVersion: String(appIdVer[1]),
          rsid: `${numToHex(rnd(1e8))}:${numToHex(rnd(1e8))}`,
          rpin: `_rpin.${rnd(1e15)}`,
          referrer: url,
          media: videoId,
          application: 'recorded',
        },
      },
    );
    const args0 = ((connInfo[0]?.args as unknown[]) || [])[0] as Record<string, unknown> | undefined;
    const host = String(args0?.host || '');
    const connectionId = String(args0?.connectionId || '');

    return this._download_json(
      `http://${host}/1/ustream?connectionId=${connectionId}`,
      videoId,
      `Downloading stream info${extraNote}`,
    );
  }

  protected async _getStreams(
    url: string,
    videoId: string,
    appIdVer: [number, number],
  ): Promise<Array<Record<string, unknown>>> {
    for (let trialCount = 0; trialCount < 3; trialCount++) {
      const streamInfo = (await this._getStreamInfo(
        url,
        videoId,
        appIdVer,
        trialCount > 0 ? ` (try ${trialCount + 1})` : '',
      )) as Array<Record<string, unknown>>;
      const args0 = ((streamInfo[0]?.args as unknown[]) || [])[0] as Record<string, unknown> | undefined;
      if (args0 && 'stream' in args0) {
        return (args0.stream as Array<Record<string, unknown>>) || [];
      }
    }
    return [];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const type = m.groups!.type!;

    if (type === 'embed/recorded') {
      return this.url_result(`http://www.ustream.tv/recorded/${videoId}`, 'Ustream');
    }
    if (type === 'embed') {
      const webpage = await this._download_webpage(url, videoId);
      const contentVideoIds = this._parse_json<string[]>(
        this._search_regex(
          /ustream\.vars\.offAirContentVideoIds=([^;]+);/,
          webpage,
          'content video IDs',
        )!,
        videoId,
      )!;
      return this.playlist_result(
        contentVideoIds.map((u) => this.url_result(`http://www.ustream.tv/recorded/${u}`, 'Ustream')),
        videoId,
      );
    }

    const params = await this._download_json<Record<string, unknown>>(
      `https://api.ustream.tv/videos/${videoId}.json`,
      videoId,
    );

    if (params.error) {
      throw new ExtractorError(`${this.IE_NAME} returned error: ${params.error}`, { expected: true });
    }

    const video = params.video as Record<string, unknown>;
    const title = String(video.title || videoId);
    const filesize = float_or_none(video.file_size);

    let formats: Format[] = Object.entries((video.media_urls as Record<string, string>) || {})
      .filter(([, videoUrl]) => videoUrl)
      .map(([formatId, videoUrl]) => ({
        format_id: formatId,
        url: videoUrl,
        ext: formatId,
        filesize: filesize ?? undefined,
      }));

    if (!formats.length) {
      const hlsStreams = await this._getStreams(url, videoId, [11, 2]);
      if (hlsStreams.length) {
        const hlsUrl = String(hlsStreams[0]?.url || '');
        if (hlsUrl) {
          formats = await this._extract_m3u8_formats(hlsUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls');
        }
      }
    }

    const owner = (video.owner as Record<string, unknown>) || {};
    const thumbnails: Thumbnail[] = Object.entries((video.thumbnail as Record<string, string>) || {}).map(
      ([thumbnailId, thumbnailUrl]) => ({ id: thumbnailId, url: thumbnailUrl }),
    );

    return {
      id: videoId,
      title,
      description: video.description as string | undefined,
      thumbnails,
      timestamp: int_or_none(video.created_at) ?? undefined,
      duration: float_or_none(video.length) ?? undefined,
      view_count: int_or_none(video.views) ?? undefined,
      uploader: owner.username as string | undefined,
      uploader_id: owner.id != null ? String(owner.id) : undefined,
      formats,
    };
  }
}

export class UstreamChannelIE extends InfoExtractor {
  static IE_NAME = 'ustream:channel';
  static _VALID_URL = /https?:\/\/(?:www\.)?ustream\.tv\/channel\/(?<slug>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_valid_url(url)!.groups!.slug!;
    const webpage = await this._download_webpage(url, displayId);
    const channelId = this._html_search_meta('ustream:channel_id', webpage)!;

    const BASE = 'http://www.ustream.tv';
    let nextUrl: string | null = `/ajax/socialstream/videos/${channelId}/1.json`;
    const videoIds: string[] = [];
    while (nextUrl) {
      const reply = await this._download_json<{ data: string; nextUrl?: string | null }>(
        urljoin(BASE, nextUrl),
        displayId,
        `Downloading video information (next: ${videoIds.length + 1})`,
      );
      videoIds.push(...[...reply.data.matchAll(/data-content-id="(\d.*)"/g)].map((m) => m[1]!));
      nextUrl = reply.nextUrl || null;
    }

    const entries = videoIds.map((vid) => this.url_result(`http://www.ustream.tv/recorded/${vid}`, 'Ustream'));
    return {
      _type: 'playlist',
      id: channelId,
      display_id: displayId,
      title: displayId,
      entries,
    };
  }
}
