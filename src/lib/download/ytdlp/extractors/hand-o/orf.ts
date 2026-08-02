/** ORF family — ported from yt-dlp orf.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  float_or_none,
  int_or_none,
  remove_end,
  traverse_obj,
  unified_strdate,
  url_or_none,
  str_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  make_archive_id,
  mergeSubtitles,
  orderedSet,
  parseIso8601,
} from './_helpers';
import { parse_age_limit } from '../hand-g/_helpers';
import { stripJsonp } from '../hand-a/helpers';

const RADIO_STATIONS: Record<string, [string, string, string]> = {
  fm4: ['fm4', 'fm4', 'orffm4'],
  noe: ['noe', 'oe2n', 'orfnoe'],
  wien: ['wie', 'oe2w', 'orfwie'],
  burgenland: ['bgl', 'oe2b', 'orfbgl'],
  ooe: ['ooe', 'oe2o', 'orfooe'],
  steiermark: ['stm', 'oe2st', 'orfstm'],
  kaernten: ['ktn', 'oe2k', 'orfktn'],
  salzburg: ['sbg', 'oe2s', 'orfsbg'],
  tirol: ['tir', 'oe2t', 'orftir'],
  vorarlberg: ['vbg', 'oe2v', 'orfvbg'],
  oe3: ['oe3', 'oe3', 'orfoe3'],
  oe1: ['oe1', 'oe1', 'orfoe1'],
};
const STATION_RE = Object.keys(RADIO_STATIONS).join('|');

export class ORFRadioIE extends InfoExtractor {
  static IE_NAME = 'orf:radio';
  static _VALID_URL = new RegExp(
    String.raw`https?:\/\/(?:(?<station>${STATION_RE})\.orf\.at\/player|radiothek\.orf\.at\/(?<station2>${STATION_RE}))\/(?<date>[0-9]+)\/(?<show>\w+)`,
  );

  protected *_entries(data: Record<string, unknown>, station: string): Generator<VideoInfo> {
    const [, loopStation, oldIe] = RADIO_STATIONS[station]!;
    for (const info of (data.streams as Array<Record<string, unknown>>) || []) {
      const itemId = info.loopStreamId as string | undefined;
      if (!itemId) continue;
      const vid = itemId.replace('.mp3', '');
      yield {
        id: vid,
        ext: 'mp3',
        url: `https://loopstream01.apa.at/?channel=${loopStation}&id=${itemId}`,
        _old_archive_ids: [make_archive_id(oldIe, vid)],
        title: data.title as string | undefined,
        description: clean_html(String(data.subtitle ?? '')) || undefined,
        duration:
          info.end != null && info.start != null ? (Number(info.end) - Number(info.start)) / 1000 : undefined,
        timestamp: int_or_none(info.start, 1000) ?? undefined,
        series: data.programTitle as string | undefined,
      };
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const station = m.groups!.station || m.groups!.station2!;
    const showDate = m.groups!.date!;
    const showId = m.groups!.show!;
    const [apiStation] = RADIO_STATIONS[station]!;
    const data = await this._download_json<Record<string, unknown>>(
      `http://audioapi.orf.at/${apiStation}/api/json/current/broadcast/${showId}/${showDate}`,
      showId,
    );
    return this.playlist_result(
      [...this._entries(data, station)],
      showId,
      data.title as string | undefined,
      clean_html(String(data.subtitle ?? '')) || undefined,
    );
  }
}

export class ORFPodcastIE extends InfoExtractor {
  static IE_NAME = 'orf:podcast';
  static _VALID_URL = new RegExp(
    String.raw`https?:\/\/sound\.orf\.at\/podcast\/(?<station>bgl|fm4|ktn|noe|oe1|oe3|ooe|sbg|stm|tir|tv|vbg|wie)\/(?<show>[\w-]+)\/(?<id>[\w-]+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const station = m.groups!.station!;
    const show = m.groups!.show!;
    const showId = m.groups!.id!;
    const data = await this._download_json<Record<string, unknown>>(
      `https://audioapi.orf.at/radiothek/api/2.0/podcast/${station}/${show}/${showId}`,
      showId,
    );
    const payload = (data.payload as Record<string, unknown>) || {};
    const enclosure = ((payload.enclosures as Array<Record<string, unknown>>) || [])[0] || {};
    return {
      id: showId,
      ext: 'mp3',
      vcodec: 'none',
      url: enclosure.url as string | undefined,
      title: payload.title as string | undefined,
      description: clean_html(String(payload.description ?? '')) || undefined,
      duration: float_or_none(payload.duration, 1000) ?? undefined,
      series: (payload.podcast as Record<string, unknown> | undefined)?.title as string | undefined,
    };
  }
}

export class ORFIPTVIE extends InfoExtractor {
  static IE_NAME = 'orf:iptv';
  static _VALID_URL = /https?:\/\/iptv\.orf\.at\/(?:#\/)?stories\/(?<id>\d+)/;

  protected async _extractBitsVideo(webpage: string, _storyId: string, videoId: string): Promise<VideoInfo> {
    const data = (
      await this._download_json<Array<Record<string, unknown>>>(
        `http://bits.orf.at/filehandler/static-api/json/current/data.json?file=${videoId}`,
        videoId,
      )
    )[0]!;
    const duration = float_or_none(data.duration, 1000) ?? undefined;
    const video = ((data.sources as Record<string, unknown>)?.default as Record<string, unknown>) || {};
    const renditionRaw = await this._download_webpage(String(video.loadBalancerUrl), videoId);
    const rendition = this._parse_json<{ redirect?: Record<string, string> }>(
      renditionRaw,
      videoId,
      stripJsonp,
    )!;

    const baseFmt = {
      abr: int_or_none(video.audioBitrate) ?? undefined,
      vbr: int_or_none(video.bitrate) ?? undefined,
      fps: int_or_none(video.videoFps) ?? undefined,
      width: int_or_none(video.videoWidth) ?? undefined,
      height: int_or_none(video.videoHeight) ?? undefined,
    };
    const formats: Format[] = [];
    for (const [formatId, formatUrl] of Object.entries(rendition.redirect || {})) {
      const ext = determine_ext(formatUrl);
      if (formatId === 'rtmp') {
        formats.push({ ...baseFmt, url: formatUrl, format_id: formatId });
      } else if (ext === 'f4m') {
        /* f4m skipped in TS port */
      } else if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            formatId,
          )),
        );
      }
    }

    return {
      id: videoId,
      title: remove_end(this._og_search_title(webpage) || '', ' - iptv.ORF.at'),
      description: this._og_search_description(webpage) || undefined,
      duration,
      thumbnail: video.preview as string | undefined,
      upload_date: unified_strdate(this._html_search_meta('dc.date', webpage, 'upload date', false)) ?? undefined,
      formats,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const storyId = this._match_id(url);
    const webpage = await this._download_webpage(`http://iptv.orf.at/stories/${storyId}`, storyId);
    const videoId = this._search_regex(/data-video(?:id)?="(\d+)"/, webpage, 'video id')!;
    return this._extractBitsVideo(webpage, storyId, videoId);
  }
}

