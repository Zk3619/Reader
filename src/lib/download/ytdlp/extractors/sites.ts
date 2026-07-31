/**
 * VimeoIE / TwitchIE / SoundcloudIE — 高价值站点精简实现。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

export class VimeoIE extends InfoExtractor {
  static IE_NAME = 'vimeo';
  static IE_DESC = 'Vimeo';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|album\/\d+\/video\/|video\/)?(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Vimeo id', { expected: true });

    const configUrl = `https://player.vimeo.com/video/${id}/config`;
    const cfg = await this._download_json<Record<string, unknown>>(
      configUrl,
      id,
      'Downloading Vimeo config',
      {
        headers: { Referer: `https://vimeo.com/${id}` },
        fatal: false,
      },
    );
    if (!cfg) throw new ExtractorError('Unable to fetch Vimeo config', { expected: true });

    const video = (cfg.video || {}) as Record<string, unknown>;
    const request = (cfg.request || {}) as Record<string, unknown>;
    const files = (request.files || {}) as Record<string, unknown>;
    const progressive = (files.progressive as Record<string, unknown>[]) || [];
    const formats: Format[] = progressive
      .filter((f) => f.url)
      .map((f, i) => ({
        format_id: String(f.quality || f.id || i),
        url: String(f.url),
        ext: 'mp4',
        protocol: 'https',
        width: Number(f.width) || null,
        height: Number(f.height) || null,
        fps: Number(f.fps) || null,
        vcodec: 'h264',
        acodec: 'aac',
      }));

    const hls = (files.hls as Record<string, unknown>)?.cdns as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (hls) {
      for (const [name, cdn] of Object.entries(hls)) {
        const u = String(cdn.url || cdn.avc_url || '');
        if (u) {
          formats.push({
            format_id: `hls-${name}`,
            url: u,
            ext: 'mp4',
            protocol: 'm3u8_native',
            vcodec: 'unknown',
            acodec: 'unknown',
          });
        }
      }
    }

    if (!formats.length) throw new ExtractorError('No Vimeo formats', { expected: true });

    return {
      id,
      title: String(video.title || id),
      duration: Number(video.duration) || null,
      thumbnail: String((video.thumbs as Record<string, string>)?.base || video.thumbnail_url || '') || undefined,
      webpage_url: `https://vimeo.com/${id}`,
      original_url: url,
      formats,
      extractor: 'vimeo',
      extractor_key: 'Vimeo',
      http_headers: { Referer: `https://vimeo.com/${id}` },
    };
  }
}

export class TwitchVodIE extends InfoExtractor {
  static IE_NAME = 'twitch:vod';
  static IE_DESC = 'Twitch VODs';
  static _VALID_URL =
    /https?:\/\/(?:www\.|go\.)?twitch\.tv\/(?:videos\/|\w+\/v(?:ideo)?\/)(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Twitch VOD id', { expected: true });

    const gql = await this._download_json<{
      data?: { video?: Record<string, unknown> };
    }>('https://gql.twitch.tv/gql', id, 'Downloading Twitch GQL', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        query: `query { video(id: "${id}") { id title lengthSeconds previewThumbnailURL broadcastType owner { displayName login } } }`,
      }),
      fatal: false,
    });

    const video = gql?.data?.video;
    const access = await this._download_json<{
      data?: Array<{ value?: string }>;
    }>('https://gql.twitch.tv/gql', id, 'Downloading Twitch playback access', {
      method: 'POST',
      headers: {
        'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      data: JSON.stringify([
        {
          operationName: 'PlaybackAccessToken_Template',
          query:
            'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) {    value    signature    __typename  }  videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) {    value    signature    __typename  }}',
          variables: {
            isLive: false,
            login: '',
            isVod: true,
            vodID: id,
            playerType: 'site',
          },
        },
      ]),
      fatal: false,
    });

    const tokenObj = (access as { data?: Array<{ videoPlaybackAccessToken?: { value?: string; signature?: string } }> })
      ?.data?.[0]?.videoPlaybackAccessToken;
    const token = tokenObj?.value;
    const sig = tokenObj?.signature;
    if (!token || !sig) {
      throw new ExtractorError('Unable to get Twitch access token', { expected: true });
    }

    const m3u8 = `https://usher.ttvnw.net/vod/${id}.m3u8?sig=${encodeURIComponent(sig)}&token=${encodeURIComponent(token)}&allow_source=true&allow_audio_only=true`;

    return {
      id,
      title: String(video?.title || `twitch-vod-${id}`),
      duration: Number(video?.lengthSeconds) || null,
      thumbnail: String(video?.previewThumbnailURL || '') || undefined,
      uploader: String(
        ((video?.owner as Record<string, unknown>)?.displayName as string) || '',
      ) || null,
      webpage_url: `https://www.twitch.tv/videos/${id}`,
      original_url: url,
      formats: [
        {
          format_id: 'hls',
          url: m3u8,
          ext: 'mp4',
          protocol: 'm3u8_native',
          vcodec: 'unknown',
          acodec: 'unknown',
        },
      ],
      extractor: 'twitch:vod',
      extractor_key: 'TwitchVod',
    };
  }
}

export class SoundcloudIE extends InfoExtractor {
  static IE_NAME = 'soundcloud';
  static IE_DESC = 'Soundcloud';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?soundcloud\.com\/(?!(?:search|tags|groups)\/)(?<user>[^/]+)\/(?!(?:sets|tracks)\/)(?<id>[^/?#]+)|api\.soundcloud\.com\/(?:tracks|stream)\/(?<apiid>\d+))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const webpage = await this._download_webpage(url, 'sc', 'Downloading Soundcloud page', {
      fatal: false,
    });
    const clientId =
      webpage?.match(/client_id\s*:\s*"([0-9a-zA-Z]{32})"/)?.[1] ||
      webpage?.match(/clientId\s*[:=]\s*"([0-9a-zA-Z]{32})"/)?.[1] ||
      'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX';

    let apiUrl = '';
    const m = url.match(/api\.soundcloud\.com\/(?:tracks|stream)\/(\d+)/);
    if (m) {
      apiUrl = `https://api-v2.soundcloud.com/tracks/${m[1]}?client_id=${clientId}`;
    } else {
      const resolve = await this._download_json<{ id?: number; media?: unknown }>(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`,
        'sc',
        'Resolving Soundcloud URL',
        { fatal: false },
      );
      if (!resolve?.id) throw new ExtractorError('Unable to resolve Soundcloud URL', { expected: true });
      apiUrl = `https://api-v2.soundcloud.com/tracks/${resolve.id}?client_id=${clientId}`;
    }

    const track = await this._download_json<Record<string, unknown>>(
      apiUrl,
      'sc',
      'Downloading track JSON',
    );
    if (!track) throw new ExtractorError('No track data', { expected: true });

    const media = track.media as Record<string, unknown> | undefined;
    const transcodings = (media?.transcodings as Record<string, unknown>[]) || [];
    const formats: Format[] = [];
    for (const t of transcodings) {
      const format = t.format as Record<string, unknown> | undefined;
      const mime = String(format?.mime_type || '');
      const streamUrl = String(t.url || '');
      if (!streamUrl) continue;
      const stream = await this._download_json<{ url?: string }>(
        `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}client_id=${clientId}`,
        String(track.id),
        'Resolving stream',
        { fatal: false },
      );
      const u = stream?.url;
      if (!u) continue;
      formats.push({
        format_id: String(t.preset || formats.length),
        url: u,
        ext: mime.includes('ogg') ? 'ogg' : mime.includes('mp3') ? 'mp3' : 'm4a',
        protocol: u.includes('.m3u8') ? 'm3u8_native' : 'https',
        acodec: 'unknown',
        vcodec: 'none',
        format_note: String(t.quality || ''),
      });
    }

    if (!formats.length) throw new ExtractorError('No Soundcloud streams', { expected: true });

    return {
      id: String(track.id),
      title: String(track.title || track.id),
      duration: Number(track.duration) ? Number(track.duration) / 1000 : null,
      webpage_url: String(track.permalink_url || url),
      original_url: url,
      formats,
      thumbnail: String(
        (track.artwork_url as string) || (track.user as Record<string, string>)?.avatar_url || '',
      ) || undefined,
      uploader: String((track.user as Record<string, string>)?.username || '') || null,
      extractor: 'soundcloud',
      extractor_key: 'Soundcloud',
    };
  }
}
