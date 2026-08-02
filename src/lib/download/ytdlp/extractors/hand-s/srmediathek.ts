/** SRMediathekIE �?ported from yt-dlp srmediathek.py (ARDMediathekBaseIE + inline _extract_media_info) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  extract_attributes,
  get_element_by_class,
  int_or_none,
  parse_duration,
  parse_qs,
  unified_strdate,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  get_element_html_by_id,
  protoRelative,
  strip_or_none,
} from './_helpers';

abstract class ARDMediathekBaseImpl extends InfoExtractor {
  static _GEO_COUNTRIES = ['DE'];

  protected async _extractFormats(
    mediaInfo: Record<string, unknown>,
    videoId: string,
  ): Promise<Format[]> {
    const type = mediaInfo._type as string | undefined;
    const mediaArray = (mediaInfo._mediaArray as Record<string, unknown>[]) || [];
    const formats: Format[] = [];
    for (let num = 0; num < mediaArray.length; num++) {
      const media = mediaArray[num]!;
      for (const stream of (media._mediaStreamArray as Record<string, unknown>[]) || []) {
        let streamUrls = stream._stream;
        if (!streamUrls) continue;
        if (!Array.isArray(streamUrls)) streamUrls = [streamUrls];
        const quality = stream._quality as string | undefined;
        const server = stream._server as string | undefined;
        for (const streamUrl of streamUrls as string[]) {
          if (!url_or_none(streamUrl)) continue;
          const ext = determine_ext(streamUrl);
          if (quality !== 'auto' && (ext === 'f4m' || ext === 'm3u8')) continue;
          if (ext === 'm3u8') {
            const res = await extractM3u8FormatsAndSubtitles(this, streamUrl, videoId, 'hls');
            formats.push(...res.formats);
          } else {
            const f: Format = {
              url: streamUrl,
              format_id: `a${num}-${ext}-${quality}`,
            };
            const res = /_(\d+)x(\d+)\.mp4$/.exec(streamUrl);
            if (res) {
              f.width = Number(res[1]);
              f.height = Number(res[2]);
            }
            if (type === 'audio') f.vcodec = 'none';
            if (server?.startsWith('rtmp')) {
              f.url = server;
              f.play_path = streamUrl;
              f.format_id = `a${num}-rtmp-${quality}`;
            }
            formats.push(f);
          }
        }
      }
    }
    return formats;
  }

  protected async _parseMediaInfo(
    mediaInfo: Record<string, unknown>,
    videoId: string,
    fsk: boolean,
  ): Promise<Partial<VideoInfo>> {
    const formats = await this._extractFormats(mediaInfo, videoId);
    if (!formats.length) {
      if (fsk) this.raise_no_formats('This video is only available after 20:00', true);
      if (mediaInfo._geoblocked) {
        this.raise_geo_restricted('This video is not available due to geoblocking');
      }
    }
    const subtitles: Record<string, Subtitle[]> = {};
    const subtitleUrl = mediaInfo._subtitleUrl as string | undefined;
    if (subtitleUrl) {
      subtitles.de = [
        { url: subtitleUrl, ext: 'ttml' },
        { url: `${subtitleUrl.replace('/ebutt/', '/webvtt/')}.vtt`, ext: 'vtt' },
      ];
    }
    return {
      id: videoId,
      duration: int_or_none(mediaInfo._duration) ?? undefined,
      thumbnail: (mediaInfo._previewImage as string) || undefined,
      is_live: mediaInfo._isLive === true,
      formats,
      subtitles,
    };
  }

  protected async _extractMediaInfo(
    mediaInfoUrl: string,
    webpage: string,
    videoId: string,
  ): Promise<Partial<VideoInfo>> {
    const mediaInfo = await this._download_json<Record<string, unknown>>(
      mediaInfoUrl,
      videoId,
      'Downloading media JSON',
    );
    return this._parseMediaInfo(mediaInfo, videoId, /"fsk"/i.test(webpage));
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ARDMediathekBaseIE is not a standalone extractor', { expected: true });
  }
}

export class ARDMediathekBaseIE extends ARDMediathekBaseImpl {
  static IE_NAME = 'ardmediathekbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
}

export class SRMediathekIE extends ARDMediathekBaseImpl {
  static IE_NAME = 'sr:mediathek';
  static IE_DESC = 'Saarländischer Rundfunk';
  static _CLS_COMMON = 'teaser__image__caption__text teaser__image__caption__text--';
  static _VALID_URL = /https?:\/\/(?:www\.)?sr-mediathek\.de\/index\.php\?.*?&id=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const description = this._og_search_description(webpage);

    if (description === 'Der gewünschte Beitrag ist leider nicht mehr vorhanden.') {
      throw new ExtractorError(`Video ${videoId} is no longer available`, { expected: true });
    }

    const playerDiv = get_element_html_by_id(`player${videoId}`, webpage);
    const playerAttrs = playerDiv ? extract_attributes(playerDiv) : {};
    const playerUrlRaw = playerAttrs['data-mediacollection-ardplayer'];
    if (!playerUrlRaw) throw new ExtractorError('Unable to extract player URL');
    const playerUrl = protoRelative(playerUrlRaw);

    const articleBlock = get_element_by_class('article__content', webpage) || '';
    const articleP = get_element_by_class('', articleBlock) || articleBlock;
    const article = clean_html(articleP) || '';

    const mediaInfo = await this._extractMediaInfo(playerUrl, webpage, videoId);

    const titleCls = strip_or_none(clean_html(get_element_by_class('ardplayer-title', webpage) || '')) || undefined;
    const subheadline = clean_html(get_element_by_class(`${SRMediathekIE._CLS_COMMON}subheadline`, webpage) || '');
    const channel = subheadline?.split('|')[0]?.trim() || undefined;
    const durationMatch = /(\d{2}:\d{2}:\d{2})/.exec(article);
    const releaseMatch = /(\d{2}\.\d{2}\.\d{4})/.exec(article);

    let seriesId: string | undefined;
    const teaserLink = webpage.match(
      /class=["']teaser__link["'][^>]*href=["']([^"']+)["']/i,
    );
    if (teaserLink?.[1]) {
      const qs = parse_qs(teaserLink[1]);
      const sen = qs.sen;
      seriesId = Array.isArray(sen) ? String(sen[0]) : sen ? String(sen) : undefined;
    }

    return {
      ...mediaInfo,
      id: videoId,
      title: titleCls,
      channel,
      description: description || undefined,
      duration: durationMatch ? parse_duration(durationMatch[1]) ?? undefined : undefined,
      release_date: releaseMatch ? unified_strdate(releaseMatch[1]) ?? undefined : undefined,
      series: strip_or_none(clean_html(get_element_by_class(`${SRMediathekIE._CLS_COMMON}headline`, webpage) || '')) || undefined,
      series_id: seriesId,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
    } as VideoInfo;
  }
}
