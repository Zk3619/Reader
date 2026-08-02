/** RuutuIE — ported from yt-dlp ruutu.py (main path) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, unified_strdate } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class RuutuIE extends InfoExtractor {
  static IE_NAME = 'Ruutu';
  static _VALID_URL =
    /https?:\/\/(?:(?:www\.)?(?:ruutu|supla)\.fi\/(?:video|supla|audio)\/|static\.nelonenmedia\.fi\/player\/misc\/embed_player\.html\?[\s\S]*?\bnid=)(?<id>\d+)/;
  static _API_BASE = 'https://gatling.nelonenmedia.fi';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoXml = await this._download_webpage(`${RuutuIE._API_BASE}/media-xml-cache?id=${videoId}`, videoId, 'Downloading media XML');
    const xml = videoXml;
    const formats: Format[] = [];
    const processed = new Set<string>();

    for (const m of xml.matchAll(/<(?:[^:>]+:)?(?:File|AudioMediaFile|HTTPMediaFile)[^>]*>([^<]+)<\//g)) {
      let videoUrl = m[1]!.trim();
      if (!videoUrl || processed.has(videoUrl) || /NOT[-_]USED/i.test(videoUrl)) continue;
      processed.add(videoUrl);
      const ext = determine_ext(videoUrl);
      const authUrl = await this._download_webpage(
        `${RuutuIE._API_BASE}/auth/access/v2`,
        videoId,
        `Downloading authenticated ${ext} stream URL`,
        { fatal: false, query: { stream: videoUrl } },
      );
      if (authUrl && !processed.has(authUrl)) {
        processed.add(authUrl);
        videoUrl = authUrl;
      }
      if (determine_ext(videoUrl) === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls')).formats);
      } else if (ext === 'mp3' || m[0]!.includes('AudioMediaFile')) {
        formats.push({ format_id: 'audio', url: videoUrl, vcodec: 'none', ext: 'mp3' });
      } else if (/^https?:\/\//i.test(videoUrl)) {
        formats.push({ format_id: determine_ext(videoUrl) || 'http', url: videoUrl });
      }
    }

    const pv = (name: string): string | undefined => {
      const m = xml.match(new RegExp(`<variable[^>]+name="${name}"[^>]+value="([^"]+)"`));
      const val = m?.[1];
      return val && val !== 'NA' ? val : undefined;
    };
    if (!formats.length) {
      if (/<Clip>[\s\S]*<DRM>/.test(xml)) this.report_warning('This video is probably DRM protected.');
      const cds = pv('ns_st_cds');
      if (cds && cds !== 'free') throw new ExtractorError(`This video is ${cds}.`, { expected: true });
    }
    const themes = pv('themes');
    const titleM = xml.match(/program_name="([^"]+)"/);
    return {
      id: videoId,
      title: titleM?.[1] || videoId,
      description: xml.match(/description="([^"]+)"/)?.[1],
      thumbnail: xml.match(/href="([^"]+)"[^>]*thumbnail/)?.[1],
      duration: int_or_none(xml.match(/<Runtime[^>]*>(\d+)/)?.[1]) ?? int_or_none(pv('runtime')) ?? undefined,
      age_limit: int_or_none(xml.match(/<AgeLimit[^>]*>(\d+)/)?.[1]) ?? undefined,
      upload_date: unified_strdate(pv('date_start')) ?? undefined,
      series: pv('series_name'),
      season_number: int_or_none(pv('season_number')) ?? undefined,
      episode_number: int_or_none(pv('episode_number')) ?? undefined,
      categories: themes ? themes.split(',') : undefined,
      formats,
    };
  }
}
