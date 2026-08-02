/**
 * WyborczaVideoIE / WyborczaPodcastIE / TokFMPodcastIE / TokFMAuditionIE — aligned with yt-dlp agora.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { monthByName } from './_helpers';

export class WyborczaVideoIE extends InfoExtractor {
  static IE_NAME = 'wyborcza:video';
  static _VALID_URL = /(?:wyborcza:video:|https?:\/\/wyborcza\.pl\/(?:api-)?video\/)(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const meta = await this._download_json<Record<string, unknown>>(
      `https://wyborcza.pl/api-video/${videoId}`,
      videoId,
    );

    const formats: Format[] = [];
    const redirector = String(meta.redirector || '').replace(/^http:/, 'https:');
    const baseUrl = redirector + String(meta.basePath || '');
    const files = (meta.files || {}) as Record<string, string>;

    for (const quality of ['standard', 'high'] as const) {
      if (!files[quality]) continue;
      const filePath = files[quality]!;
      formats.push({
        url: baseUrl + filePath,
        height: int_or_none(/p(\d+)[a-z]+\.mp4$/i.exec(filePath)?.[1]),
        format_id: quality,
      });
    }

    if (files.dash) {
      formats.push(...(await this._extract_mpd_formats(baseUrl + files.dash, videoId)));
    }

    return {
      id: videoId,
      formats,
      title: meta.title as string | undefined,
      description: meta.lead as string | undefined,
      uploader: meta.signature as string | undefined,
      thumbnail: meta.imageUrl as string | undefined,
      duration: int_or_none(meta.duration) ?? undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'wyborcza:video',
      extractor_key: 'WyborczaVideo',
    };
  }
}

export class WyborczaPodcastIE extends InfoExtractor {
  static IE_NAME = 'wyborczapodcast';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:wyborcza\.pl\/podcast(?:\/0,172673\.html)?|wysokieobcasy\.pl\/wysokie-obcasy\/0,176631\.html)(?:\?(?:[^&#]+?&)*podcast=(?<id>\d+))?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    let podcastId = this._match_id(url);

    if (!podcastId) {
      podcastId = url.includes('wysokieobcasy.pl/') ? '395' : '334';
      return this.url_result(TokFMAuditionIE.createUrl(podcastId), 'TokFMAudition', podcastId);
    }

    const meta = await this._download_json<Record<string, unknown>>(
      'https://wyborcza.pl/api/podcast',
      podcastId,
      'Downloading podcast metadata',
      {
        query: {
          guid: podcastId,
          type: url.includes('wysokieobcasy.pl/') ? 'wo' : '',
        },
      },
    );

    const dateMatch = /^(\d\d?) (\w+) (\d{4})$/.exec(String(meta.publishedDate || ''));
    const day = dateMatch?.[1];
    const month = dateMatch?.[2];
    const year = dateMatch?.[3];
    const monthNum = monthByName(month, 'pl');
    const uploadDate =
      day && monthNum && year
        ? `${year}${String(monthNum).padStart(2, '0')}${String(Number(day)).padStart(2, '0')}`
        : undefined;

    return {
      id: podcastId,
      url: String(meta.url || ''),
      title: meta.title as string | undefined,
      description: meta.description as string | undefined,
      thumbnail: meta.imageUrl as string | undefined,
      duration: parse_duration(meta.duration) ?? undefined,
      uploader: meta.author as string | undefined,
      upload_date: uploadDate,
      vcodec: 'none',
      ext: 'mp3',
      webpage_url: url,
      original_url: url,
      extractor: 'wyborczapodcast',
      extractor_key: 'WyborczaPodcast',
    };
  }
}

export class TokFMPodcastIE extends InfoExtractor {
  static IE_NAME = 'tokfm:podcast';
  static _VALID_URL = /(?:https?:\/\/audycje\.tokfm\.pl\/podcast\/|tokfm:podcast:)(?<id>\d+),?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const metadataList = await this._download_json<Record<string, unknown>[]>(
      `https://audycje.tokfm.pl/getp/3${mediaId}`,
      mediaId,
      'Downloading podcast metadata',
    );
    if (!metadataList?.length) throw new ExtractorError('No such podcast', { expected: true });
    const metadata = metadataList[0]!;

    const mp3Payload = await this._download_json<{ link_ssl?: string }>(
      'https://api.podcast.radioagora.pl/api4/getSongUrl',
      mediaId,
      'Downloading podcast mp3 URL',
      {
        query: {
          podcast_id: mediaId,
          device_id: crypto.randomUUID(),
          ppre: 'false',
          audio: 'mp3',
        },
      },
    );

    return {
      id: mediaId,
      url: String(mp3Payload.link_ssl || ''),
      vcodec: 'none',
      ext: 'mp3',
      title: metadata.podcast_name as string | undefined,
      series: metadata.series_name as string | undefined,
      episode: metadata.podcast_name as string | undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'tokfm:podcast',
      extractor_key: 'TokFMPodcast',
    };
  }
}

export class TokFMAuditionIE extends InfoExtractor {
  static IE_NAME = 'tokfm:audition';
  static _VALID_URL = /(?:https?:\/\/audycje\.tokfm\.pl\/audycja\/|tokfm:audition:)(?<id>\d+),?/i;
  static _PAGE_SIZE = 30;
  static _HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 9; Redmi 3S Build/PQ3A.190801.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.101 Mobile Safari/537.36',
  };

  static createUrl(videoId: string): string {
    return `https://audycje.tokfm.pl/audycja/${videoId}`;
  }

  protected async _fetchPage(
    auditionId: string,
    data: Record<string, unknown>,
    page: number,
  ): Promise<VideoInfo[]> {
    const podcastPage = await this._download_json<Record<string, unknown>[]>(
      `https://api.podcast.radioagora.pl/api4/getPodcasts?series_id=${auditionId}&limit=30&offset=${page}&with_guests=true&with_leaders_for_mobile=true`,
      auditionId,
      `Downloading podcast list page ${page + 1}`,
      { headers: TokFMAuditionIE._HEADERS },
    );
    if (!podcastPage?.length) {
      throw new ExtractorError('Agora returned empty page', { expected: true });
    }

    return podcastPage.map((podcast) => ({
      _type: 'url',
      url: String(podcast.podcast_sharing_url || ''),
      extractor: 'tokfm:podcast',
      extractor_key: 'TokFMPodcast',
      id: String(podcast.podcast_id || podcast.podcast_sharing_url || ''),
      title: podcast.podcast_name as string | undefined,
      episode: podcast.podcast_name as string | undefined,
      description: podcast.podcast_description as string | undefined,
      timestamp: int_or_none(podcast.podcast_timestamp) ?? undefined,
      series: data.series_name as string | undefined,
    })) as VideoInfo[];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const auditionId = this._match_id(url);
    const dataList = await this._download_json<Record<string, unknown>[]>(
      `https://api.podcast.radioagora.pl/api4/getSeries?series_id=${auditionId}`,
      auditionId,
      'Downloading audition metadata',
      { headers: TokFMAuditionIE._HEADERS },
    );
    if (!dataList?.length) throw new ExtractorError('No such audition', { expected: true });
    const data = dataList[0]!;

    const entries: VideoInfo[] = [];
    for (let page = 0; page < 500; page++) {
      try {
        const batch = await this._fetchPage(auditionId, data, page);
        entries.push(...batch);
        if (batch.length < TokFMAuditionIE._PAGE_SIZE) break;
      } catch (e) {
        if (page === 0) throw e;
        break;
      }
    }

    return {
      _type: 'playlist',
      id: auditionId,
      title: data.series_name as string | undefined,
      series: data.series_name as string | undefined,
      entries,
      playlist_count: entries.length,
      webpage_url: url,
      original_url: url,
      extractor: 'tokfm:audition',
      extractor_key: 'TokFMAudition',
    };
  }
}
