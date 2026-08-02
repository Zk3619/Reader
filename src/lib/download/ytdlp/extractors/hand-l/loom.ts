/**
 * LoomIE / LoomFolderIE — ported from yt-dlp loom.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { determine_ext, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { parse_iso8601 } from './_helpers';

const GRAPHQL_QUERIES: Record<string, string> = {
  GetVideoSSR: `query GetVideoSSR($videoId: ID!, $password: String) {
    getVideo(id: $videoId, password: $password) {
      __typename
      ... on VideoPasswordMissingOrIncorrect { id message __typename }
      ... on RegularUserVideo {
        id __typename createdAt description name
        owner { display_name __typename }
        video_properties { duration height width microphone_enabled __typename }
      }
    }
  }`,
  GetVideoSource: `query GetVideoSource($videoId: ID!, $password: String, $acceptableMimes: [CloudfrontVideoAcceptableMime]) {
    getVideo(id: $videoId, password: $password) {
      ... on RegularUserVideo {
        id
        nullableRawCdnUrl(acceptableMimes: $acceptableMimes, password: $password) { url __typename }
        __typename
      }
      __typename
    }
  }`,
  FetchVideoTranscript: `query FetchVideoTranscript($videoId: ID!, $password: String) {
    fetchVideoTranscript(videoId: $videoId, password: $password) {
      ... on VideoTranscriptDetails { source_url captions_source_url __typename }
      __typename
    }
  }`,
};

export class LoomIE extends InfoExtractor {
  static IE_NAME = 'loom';
  static _VALID_URL = /https?:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/(?<id>[\da-f]{32})/;

  protected async _callGraphqlApi(operationName: string, videoId: string, fatal = true): Promise<Record<string, unknown>> {
    const password = this.params.videopassword as string | undefined;
    return (
      (await this._download_json<Record<string, unknown>>('https://www.loom.com/graphql', videoId, `Downloading GraphQL ${operationName} JSON`, {
        method: 'POST',
        fatal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-loom-request-source': 'loom_web_45a5bd4',
          'apollographql-client-name': 'web',
          'apollographql-client-version': '45a5bd4',
          'graphql-operation-name': operationName,
          Origin: 'https://www.loom.com',
        },
        data: JSON.stringify({
          operationName,
          variables: {
            videoId,
            password,
            ...(operationName === 'GetVideoSource' ? { acceptableMimes: ['DASH', 'M3U8', 'MP4', 'WEBM'] } : {}),
          },
          query: GRAPHQL_QUERIES[operationName],
        }),
      })) || {}
    );
  }

  protected async _callUrlApi(endpoint: string, videoId: string): Promise<string | null> {
    const resp = await this._download_json<Record<string, unknown>>(
      `https://www.loom.com/api/campaigns/sessions/${videoId}/${endpoint}`,
      videoId,
      `Downloading ${endpoint} JSON`,
      {
        method: 'POST',
        fatal: false,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        data: JSON.stringify({
          anonID: crypto.randomUUID(),
          deviceID: null,
          force_original: false,
          password: this.params.videopassword,
        }),
      },
    );
    return url_or_none(resp.url);
  }

  protected async _extractFormats(videoId: string, metadata: Record<string, unknown>, videoData: Record<string, unknown>): Promise<Format[]> {
    const formats: Format[] = [];
    const videoProperties = (metadata.video_properties as Record<string, unknown>) || {};
    const acodec = videoProperties.microphone_enabled === false ? 'none' : undefined;

    const addFormats = async (formatUrl: string | null, formatId: string, quality: number) => {
      if (!formatUrl) return;
      const ext = determine_ext(formatUrl);
      if (ext === 'm3u8') {
        const normalized = formatUrl.replace('-split.m3u8', '.m3u8');
        const m3u8Formats = await this._extract_m3u8_formats(normalized, videoId, 'mp4', 'm3u8_native', undefined, undefined, `hls-${formatId}`, undefined, false);
        for (const fmt of m3u8Formats) {
          formats.push({ ...fmt, quality, acodec: fmt.vcodec !== 'none' ? fmt.acodec : acodec });
        }
      } else if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(formatUrl, videoId, `dash-${formatId}`, undefined, false)));
      } else {
        formats.push({
          url: formatUrl,
          ext,
          format_id: `http-${formatId}`,
          quality,
          width: int_or_none(videoProperties.width) ?? undefined,
          height: int_or_none(videoProperties.height) ?? undefined,
          acodec,
        });
      }
    };

    const rawUrl = await this._callUrlApi('raw-url', videoId);
    await addFormats(rawUrl, 'raw', 1);
    const transcodedUrl = await this._callUrlApi('transcoded-url', videoId);
    await addFormats(transcodedUrl, 'transcoded', -1);
    const cdnUrl = url_or_none((videoData.data as Record<string, unknown>)?.getVideo &&
      ((videoData.data as Record<string, unknown>).getVideo as Record<string, unknown>).nullableRawCdnUrl &&
      (((((videoData.data as Record<string, unknown>).getVideo as Record<string, unknown>).nullableRawCdnUrl as Record<string, unknown>).url)));
    const valid = [rawUrl, transcodedUrl].filter(Boolean).map((u) => String(u).split('?')[0]);
    if (cdnUrl && !valid.includes(cdnUrl.split('?')[0]!)) {
      await addFormats(cdnUrl, 'cdn', 0);
    }
    return formats;
  }

  protected async _getSubtitles(videoId: string): Promise<Record<string, Subtitle[]>> {
    const subsData = await this._callGraphqlApi('FetchVideoTranscript', videoId, false);
    const transcript = (subsData.data as Record<string, unknown>)?.fetchVideoTranscript as Record<string, unknown> | undefined;
    const urls = [transcript?.source_url, transcript?.captions_source_url].map((u) => url_or_none(u)).filter(Boolean) as string[];
    if (!urls.length) return {};
    return { en: urls.map((u) => ({ url: u, ext: 'vtt' })) };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metaResp = await this._callGraphqlApi('GetVideoSSR', videoId, false);
    const metadata = ((metaResp.data as Record<string, unknown>)?.getVideo as Record<string, unknown>) || {};

    if (metadata.__typename === 'VideoPasswordMissingOrIncorrect') {
      if (!this.params.videopassword) {
        throw new ExtractorError('This video is password-protected, use the --video-password option', { expected: true });
      }
      throw new ExtractorError('Invalid video password', { expected: true });
    }

    const videoData = await this._callGraphqlApi('GetVideoSource', videoId);
    const duration = int_or_none((metadata.video_properties as Record<string, unknown> | undefined)?.duration) ?? undefined;

    return {
      id: videoId,
      duration,
      formats: await this._extractFormats(videoId, metadata, videoData),
      subtitles: await this._getSubtitles(videoId),
      title: str_or_none(metadata.name) ?? videoId,
      description: str_or_none(metadata.description) ?? undefined,
      uploader: str_or_none(traverse_obj(metadata, ['owner', 'display_name'])) ?? undefined,
      timestamp: parse_iso8601(metadata.createdAt) ?? undefined,
    };
  }
}

export class LoomFolderIE extends InfoExtractor {
  static IE_NAME = 'loom:folder';
  static _VALID_URL = /https?:\/\/(?:www\.)?loom\.com\/share\/folder\/(?<id>[\da-f]{32})/;

  protected async _extractFolderData(folderId: string): Promise<Record<string, unknown>> {
    return this._download_json<Record<string, unknown>>(`https://www.loom.com/v1/folders/${folderId}`, folderId, undefined, {
      query: { limit: '10000' },
    });
  }

  protected async *_extractFolderEntries(folderId: string, initial?: Record<string, unknown>): AsyncGenerator<VideoInfo> {
    const folderData = initial || (await this._extractFolderData(folderId));
    for (const video of (folderData.videos as Array<Record<string, unknown>>) || []) {
      const videoId = String(video.id ?? '');
      if (!videoId) continue;
      yield this.url_result(`https://www.loom.com/share/${videoId}`, 'Loom', videoId, str_or_none(video.name) ?? undefined);
    }
    for (const sub of (folderData.folders as Array<Record<string, unknown>>) || []) {
      const subId = str_or_none(sub.id);
      if (!subId || subId === folderId) continue;
      yield* this._extractFolderEntries(subId);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const playlistData = await this._extractFolderData(playlistId);
    const entries: VideoInfo[] = [];
    for await (const entry of this._extractFolderEntries(playlistId, playlistData)) entries.push(entry);
    const folder = (playlistData.folder as Record<string, unknown>) || {};
    return this.playlist_result(entries, playlistId, str_or_none(folder.name)?.trim() ?? playlistId);
  }
}
