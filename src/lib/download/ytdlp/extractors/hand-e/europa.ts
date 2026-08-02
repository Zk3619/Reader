/**
 * Europa (EU institutions) — ported from yt-dlp europa.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, parse_duration, parse_qs, unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles, orderedSet, parseIso8601, searchNextjsData, xmlTagText } from './_helpers';

function languagePreference(order: string[]): (lang: string | null | undefined) => number {
  const map = new Map(order.map((l, i) => [l, i]));
  return (lang) => map.get(lang || '') ?? -1;
}

export class EuropaIE extends InfoExtractor {
  static IE_NAME = 'europa';
  static _VALID_URL =
    /https?:\/\/ec\.europa\.eu\/avservices\/(?:video\/player|audio\/audioDetails)\.cfm\?.*?\bref=(?<id>[A-Za-z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const playlist = await this._download_webpage(
      `http://ec.europa.eu/avservices/video/player/playlist.cfm?ID=${videoId}`,
      videoId,
    );

    const getItem = (type: string, preference: string[]): string | null => {
      const items: Record<string, string> = {};
      const re = new RegExp(`<${type}>\\s*([\\s\\S]*?)\\s*<\\/${type}>`, 'gi');
      for (const block of playlist.match(re) || []) {
        const lang = xmlTagText(block, 'lg');
        const label = xmlTagText(block, 'label');
        if (lang && label) items[lang] = label.trim();
      }
      for (const p of preference) {
        if (items[p]) return items[p]!;
      }
      return null;
    };

    const qs = parse_qs(url);
    const preferredLang = qs.sitelang?.[0] || 'en';
    const preferredLangs = orderedSet([preferredLang, 'en', 'int']);
    const langPref = languagePreference([...preferredLangs].reverse());

    const title = getItem('title', preferredLangs) || videoId;
    const description = getItem('description', preferredLangs) || undefined;
    const thumbnail = xmlTagText(playlist, 'thumburl') || undefined;
    const uploadDate = unified_strdate(xmlTagText(playlist, 'date')) ?? undefined;
    const duration = parse_duration(xmlTagText(playlist, 'duration')) ?? undefined;
    const viewCount = int_or_none(xmlTagText(playlist, 'views')) ?? undefined;

    const formats: Format[] = [];
    for (const fileBlock of playlist.match(/<file>[\s\S]*?<\/file>/gi) || []) {
      const videoUrl = xmlTagText(fileBlock, 'url');
      if (!videoUrl) continue;
      const lang = xmlTagText(fileBlock, 'lg');
      formats.push({
        url: videoUrl,
        format_id: lang || '0',
        format_note: xmlTagText(fileBlock, 'lglabel') || undefined,
        language_preference: langPref(lang),
      });
    }

    return {
      id: videoId,
      title,
      description,
      thumbnail,
      upload_date: uploadDate,
      duration,
      view_count: viewCount,
      formats,
    };
  }
}

export class EuroParlWebstreamIE extends InfoExtractor {
  static IE_NAME = 'europarlwebstream';
  static _VALID_URL =
    /https?:\/\/multimedia\.europarl\.europa\.eu\/(?:\w+\/)?webstreaming\/(?:[\w-]+_)?(?<id>[\w-]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const webpageNextjs = searchNextjsData(this, webpage, displayId);
    const pageProps = (webpageNextjs.pageProps as Record<string, unknown>) || {};

    const jsonInfo = await this._download_json<Record<string, unknown>>(
      'https://acs-api.europarl.connectedviews.eu/api/FullMeeting',
      displayId,
      undefined,
      {
        query: {
          'api-version': '1.0',
          tenantId: 'bae646ca-1fc8-4363-80ba-2c04f06b4968',
          externalReference: displayId,
        },
      },
    );

    const formats: Format[] = [];
    const subtitles: Record<string, import('../../types').Subtitle[]> = {};
    const hlsCandidates: string[] = [];
    const meetingVideo = jsonInfo.meetingVideo as Record<string, unknown> | undefined;
    if (meetingVideo?.hlsUrl) hlsCandidates.push(String(meetingVideo.hlsUrl));
    const meetingVideos = (jsonInfo.meetingVideos as Record<string, unknown>[]) || [];
    for (const mv of meetingVideos) {
      if (mv?.hlsUrl) hlsCandidates.push(String(mv.hlsUrl));
    }
    for (const hlsUrl of hlsCandidates) {
      const res = await extractM3u8FormatsAndSubtitles(this, hlsUrl, displayId);
      formats.push(...res.formats);
      Object.assign(subtitles, res.subtitles);
    }

    const mediaItem = pageProps.mediaItem as Record<string, unknown> | undefined;
    const title =
      (mediaItem?.title as string) || (pageProps.title as string) || displayId;

    return {
      id: String(jsonInfo.id ?? displayId),
      display_id: displayId,
      title,
      formats,
      subtitles,
      release_timestamp: parseIso8601(jsonInfo.startDateTime) ?? undefined,
      is_live: mediaItem?.mediaSubType === 'Live' ? true : undefined,
    };
  }
}