export class ORFFM4StoryIE extends ORFIPTVIE {
  static IE_NAME = 'orf:fm4:story';
  static _VALID_URL = /https?:\/\/fm4\.orf\.at\/stories\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const storyId = this._match_id(url);
    const webpage = await this._download_webpage(url, storyId);
    const allIds = orderedSet([...webpage.matchAll(/data-video(?:id)?="(\d+)"/g)].map((m) => m[1]!));
    const entries: VideoInfo[] = [];
    for (let idx = 0; idx < allIds.length; idx++) {
      const info = await this._extractBitsVideo(webpage, storyId, allIds[idx]!);
      let title = info.title;
      if (idx >= 1 && title) title = `${title} (${idx + 1})`;
      entries.push({ ...info, title });
    }
    return this.playlist_result(entries);
  }
}

export class ORFONIE extends InfoExtractor {
  static IE_NAME = 'orf:on';
  static _VALID_URL = /https?:\/\/on\.orf\.at\/video\/(?<id>\d+)(?:\/(?<segment>\d+))?/;

  protected _parseMetadata(apiJson: Record<string, unknown>): Partial<VideoInfo> {
    return {
      id: String(apiJson.id ?? ''),
      age_limit: parse_age_limit(str_or_none(apiJson.age_classification)) ?? undefined,
      duration: float_or_none(apiJson.exact_duration, 1000) ?? undefined,
      title: (apiJson.title as string | undefined) || (apiJson.headline as string | undefined),
      description: (apiJson.description as string | undefined) || (apiJson.teaser_text as string | undefined),
      media_type: apiJson.video_type as string | undefined,
      thumbnail: url_or_none(
        traverse_obj(apiJson, ["_embedded", "image", "public_urls", "highlight_teaser", "url"]),
      ) ?? undefined,
      timestamp: parseIso8601(apiJson.date ?? apiJson.episode_date) ?? undefined,
      release_timestamp: parseIso8601(apiJson.release_date) ?? undefined,
      modified_timestamp: parseIso8601(apiJson.updated_at) ?? undefined,
    };
  }

