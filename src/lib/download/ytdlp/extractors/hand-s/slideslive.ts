/** SlidesLiveIE — ported from yt-dlp slideslive.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import {
  int_or_none,
  parse_qs,
  smuggle_url,
  unified_timestamp,
  url_or_none,
  traverse_obj,
} from '../../utils';

type Chapter = { title: string; start_time?: number };
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class SlidesLiveIE extends InfoExtractor {
  static IE_NAME = 'slideslive';
  static _VALID_URL = /https?:\/\/slideslive\.com\/(?:embed\/(?:presentation\/)?)?(?<id>[0-9]+)/;

  protected _extractCustomM3u8Info(m3u8Data: string): Record<string, unknown> {
    const lookup: Record<string, string> = {
      'PRESENTATION-TITLE': 'title',
      'PRESENTATION-UPDATED-AT': 'timestamp',
      'PRESENTATION-THUMBNAIL': 'thumbnail',
      'PLAYLIST-TYPE': 'playlist_type',
      'VOD-VIDEO-SERVICE-NAME': 'service_name',
      'VOD-VIDEO-ID': 'service_id',
      'VOD-VIDEO-SERVERS': 'video_servers',
      'VOD-SUBTITLES': 'subtitles',
      'VOD-SLIDES-JSON-URL': 'slides_json_url',
      'VOD-SLIDES-XML-URL': 'slides_xml_url',
    };
    const out: Record<string, unknown> = {};
    for (const line of m3u8Data.split(/\r?\n/)) {
      if (!line.startsWith('#EXT-SL-')) continue;
      const [, tag, value] = line.match(/^#EXT-SL-([^:]+):([\s\S]*)$/) || [];
      const key = lookup[tag || ''];
      if (key) out[key] = value;
    }
    for (const key of ['video_servers', 'subtitles']) {
      if (key in out) {
        try {
          out[key] = JSON.parse(String(out[key]));
        } catch {
          out[key] = [];
        }
      }
    }
    return out;
  }

  protected async _extractFormatsAndDuration(
    cdnHostname: string,
    path: string,
    videoId: string,
    skipDuration = false,
  ): Promise<{ formats: Format[]; duration?: number }> {
    const formats: Format[] = [];
    let duration: number | undefined;
    const hlsUrl = `https://${cdnHostname}/${path}/master.m3u8`;
    const hlsRes = await extractM3u8FormatsAndSubtitles(this, hlsUrl, videoId, 'hls');
    if (hlsRes.formats.length) {
      formats.push(...hlsRes.formats);
      if (!skipDuration) {
        duration = int_or_none(hlsRes.formats[0]?.duration) ?? undefined;
      }
    }
    const dashFormats = await this._extract_mpd_formats(
      `https://${cdnHostname}/${path}/master.mpd`,
      videoId,
      'dash',
      undefined,
      false,
    );
    formats.push(...dashFormats);
    return { formats, duration };
  }

  protected async _downloadEmbedWebpage(
    videoId: string,
    headers: Record<string, string>,
  ): Promise<string> {
    return this._download_webpage(
      `https://slideslive.com/embed/presentation/${videoId}`,
      videoId,
      undefined,
      {
        headers,
        query: {
          embed_parent_url: headers.Referer,
          embed_container_origin: headers.Origin,
        },
      },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const qs = parse_qs(url);
    let headers: Record<string, string> = {};
    const referer = qs.embed_parent_url?.[0];
    const origin = qs.embed_container_origin?.[0];
    if (referer) headers.Referer = referer;
    if (origin) headers.Origin = origin;

    let webpage = await this._downloadEmbedWebpage(videoId, headers);
    if (/domain_not_allowed/.test(webpage)) {
      const domain = qs.allowed_domains?.[0] || qs['allowed_domains[]']?.[0];
      if (!domain) {
        throw new ExtractorError('This is an embed-only presentation. Try passing --referer', {
          expected: true,
        });
      }
      headers = { Referer: `https://${domain}/`, Origin: `https://${domain}` };
      webpage = await this._downloadEmbedWebpage(videoId, headers);
    }

    const playerToken = this._search_regex(/data-player-token="([^"]+)"/, webpage, 'player token')!;
    const playerData = await this._download_webpage(
      `https://slideslive.com/player/${videoId}`,
      videoId,
      'Downloading player info',
      { query: { player_token: playerToken } },
    );
    const playerInfo = this._extractCustomM3u8Info(playerData);

    const serviceName = String(playerInfo.service_name || '').toLowerCase();
    const serviceId = String(playerInfo.service_id || '');

    let slideUrlTemplate = 'https://slides.slideslive.com/%s/slides/original/%s%s';
    const slidesInfo: Array<[number, string, string, number | undefined]> = [];

    let slidesJson = playerInfo.slides_json_url
      ? await this._download_json<Record<string, unknown>>(String(playerInfo.slides_json_url), videoId, undefined, {
          fatal: false,
        })
      : null;

    if (slidesJson) {
      let slideExtDefault = '.png';
      const slideQuality = traverse_obj(slidesJson, ['slide_qualities', 0]) as string | undefined;
      if (slideQuality) {
        slideExtDefault = '.jpg';
        slideUrlTemplate = `https://cdn.slideslive.com/data/presentations/%s/slides/${slideQuality}/%s%s`;
      }
      for (const [i, slide] of ((slidesJson.slides as Record<string, unknown>[]) || []).entries()) {
        slidesInfo.push([
          i + 1,
          String(traverse_obj(slide, ['image', 'name']) || ''),
          String(traverse_obj(slide, ['image', 'extname']) || slideExtDefault),
          int_or_none(slide.time, 1000) ?? undefined,
        ]);
      }
    }

    if (!slidesInfo.length && playerInfo.slides_xml_url) {
      const xml = await this._download_webpage(String(playerInfo.slides_xml_url), videoId, undefined, {
        fatal: false,
      });
      if (xml) {
        slideUrlTemplate = 'https://cdn.slideslive.com/data/presentations/%s/slides/big/%s%s';
        for (const [i, block] of [...xml.matchAll(/<slide>([\s\S]*?)<\/slide>/gi)].entries()) {
          const slide = block[1]!;
          slidesInfo.push([
            i + 1,
            this._search_regex(/<slideName>([^<]+)/, slide, 'name', null, false) || '',
            '.jpg',
            int_or_none(this._search_regex(/<timeSec>([^<]+)/, slide, 'time', null, false)) ?? undefined,
          ]);
        }
      }
    }

    const chapters: Chapter[] = [];
    const thumbnails: Thumbnail[] = [];
    if (url_or_none(playerInfo.thumbnail)) {
      thumbnails.push({ id: 'cover', url: String(playerInfo.thumbnail) });
    }
    for (const [slideId, slidePath, slideExt, startTime] of slidesInfo) {
      if (slidePath) {
        thumbnails.push({
          id: String(slideId).padStart(3, '0'),
          url: slideUrlTemplate.replace('%s', videoId).replace('%s', slidePath).replace('%s', slideExt),
        });
      }
      chapters.push({ title: `Slide ${String(slideId).padStart(3, '0')}`, start_time: startTime });
    }

    const subtitles: Record<string, Subtitle[]> = {};
    for (const sub of (playerInfo.subtitles as Record<string, unknown>[]) || []) {
      const webvttUrl = url_or_none(sub.webvtt_url);
      if (!webvttUrl) continue;
      const lang = String(sub.language || 'en');
      (subtitles[lang] ||= []).push({ url: webvttUrl, ext: 'vtt' });
    }

    const info: VideoInfo = {
      id: videoId,
      title: (playerInfo.title as string) || this._html_search_meta('title', webpage, null, false) || videoId,
      timestamp: unified_timestamp(playerInfo.timestamp) ?? undefined,
      is_live: playerInfo.playlist_type !== 'vod',
      thumbnails,
      chapters,
      subtitles,
    };

    if (serviceName === 'url') {
      info.url = serviceId;
    } else if (serviceName === 'yoda') {
      const servers = (playerInfo.video_servers as string[]) || [];
      const { formats, duration } = await this._extractFormatsAndDuration(servers[0]!, serviceId, videoId);
      info.formats = formats;
      info.duration = duration;
    } else {
      let targetUrl = serviceId;
      if (serviceName === 'vimeo') {
        targetUrl = smuggle_url(`https://player.vimeo.com/video/${serviceId}`, { referer: url });
      }
      return {
        ...info,
        _type: 'url_transparent',
        url: targetUrl,
        ie_key: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
        display_id: videoId,
      };
    }

    const videoSlides = ((slidesJson?.slides as Record<string, unknown>[]) || [])
      .map((s) => traverse_obj(s, ['video', 'id']))
      .filter(Boolean) as string[];
    if (!videoSlides.length) return info;

    const entries: VideoInfo[] = [info];
    const serviceData =
      (await this._download_json<Record<string, Record<string, unknown>>>(
        `https://slideslive.com/player/${videoId}/slides_video_service_data`,
        videoId,
        undefined,
        {
          fatal: false,
          query: { player_token: playerToken, videos: videoSlides.join(',') },
        },
      )) || {};

    for (const [i, slide] of ((slidesJson?.slides as Record<string, unknown>[]) || []).entries()) {
      if (traverse_obj(slide, ['video', 'service']) !== 'yoda') continue;
      const videoPath = String(traverse_obj(slide, ['video', 'id']) || '');
      const cdnHostname = traverse_obj(serviceData, [videoPath, 'video_servers', 0]) as string | undefined;
      if (!cdnHostname || !videoPath) continue;
      const { formats } = await this._extractFormatsAndDuration(cdnHostname, videoPath, videoId, true);
      if (!formats.length) continue;
      entries.push({
        id: `${videoId}-${String(i + 1).padStart(3, '0')}`,
        title: `${info.title} - Slide ${String(i + 1).padStart(3, '0')}`,
        timestamp: info.timestamp,
        duration: int_or_none(traverse_obj(slide, ['video', 'duration_ms']), 1000) ?? undefined,
        formats,
      });
    }

    return this.playlist_result(entries, `${videoId}-playlist`, info.title);
  }
}
