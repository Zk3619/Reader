/** SenateGov family — ported from yt-dlp senategov.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { parse_qs, remove_end, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, make_archive_id } from './_helpers';

const COMMITTEES: Record<string, [string, string, string, string]> = {
  ag: ['76440', 'https://ag-f.akamaihd.net', '2036803', 'agriculture'],
  aging: ['76442', 'https://aging-f.akamaihd.net', '2036801', 'aging'],
  approps: ['76441', 'https://approps-f.akamaihd.net', '2036802', 'appropriations'],
  arch: ['', 'https://ussenate-f.akamaihd.net', '', 'arch'],
  armed: ['76445', 'https://armed-f.akamaihd.net', '2036800', 'armedservices'],
  banking: ['76446', 'https://banking-f.akamaihd.net', '2036799', 'banking'],
  budget: ['76447', 'https://budget-f.akamaihd.net', '2036798', 'budget'],
  commerce: ['80177', 'https://commerce1-f.akamaihd.net', '2036779', 'commerce'],
  energy: ['76448', 'https://energy-f.akamaihd.net', '2036797', 'energy'],
  epw: ['76478', 'https://epw-f.akamaihd.net', '2036783', 'environment'],
  finance: ['76450', 'https://finance-f.akamaihd.net', '2036795', 'finance_finance'],
  foreign: ['76451', 'https://foreign-f.akamaihd.net', '2036794', 'foreignrelations'],
  govtaff: ['76453', 'https://govtaff-f.akamaihd.net', '2036792', 'hsgac'],
  help: ['76452', 'https://help-f.akamaihd.net', '2036793', 'help'],
  indian: ['76455', 'https://indian-f.akamaihd.net', '2036791', 'indianaffairs'],
  intel: ['76456', 'https://intel-f.akamaihd.net', '2036790', 'intelligence'],
  judiciary: ['76459', 'https://judiciary-f.akamaihd.net', '2036788', 'judiciary'],
  rules: ['76460', 'https://rules-f.akamaihd.net', '2036787', 'rules'],
  smbiz: ['76461', 'https://smbiz-f.akamaihd.net', '2036786', 'smallbusiness'],
  vetaff: ['76462', 'https://vetaff-f.akamaihd.net', '2036785', 'veteransaffairs'],
};

const SUBDOMAIN_RE =
  'agriculture|aging|appropriations|armed-services|banking|budget|commerce|energy|epw|finance|foreign|help|intelligence|inaugural|judiciary|rules|sbc|veterans';

export class SenateISVPIE extends InfoExtractor {
  static IE_NAME = 'senate.gov:isvp';
  static _VALID_URL = /https?:\/\/(?:www\.)?senate\.gov\/isvp\/?\?(?<qs>.+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const qs = parse_qs(this._match_valid_url(url)!.groups!.qs!);
    const filename = qs.filename?.[qs.filename.length - 1];
    const committee = qs.comm?.[qs.comm.length - 1];
    if (!filename || !committee) throw new ExtractorError('Invalid URL', { expected: true });

    const videoId = remove_end(filename, '.mp4')!;
    const webpage = await this._download_webpage(url, videoId);
    const [streamNum, streamDomain, streamId, msl3] = COMMITTEES[committee]!;

    const urls = [
      `https://www-senate-gov-media-srs.akamaized.net/hls/live/${streamId}/${committee}/${filename}/master.m3u8`,
      `https://www-senate-gov-msl3archive.akamaized.net/${msl3}/${videoId}_1/master.m3u8`,
      `${streamDomain}/i/${filename}_1@${streamNum}/master.m3u8`,
      `${streamDomain}/i/${filename}.mp4/master.m3u8`,
    ];

    let formats: VideoInfo['formats'] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const videoUrl of urls) {
      const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls');
      if (res.formats.length) {
        formats = res.formats;
        subtitles = res.subtitles;
        break;
      }
    }

    return {
      id: videoId,
      title: webpage.match(/<title>([^<]+)/i)?.[1]?.trim() || 'ISVP',
      formats,
      subtitles,
      thumbnail: url_or_none(qs.poster?.[qs.poster.length - 1]) ?? undefined,
      _old_archive_ids: [make_archive_id('senate.gov', videoId)],
    };
  }
}

export class SenateGovIE extends InfoExtractor {
  static IE_NAME = 'senate.gov';
  static _VALID_URL = new RegExp(`https?:\\/\\/(?:www\\.)?(?:${SUBDOMAIN_RE})\\.senate\\.gov`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
    const webpage = await this._download_webpage(url, displayId);
    const isvpMatch = webpage.match(/https?:\/\/www\.senate\.gov\/isvp\/?\?[^"'<>]+/i);
    if (!isvpMatch) throw new ExtractorError(`Unsupported URL: ${url}`, { expected: true });

    const isvpUrl = isvpMatch[0]!;
    const isvp = new SenateISVPIE(this.get_downloader() ?? undefined);
    const urlInfo = await isvp._real_extract(isvpUrl);
    const titleRaw =
      this._html_search_regex(
        [/<meta\s+property="og:title"\s+content="([^"]+)"/i, /<title>([^<]*?)<\/title>/i],
        webpage,
        'video title',
        null,
        false,
      ) || displayId;

    return {
      ...urlInfo,
      _type: 'url_transparent',
      display_id: displayId,
      title: titleRaw.split('|')[0]!.replace(/\s+/g, ' ').trim(),
      description: this._og_search_description(webpage) || undefined,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      age_limit: 0,
    };
  }
}
