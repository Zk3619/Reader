/** RTVE* — ported from yt-dlp rtve.py (main paths, simplified) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, float_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

export class RTVEBaseIE extends InfoExtractor {
  static IE_NAME = 'RTVEBase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('RTVEBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractPngFormats(videoId: string, mediaType = 'videos') {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const manager of ['rtveplayw', 'default']) {
      const pngPage = await this._download_webpage(
        `http://www.rtve.es/ztnr/movil/thumbnail/${manager}/${mediaType}/${videoId}.png`,
        videoId,
        'Downloading url information',
        { query: { q: 'v2' }, fatal: false },
      );
      if (!pngPage) continue;
      for (const m of pngPage.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g)) {
        const res = await extractM3u8FormatsAndSubtitles(this, m[0]!, videoId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      }
    }
    return { formats, subtitles };
  }

  protected _parseMetadata(metadata: Record<string, unknown>): Partial<VideoInfo> {
    return {
      title: metadata.title as string | undefined,
      alt_title: metadata.alt as string | undefined,
      description: clean_html(String(metadata.description || '')) || undefined,
      timestamp: parseIso8601(String(metadata.dateOfEmission || '').replace(' ', 'T')) ?? undefined,
      release_timestamp: parseIso8601(String(metadata.publicationDate || '').replace(' ', 'T')) ?? undefined,
      thumbnail: url_or_none(String(metadata.thumbnail || metadata.image || '')) ?? undefined,
      duration: float_or_none(metadata.duration as number, 1000) ?? undefined,
      is_live: metadata.live as boolean | undefined,
      series: clean_html(String(metadata.programTitle || traverse_obj(metadata, ['programInfo', 'title']) || '')) || undefined,
    };
  }
}

export class RTVEALaCartaIE extends RTVEBaseIE {
  static IE_NAME = 'rtve.es:alacarta';
  static IE_DESC = 'RTVE a la carta and Play';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rtve\.es\/(?:(?:m\/)?(?:(?:alacarta|play)\/videos|filmoteca)\/(?!directo)(?:[^/?#]+\/){2}|infantil\/serie\/[^/?#]+\/video\/[^/?#]+\/)(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const metadata = (
      await this._download_json<{ page?: { items?: Array<Record<string, unknown>> } }>(
        `http://www.rtve.es/api/videos/${videoId}/config/alacarta_videos.json`,
        videoId,
      )
    ).page?.items?.[0];
    if (!metadata) throw new ExtractorError('Unable to extract video metadata');
    if (metadata.state === 'DESPU') throw new ExtractorError('The video is no longer available', { expected: true });
    const { formats, subtitles } = await this._extractPngFormats(videoId);
    return { id: videoId, formats, subtitles, ...this._parseMetadata(metadata) };
  }
}

export class RTVEAudioIE extends RTVEBaseIE {
  static IE_NAME = 'rtve.es:audio';
  static IE_DESC = 'RTVE audio';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtve\.es\/(alacarta|play)\/audios\/(?:[^/?#]+\/){2}(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const metadata = (
      await this._download_json<{ page?: { items?: Array<Record<string, unknown>> } }>(
        `https://www.rtve.es/api/audios/${audioId}.json`,
        audioId,
      )
    ).page?.items?.[0];
    if (!metadata) throw new ExtractorError('Unable to extract audio metadata');
    const { formats, subtitles } = await this._extractPngFormats(audioId, 'audios');
    return { id: audioId, formats, subtitles, ...this._parseMetadata(metadata) };
  }
}

export class RTVELiveIE extends RTVEBaseIE {
  static IE_NAME = 'rtve.es:live';
  static IE_DESC = 'RTVE.es live streams';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?rtve\.es\/(?:directo\/(?<id>[a-zA-Z0-9-]+)|play\/videos\/directo\/[^/?#]+\/(?<id2>[a-zA-Z0-9-]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id || m.groups!.id2!;
    const webpage = await this._download_webpage(url, videoId);
    const channelId = this._search_regex(/data-id="([^"]+)"/, webpage, 'channel id', null, false) || videoId;
    const { formats, subtitles } = await this._extractPngFormats(channelId);
    return {
      id: videoId,
      title: this._og_search_title(webpage) ?? videoId,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      formats,
      subtitles,
      is_live: true,
    };
  }
}

export class RTVETelevisionIE extends InfoExtractor {
  static IE_NAME = 'rtve.es:television';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtve\.es\/television\/[^/?#]+\/[^/?#]+\/(?<id>\d+)\.shtml/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`https://www.rtve.es/play/videos/${videoId}`, 'RTVEALaCarta', videoId);
  }
}

export class RTVEProgramIE extends RTVEBaseIE {
  static IE_NAME = 'rtve.es:program';
  static IE_DESC = 'RTVE.es programs';
  static _VALID_URL = /https?:\/\/(?:www\.)?rtve\.es\/play\/videos\/(?<id>[\w-]+)\/?(?:[?#]|$)/;
  static _PAGE_SIZE = 60;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programId = this._match_id(url);
    const data = await this._download_json<{ page?: { items?: Array<{ id?: string; uri?: string }> } }>(
      `https://www.rtve.es/api/videos/program/${programId}.json`,
      programId,
      undefined,
      { query: { pageSize: String(RTVEProgramIE._PAGE_SIZE) } },
    );
    const entries = (data.page?.items || []).map((item) =>
      this.url_result(`https://www.rtve.es${item.uri}`, 'RTVEALaCarta', String(item.id || '')),
    );
    return this.playlist_result(entries, programId);
  }
}
