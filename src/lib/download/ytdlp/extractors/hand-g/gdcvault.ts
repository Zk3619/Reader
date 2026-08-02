/**
 * GDCVaultIE — ported from yt-dlp gdcvault.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { remove_start } from '../../utils';
import { parseHtml5MediaEntries } from './_helpers';

export class GDCVaultIE extends InfoExtractor {
  static IE_NAME = 'gdcvault';
  static _VALID_URL = /https?:\/\/(?:www\.)?gdcvault\.com\/play\/(?<id>\d+)(?:\/(?<name>[\w-]+))?/;
  static _NETRC_MACHINE = 'gdcvault';

  protected async _login(webpageUrl: string, _displayId: string): Promise<string | null> {
    this.report_warning(`It looks like ${webpageUrl} may require a login. Specify username/password via netrc if needed.`);
    return null;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.name || videoId;

    const webpageUrl = `http://www.gdcvault.com/play/${videoId}`;
    let startPage = await this._download_webpage(webpageUrl, displayId);

    const directUrl = this._search_regex(
      /s1\.addVariable\("file",\s*encodeURIComponent\("(\/[^"]+)"\)\);/,
      startPage,
      'url',
      null,
      false,
      1,
    );
    if (directUrl) {
      const title = this._html_search_regex(
        /<td><strong>Session Name:?<\/strong><\/td>\s*<td>(.*?)<\/td>/,
        startPage,
        'title',
      );
      const videoUrl = `http://www.gdcvault.com${directUrl}`;
      const headRes = await this._request_webpage(videoUrl, videoId, 'Checking video URL');
      return {
        id: videoId,
        display_id: displayId,
        url: headRes?.url || videoUrl,
        title: title ?? undefined,
      };
    }

    const kalturaUrl = this._search_regex(
      /src=(["'])(https?:[^"']*?\/(?:p|partner_id)\/\d+\/sp\/[^"']+)\1/,
      startPage,
      'kaltura embed',
      null,
      false,
      2,
    );
    if (kalturaUrl) {
      return this.url_result(kalturaUrl, 'Kaltura', videoId);
    }

    const playerRe = /<iframe src="(?<xml_root>.+?)\/(?:gdc-)?player.*?\.html.*?".*?<\/iframe>/;
    let xmlRoot = this._search_regex(playerRe, startPage, 'xml root', null, false, 'xml_root');
    if (!xmlRoot) {
      const loginRes = await this._login(webpageUrl, displayId);
      if (loginRes) {
        startPage = loginRes;
        xmlRoot = this._search_regex(playerRe, startPage, 'xml root', null, false, 'xml_root');
      } else {
        this.report_warning('Could not login.');
      }
    }

    if (xmlRoot) {
      const xmlName = this._search_regex(
        /<iframe src=".*?\?xml(?:=|URL=xml\/)(.+?\.xml).*?".*?<\/iframe>/,
        startPage,
        'xml filename',
        null,
        false,
        1,
      );
      if (!xmlName) {
        const mediaEntries = await parseHtml5MediaEntries(this, url, startPage, videoId);
        const info = mediaEntries[0] || { formats: [], subtitles: {} };
        const title =
          remove_start(
            this._search_regex(
              />Session Name:\s*<.*?>\s*<td>(.+?)<\/td>/,
              startPage,
              'title',
              null,
              false,
              1,
            ) || this._og_search_title(startPage) || '',
            'GDC Vault - ',
          ) || undefined;
        return { ...info, title, id: videoId, display_id: displayId };
      }
      return this.url_result(`${xmlRoot}/xml/${xmlName}`, 'DigitallySpeaking', videoId);
    }

    throw new Error('Unable to extract GDC Vault video');
  }
}
