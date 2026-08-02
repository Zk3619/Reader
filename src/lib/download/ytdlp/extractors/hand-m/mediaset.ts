/** MediasetIE / MediasetShowIE — ported from yt-dlp mediaset.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { int_or_none, try_get, update_url_query } from '../../utils';
import { extractSmilMediaUrls, mergeSubtitles, urljoin } from './_helpers';

const GUID_RE = 'F[0-9A-Z]{15}';

export class MediasetIE extends InfoExtractor {
  static IE_NAME = 'mediaset';
  static _TP_TLD = 'eu';
  static _VALID_URL = new RegExp(
    String.raw`(?:mediaset:|https?:\/\/(?:\w+\.)+mediaset\.it\/(?:(?:video|on-demand|movie)\/(?:[^/]+\/)+[^/]+_|player\/(?:v\d+\/)?index\.html\?\S*?\bprogramGuid=))(?<id>${GUID_RE})`,
  );

  protected async _extractTheplatformSmil(
    smilUrl: string,
    videoId: string,
    note: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    this.to_screen(`${videoId}: ${note}`);
    const smil = await this._download_webpage(smilUrl, videoId, undefined, { fatal: false });
    if (!smil) return { formats: [], subtitles: {} };
    const formats: Format[] = [];
    for (let mediaUrl of extractSmilMediaUrls(smil)) {
      mediaUrl = mediaUrl.replace(/(https?:\/\/vod05)t(-mediaset-it\.akamaized\.net\/.+?\.mpd)\?.+/, '$1$2');
      if (mediaUrl.includes('.m3u8')) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            mediaUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          )),
        );
      } else if (mediaUrl.includes('.mpd')) {
        formats.push(...(await this._extract_mpd_formats(mediaUrl, videoId, 'dash', undefined, false)));
      } else {
        formats.push({ url: mediaUrl, format_id: 'http' });
      }
    }
    return { formats, subtitles: {} };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const guid = this._match_id(url);
    const tpPath = `PR1GhC/media/guid/2702976343/${guid}`;
    const info: VideoInfo = { id: guid, formats: [], subtitles: {} };
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    let firstError: Error | null = null;
    const assetType = 'geoNo:HD,browser,geoIT|geoNo:HD,geoIT|geoNo:SD,browser,geoIT|geoNo:SD,geoIT|geoNo|HD|SD';

    for (const f of ['MPEG4', 'MPEG-DASH', 'M3U']) {
      try {
        const smilUrl = update_url_query(`http://link.theplatform.${MediasetIE._TP_TLD}/s/${tpPath}`, {
          mbr: 'true',
          formats: f,
          assetTypes: assetType,
        });
        const extracted = await this._extractTheplatformSmil(smilUrl, guid, `Downloading ${f.split('+')[0]} SMIL data`);
        formats.push(...extracted.formats);
        mergeSubtitles(subtitles, extracted.subtitles);
      } catch (e) {
        if (!firstError) firstError = e as Error;
      }
    }
    if (firstError && !formats.length) throw firstError;

    const feedData = await this._download_json<Record<string, unknown>>(
      `https://feed.entertainment.tv.theplatform.eu/f/PR1GhC/mediaset-prod-all-programs-v2/guid/-/${guid}`,
      guid,
      undefined,
      { fatal: false },
    );
    if (feedData) {
      const publishInfo = (feedData['mediasetprogram$publishInfo'] as Record<string, unknown>) || {};
      const thumbnails = (feedData.thumbnails as Record<string, Record<string, unknown>>) || {};
      for (const [key, value] of Object.entries(thumbnails)) {
        if (key.startsWith('image_keyframe_poster-')) {
          info.thumbnail = value.url as string | undefined;
          break;
        }
      }
      info.description = (info.description || feedData.description || feedData.longDescription) as string | undefined;
      info.uploader = publishInfo.description as string | undefined;
      info.uploader_id = publishInfo.channel as string | undefined;
      info.view_count = int_or_none(feedData['mediasetprogram$numberOfViews']) ?? undefined;
      if (feedData.programType === 'episode') {
        info.episode_number = int_or_none(feedData.tvSeasonEpisodeNumber) ?? undefined;
        info.season_number = int_or_none(feedData.tvSeasonNumber) ?? undefined;
        info.series = feedData['mediasetprogram$brandTitle'] as string | undefined;
      }
    }

    return { ...info, formats, subtitles };
  }
}

export class MediasetShowIE extends InfoExtractor {
  static IE_NAME = 'mediaset:show';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)+mediaset\.it\/(?:fiction|programmi-tv|serie-tv|kids)\/(?:.+?\/)?(?:[a-z-]+)_SE(?<id>\d{12})(?:,ST(?<st>\d{12}))?(?:,sb(?<sb>\d{9}))?$/;
  static _PAGE_SIZE = 25;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const playlistId = m.groups!.id!;
    const st = m.groups!.st;
    const sb = m.groups!.sb;
    if (!sb) {
      const page = await this._download_webpage(url, st || playlistId);
      const entries = [...page.matchAll(/href="([^<>=]+SE\d{12},ST\d{12},sb\d{9})">[^<]+</g)].map((hit) =>
        this.url_result(urljoin('https://mediasetinfinity.mediaset.it', hit[1]!)),
      );
      const title = this._html_search_regex(/<title[^>]*>([^<]+)/, page, 'title', null, false)?.split('|')[0]?.trim();
      return this.playlist_result(entries, st || playlistId, title);
    }

    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      const lower = page * MediasetShowIE._PAGE_SIZE + 1;
      const upper = lower + MediasetShowIE._PAGE_SIZE - 1;
      const content = await this._download_json<Record<string, unknown>>(
        `https://feed.entertainment.tv.theplatform.eu/f/PR1GhC/mediaset-prod-all-programs-v2?byCustomValue={subBrandId}${sb}&sort=:publishInfo_lastPublished|desc,tvSeasonEpisodeNumber|desc&range=${lower}-${upper}`,
        sb,
      );
      const batch = ((content.entries as Array<Record<string, unknown>>) || []).map((entry) =>
        this.url_result(`mediaset:${entry.guid}`, 'Mediaset', String(entry.guid)),
      );
      if (!batch.length) break;
      entries.push(...batch);
      if (batch.length < MediasetShowIE._PAGE_SIZE) break;
    }
    return this.playlist_result(entries, sb, try_get(entries[0], (x) => (x as VideoInfo).title) as string | undefined);
  }
}
