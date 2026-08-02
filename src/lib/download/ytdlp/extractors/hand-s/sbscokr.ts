/** SBSCoKr family — ported from yt-dlp sbscokr.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, int_or_none, url_or_none } from '../../utils';
import { parse_resolution, parseIso8601 } from './_helpers';

export class SBSCoKrIE extends InfoExtractor {
  static IE_NAME = 'sbs.co.kr';
  static _VALID_URL = [
    /https?:\/\/allvod\.sbs\.co\.kr\/allvod\/vod(?:Package)?EndPage\.do\?(?:[^#]+&)?mdaId=(?<id>\d+)/,
    /https?:\/\/programs\.sbs\.co\.kr\/(?:enter|drama|culture|sports|plus|mtv|kth)\/[a-z0-9]+\/(?:vod|clip|movie)\/\d+\/(?<id>(?:OC)?\d+)/,
  ];

  protected async _callApi(videoId: string, rscuse = ''): Promise<Record<string, unknown>> {
    return this._download_json('https://api.play.sbs.co.kr/1.0/sbs_vodall/' + videoId, videoId, `Downloading m3u8 information ${rscuse}`, {
      query: {
        platform: 'pcweb',
        protocol: 'download',
        absolute_show: 'Y',
        service: 'program',
        ssl: 'Y',
        rscuse,
      },
    });
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const details = await this._callApi(videoId);
    const vod = (details.vod as Record<string, unknown>) || {};
    const source = ((vod.source as Record<string, unknown>)?.mediasource as Record<string, unknown>) || {};
    const streamList = ((vod.source as Record<string, unknown>)?.mediasourcelist as Array<Record<string, unknown>>) || [source];

    const formats: Format[] = [];
    for (let stream of streamList.filter((s) => s.mediaurl || s.mediarscuse)) {
      if (!stream.mediaurl) {
        const newDetails = await this._callApi(videoId, String(stream.mediarscuse || ''));
        const newSource = (((newDetails.vod as Record<string, unknown>)?.source as Record<string, unknown>)?.mediasource as Record<string, unknown>) || {};
        if (newSource.mediarscuse === source.mediarscuse || !newSource.mediaurl) continue;
        stream = newSource;
      }
      formats.push({
        url: String(stream.mediaurl),
        format_id: String(stream.mediarscuse || `http-${formats.length}`),
        format_note: stream.medianame as string | undefined,
        ...parse_resolution(String(stream.quality || '')),
        preference: int_or_none(stream.mediarscuse) ?? undefined,
      });
    }

    const info = (vod.info as Record<string, unknown>) || {};
    const content = (info.content as Record<string, unknown>) || {};
    const program = (info.program as Record<string, unknown>) || {};
    const captionUrl = url_or_none((vod.source as Record<string, unknown>)?.subtitle);
    const subtitles: Record<string, Subtitle[]> | undefined = captionUrl ? { ko: [{ url: captionUrl, ext: 'vtt' }] } : undefined;

    return {
      id: videoId,
      title: info.title as string | undefined,
      duration: int_or_none(info.duration) ?? undefined,
      view_count: int_or_none(info.viewcount) ?? undefined,
      like_count: int_or_none(info.likecount) ?? undefined,
      description: clean_html(String(info.synopsis || '')) || undefined,
      episode: (content.contenttitle as string | undefined) || (content.title as string | undefined),
      episode_number: int_or_none(content.number) ?? undefined,
      series: program.programtitle as string | undefined,
      age_limit: int_or_none(info.targetage) ?? undefined,
      release_timestamp: parseIso8601(info.broaddate) ?? undefined,
      thumbnail: url_or_none(((vod.source as Record<string, unknown>)?.thumbnail as Record<string, unknown>)?.origin) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class SBSCoKrAllvodProgramIE extends InfoExtractor {
  static IE_NAME = 'sbs.co.kr:allvod_program';
  static _VALID_URL =
    /https?:\/\/allvod\.sbs\.co\.kr\/allvod\/vod(?:Free)?ProgramDetail\.do\?(?:[^#]+&)?pgmId=(?<id>P?\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programId = this._match_id(url);
    const details = await this._download_json<{ list?: Array<{ mdaId?: string }> }>(
      'https://allvod.sbs.co.kr/allvod/vodProgramDetail/vodProgramDetailAjax.do',
      programId,
      'Downloading program details',
      { query: { pgmId: programId, currentCount: '10000' } },
    );
    const entries = (details.list || [])
      .filter((x) => x.mdaId)
      .map((x) =>
        this.url_result(`https://allvod.sbs.co.kr/allvod/vodEndPage.do?mdaId=${x.mdaId}`, 'sbs.co.kr', x.mdaId),
      );
    return this.playlist_result(entries, programId);
  }
}

export class SBSCoKrProgramsVodIE extends InfoExtractor {
  static IE_NAME = 'sbs.co.kr:programs_vod';
  static _VALID_URL =
    /https?:\/\/programs\.sbs\.co\.kr\/(?:enter|drama|culture|sports|plus|mtv)\/(?<id>[a-z0-9]+)\/vods/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programSlug = this._match_id(url);
    const menu = await this._download_json<{ program?: { programid?: string } }>(
      `https://static.apis.sbs.co.kr/program-api/1.0/menu/${programSlug}`,
      programSlug,
      'Downloading program menu data',
    );
    const programId = menu.program?.programid;
    return this.url_result(
      `https://allvod.sbs.co.kr/allvod/vodProgramDetail.do?pgmId=${programId}`,
      'sbs.co.kr:allvod_program',
      programId,
    );
  }
}
