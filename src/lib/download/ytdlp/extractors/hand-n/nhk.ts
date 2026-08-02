/**
 * NHK family ??ported from yt-dlp nhk.py (VOD main path; school/radio edges simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Thumbnail, VideoInfo } from '../../types';
import {
  clean_html,
  get_element_by_class,
  int_or_none,
  join_nonempty,
  remove_end,
  traverse_obj,
  unified_timestamp,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, urljoin } from './_helpers';

const BASE_URL_REGEX = /https?:\/\/www3\.nhk\.or\.jp\/nhkworld\/(?<lang>[a-z]{2})\//;

export class NhkBaseIE extends InfoExtractor {
  static IE_NAME = 'nhkbase';
  static _VALID_URL: RegExp | RegExp[] | string | false | null = false;

  protected _API_URL_TEMPLATE =
    'https://api.nhkworld.jp/showsapi/v1/{lang}/{content_format}_{page_type}/{m_id}{extra_page}';

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NhkBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _callApi(
    mId: string,
    lang: string,
    isVideo: boolean,
    isEpisode: boolean,
    isClip: boolean,
  ): Promise<Record<string, unknown>> {
    const contentFormat = isVideo ? 'video' : 'audio';
    const contentType = isClip ? 'clips' : 'episodes';
    const extraPage = isEpisode ? '' : `/${contentFormat}_${contentType}`;
    const pageType = isEpisode ? contentType : 'programs';
    const apiUrl = this._API_URL_TEMPLATE.replace('{lang}', lang)
      .replace('{content_format}', contentFormat)
      .replace('{page_type}', pageType)
      .replace('{m_id}', mId)
      .replace('{extra_page}', extraPage);
    return this._download_json<Record<string, unknown>>(apiUrl, join_nonempty(mId, lang));
  }

  protected async _extractEpisodeInfo(url: string, episode?: Record<string, unknown>): Promise<VideoInfo> {
    const validUrlList = Array.isArray(NhkVodIE._VALID_URL) ? NhkVodIE._VALID_URL : [NhkVodIE._VALID_URL as RegExp];
    const m = validUrlList.map((r) => url.match(r)).find(Boolean)!;
    const lang = m.groups?.lang || 'en';
    const mType = m.groups?.type || 'video';
    const episodeId = m.groups?.id || '';
    const isVideo = mType !== 'audio';

    const ep =
      episode ||
      (await this._callApi(episodeId, lang, isVideo, true, episodeId.slice(0, 4) === '9999'));
    const videoId = [ep.id, lang].filter(Boolean).join('-') || episodeId;

    let title = ep.title as string | undefined;
    const series = traverse_obj(ep, ['video_program', 'title']) || traverse_obj(ep, ['audio_program', 'title']);
    let episodeName = title;
    if (series && title) title = `${series} - ${title}`;
    else if (series && !title) {
      title = String(series);
      episodeName = undefined;
    } else {
      episodeName = undefined;
    }

    const info: VideoInfo = {
      id: videoId,
      title,
      series: series as string | undefined,
      episode: episodeName as string | undefined,
      description: ep.description as string | undefined,
      release_timestamp: unified_timestamp(ep.first_broadcasted_at) ?? undefined,
      categories: ((ep.categories as Array<Record<string, unknown>>) || []).map((c) => String(c.name ?? '')).filter(Boolean),
      tags: ((ep.tags as Array<Record<string, unknown>>) || []).map((t) => String(t.name ?? '')).filter(Boolean),
      thumbnails: ((ep.images as Array<Record<string, unknown>>) || []).map((img) => ({
        url: urljoin(url, url_or_none(img.url) || '') || '',
        width: int_or_none(img.width) ?? undefined,
        height: int_or_none(img.height) ?? undefined,
      })).filter((t) => t.url) as Thumbnail[],
      webpage_url: urljoin(url, url_or_none(ep.url) || '') || undefined,
      extractor_key: 'NhkVod',
      extractor: 'nhk:vod',
    };

    const streamInfo =
      (ep.video as Record<string, unknown>) || (ep.audio as Record<string, unknown>) || {};
    if (!streamInfo.url) {
      this.raise_no_formats('Stream not found; it has most likely expired', true);
    } else {
      const streamUrl = String(streamInfo.url);
      if (isVideo) {
        const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'hls');
        info.formats = formats;
        info.subtitles = subtitles;
        info.duration = int_or_none(streamInfo.duration) ?? undefined;
        info.timestamp = unified_timestamp(streamInfo.published_at) ?? undefined;
      } else {
        const audioPath = remove_end(streamUrl, '.m4a');
        info.formats = await this._extract_m3u8_formats(
          urljoin('https://vod-stream.nhk.jp', `${audioPath}/index.m3u8`),
          episodeId,
          'm4a',
          'm3u8_native',
          undefined,
          undefined,
          'hls',
          undefined,
          false,
        );
        for (const f of info.formats || []) f.language = lang;
      }
    }
    return info;
  }
}

export class NhkVodIE extends NhkBaseIE {
  static IE_NAME = 'nhk:vod';
  static _VALID_URL = [
    new RegExp(`${BASE_URL_REGEX.source}shows/(?:(?<type>video)/)?(?<id>\\d{4}[\\da-z]\\d+)/?(?:$|[?#])`),
    new RegExp(`${BASE_URL_REGEX.source}(?:ondemand|shows)/(?<type>audio)/(?<id>[^/?#]+?-\\d{8}-[\\da-z]+)`),
    new RegExp(`${BASE_URL_REGEX.source}ondemand/(?<type>video)/(?<id>\\d{4}[\\da-z]\\d+)`),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    return this._extractEpisodeInfo(url);
  }
}

export class NhkVodProgramIE extends NhkBaseIE {
  static IE_NAME = 'nhk:vod:program';
  static _VALID_URL = new RegExp(
    `${BASE_URL_REGEX.source}(?:shows|tv)/(?:(?<type>audio)/programs/)?(?<id>\\w+)/?(?:\\?(?:[^#]+&)?type=(?<episode_type>clip|(?:radio|tv)Episode))?`,
  );

  static suitable(url: string): boolean {
    if (NhkVodIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  protected _metaFromClass(classValues: string[], html: string): string | undefined {
    for (const cls of classValues) {
      const el = get_element_by_class(cls, html);
      if (el) {
        const val = clean_html(el);
        if (val) return val;
      }
    }
    return undefined;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lang = m.groups?.lang || 'en';
    const mType = m.groups?.type;
    const programId = m.groups?.id || '';
    const episodeType = m.groups?.episode_type;
    const episodes = await this._callApi(programId, lang, mType !== 'audio', false, episodeType === 'clip');

    const entries: VideoInfo[] = [];
    for (const episode of (episodes.items as Array<Record<string, unknown>>) || []) {
      if (!episode.url) continue;
      entries.push(await this._extractEpisodeInfo(urljoin(url, String(episode.url)), episode));
    }

    const html = await this._download_webpage(url, programId);
    const programTitle = this._metaFromClass(
      ['p-programDetail__title', 'pProgramHero__logoText', 'tAudioProgramMain__title', 'p-program-name'],
      html,
    );
    const programDescription = this._metaFromClass(['p-programDetail__text', 'p-program-description'], html);

    return this.playlist_result(entries, programId, programTitle, programDescription);
  }
}

export class NhkForSchoolBangumiIE extends InfoExtractor {
  static IE_NAME = 'nhk:for:school:bangumi';
  static _VALID_URL = /https?:\/\/www\.nhk\.or\.jp\/school\/bangumi\/(?<id>[\da-z]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK For School bangumi extraction not ported', { expected: true });
  }
}

export class NhkForSchoolSubjectIE extends InfoExtractor {
  static IE_NAME = 'nhk:for:school:subject';
  static _VALID_URL = /https?:\/\/www\.nhk\.or\.jp\/school\/subject\/(?<id>[\da-z]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK For School subject extraction not ported', { expected: true });
  }
}

export class NhkForSchoolProgramListIE extends InfoExtractor {
  static IE_NAME = 'nhk:for:school:programlist';
  static _VALID_URL = /https?:\/\/www\.nhk\.or\.jp\/school\/programlist\/(?<id>[\da-z]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK For School program list extraction not ported', { expected: true });
  }
}

export class NhkRadiruIE extends InfoExtractor {
  static IE_NAME = 'nhk:radiru';
  static _VALID_URL = /https?:\/\/www\.nhk\.or\.jp\/radiru\/(?<id>[\da-z]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK Radiru extraction not ported (geo/auth edge)', { expected: true });
  }
}

export class NhkRadioNewsPageIE extends InfoExtractor {
  static IE_NAME = 'nhk:radionews';
  static _VALID_URL = /https?:\/\/www3\.nhk\.or\.jp\/nhkworld\/(?:en|ja)\/news\/(?<id>[\da-z-]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK Radio News page extraction not ported', { expected: true });
  }
}

export class NhkRadiruLiveIE extends InfoExtractor {
  static IE_NAME = 'nhk:radiru:live';
  static _VALID_URL = /https?:\/\/www\.nhk\.or\.jp\/radiru\/live\/(?<id>[\da-z]+)/;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NHK Radiru live extraction not ported (geo/auth edge)', { expected: true });
  }
}


