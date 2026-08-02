/**
 * MySpaceIE / MySpaceAlbumIE — ported from yt-dlp myspace.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class MySpaceIE extends InfoExtractor {
  static IE_NAME = 'myspace';
  static _VALID_URL =
    /https?:\/\/myspace\.com\/[^/]+\/(?<mediatype>video\/[^/]+\/(?<video_id>\d+)|music\/song\/[^/?#&]+-(?<song_id>\d+)-\d+(?:[/?#&]|$))/;

  protected _formatsFromStreamUrls(
    streamUrl: string | null | undefined,
    hlsStreamUrl: string | null | undefined,
    httpStreamUrl: string | null | undefined,
    playerUrl: string | null | undefined,
    isSong: boolean,
    width?: number,
    height?: number,
  ): Format[] {
    const formats: Format[] = [];
    const vcodec = isSong ? 'none' : undefined;
    if (hlsStreamUrl) {
      formats.push({
        format_id: 'hls',
        url: hlsStreamUrl,
        protocol: 'm3u8_native',
        ext: isSong ? 'm4a' : 'mp4',
        vcodec,
      });
    }
    if (streamUrl && playerUrl) {
      const [rtmpUrl, playPath] = streamUrl.split(';');
      formats.push({
        format_id: 'rtmp',
        url: rtmpUrl!,
        play_path: playPath,
        player_url: playerUrl,
        protocol: 'rtmp',
        ext: 'flv',
        width,
        height,
        vcodec,
      });
    }
    if (httpStreamUrl) {
      formats.push({ format_id: 'http', url: httpStreamUrl, width, height, vcodec });
    }
    return formats;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.video_id || m.groups?.song_id || '';
    const isSong = (m.groups?.mediatype || '').startsWith('music/song');
    const webpage = await this._download_webpage(url, videoId);
    const playerUrl = this._search_regex(/videoSwf":"([^"?]*)/, webpage, 'player URL', null, false);

    if (isSong) {
      const songData =
        webpage.match(new RegExp(`<button[^>]+data-song-id=(["'])${videoId}\\1[\\s\\S]*?(?=</button>)`, 'i'))?.[0] ||
        null;
      if (!songData) {
        this.report_warning(`${videoId}: No downloadable song on this page`);
        return { id: videoId, title: videoId, formats: [] };
      }

      const searchData = (name: string): string => {
        const dm = songData.match(new RegExp(`data-${name}=([\\'"])(.*?)\\1`));
        return dm?.[2] || '';
      };

      const formats = this._formatsFromStreamUrls(
        searchData('stream-url'),
        searchData('hls-stream-url'),
        searchData('http-stream-url'),
        playerUrl,
        true,
      );

      if (!formats.length) {
        const vevoId = searchData('vevo-id');
        const youtubeId = searchData('youtube-id');
        if (vevoId) return this.url_result(`vevo:${vevoId}`, 'Vevo');
        if (youtubeId) return this.url_result(youtubeId, 'Youtube');
        throw new ExtractorError("Found song but don't know how to download it", { expected: true });
      }

      return {
        id: videoId,
        title: this._og_search_title(webpage) || undefined,
        uploader: searchData('artist-name') || undefined,
        uploader_id: searchData('artist-username') || undefined,
        thumbnail: this._og_search_thumbnail(webpage) || undefined,
        duration: int_or_none(searchData('duration')) ?? undefined,
        formats,
      };
    }

    const context = this._parse_json<{ video: Record<string, unknown> }>(
      this._search_regex(/context = ({.*?});/, webpage, 'context'),
      videoId,
    )!.video;

    return {
      id: videoId,
      title: str_or_none(context.title) || videoId,
      description: str_or_none(context.description) ?? undefined,
      thumbnail: str_or_none(context.imageUrl) ?? undefined,
      uploader: str_or_none(context.artistName) ?? undefined,
      uploader_id: str_or_none(context.artistUsername) ?? undefined,
      duration: int_or_none(context.duration) ?? undefined,
      timestamp: parseIso8601(context.dateAdded) ?? undefined,
      formats: this._formatsFromStreamUrls(
        str_or_none(context.streamUrl),
        str_or_none(context.hlsStreamUrl),
        str_or_none(context.mp4StreamUrl),
        playerUrl,
        false,
        int_or_none(context.width) ?? undefined,
        int_or_none(context.height) ?? undefined,
      ),
    };
  }
}

export class MySpaceAlbumIE extends InfoExtractor {
  static IE_NAME = 'myspace:album';
  static _VALID_URL = /https?:\/\/myspace\.com\/([^/]+)\/music\/album\/(?<title>.*-)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups?.id ?? '';
    const displayId = `${m.groups?.title ?? ''}${playlistId}`;
    const webpage = await this._download_webpage(url, displayId);
    const tracksPaths = [...webpage.matchAll(/"music:song" content="(.*?)"/g)].map((x) => x[1]!);
    if (!tracksPaths.length) {
      throw new ExtractorError(`${displayId}: No songs found, try using proxy`, { expected: true });
    }
    return {
      _type: 'playlist',
      id: playlistId,
      display_id: displayId,
      title: this._og_search_title(webpage) || undefined,
      entries: tracksPaths.map((t) => this.url_result(t, 'myspace')),
    };
  }
}