  protected async _extractVideoInfo(vid: string, apiJson: Record<string, unknown>): Promise<VideoInfo> {
    const formats: Format[] = [];
    const subtitles: VideoInfo['subtitles'] = {};
    const sources = (apiJson.sources as Record<string, unknown[]>) || {};
    for (const manifestType of Object.keys(sources)) {
      for (const item of sources[manifestType] || []) {
        const manifestUrl = url_or_none((item as Record<string, unknown>).src);
        if (!manifestUrl) continue;
        if (manifestType === 'hls') {
          const { formats: fmts, subtitles: subs } = await extractM3u8FormatsAndSubtitles(
            this,
            manifestUrl,
            vid,
            'hls',
          );
          formats.push(...fmts);
          mergeSubtitles(subtitles!, subs);
        } else if (manifestType === 'dash') {
          formats.push(...(await this._extract_mpd_formats(manifestUrl, vid, 'dash', undefined, false)));
        }
      }
    }

    const embedded = (apiJson._embedded as Record<string, unknown>) || {};
    const subtitle = (embedded.subtitle as Record<string, unknown>) || {};
    for (const key of ['xml_url', 'sami_url', 'stl_url', 'ttml_url', 'srt_url', 'vtt_url'] as const) {
      const subUrl = url_or_none(subtitle[key]);
      if (subUrl) mergeSubtitles(subtitles!, { de: [{ url: subUrl, ext: 'vtt' }] });
    }

    return {
      id: vid,
      formats,
      subtitles,
      _old_archive_ids: [make_archive_id('ORFTVthek', vid)],
      ...this._parseMetadata(apiJson),
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const segmentId = m.groups!.segment;
    const encryptedId = btoa(`3dSlfek03nsLKdj4Jsd${videoId}`);
    const apiJson = await this._download_json<Record<string, unknown>>(
      `https://api-tvthek.orf.at/api/v4.3/public/episode/encrypted/${encryptedId}`,
      videoId,
    );

    if (apiJson.is_drm_protected) this.report_warning(`${videoId}: content is DRM protected`);

    const segments = ((apiJson._embedded as Record<string, unknown>)?.segments as Array<Record<string, unknown>>) || [];
    const selected = segments.find((s) => String(s.id) === segmentId);

    if (selected && segmentId) {
      return this._extractVideoInfo(String(selected.id), selected);
    }

    const hasRootSources = Object.values((apiJson.sources as Record<string, unknown[]>) || {}).some((arr) =>
      (arr || []).some((item) => url_or_none((item as Record<string, unknown>).src)),
    );

    if (!hasRootSources) {
      const entries = await Promise.all(
        segments.map((seg) => this._extractVideoInfo(String(seg.id), seg)),
      );
      return {
        ...this.playlist_result(entries, videoId, this._parseMetadata(apiJson).title),
        _type: 'multi_video',
        ...this._parseMetadata(apiJson),
      };
    }

    return this._extractVideoInfo(videoId, apiJson);
  }
}
