import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext } from '../../utils';
import { extractSmilMediaUrls, extractM3u8FormatsAndSubtitles } from './_helpers';

export class RestudyIE extends InfoExtractor {
  static IE_NAME = 'restudy';
  static _VALID_URL = /https?:\/\/(?:(?:www|portal)\.)?restudy\.dk\/video\/[^/]+\/id\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const title = (this._og_search_title(webpage) || '').trim();
    const description = (this._og_search_description(webpage) || '').trim();
    const smilUrl = `https://cdn.portal.restudy.dk/dynamic/themes/front/awsmedia/SmilDirectory/video_${videoId}.xml`;
    const smilXml = await this._download_webpage(smilUrl, videoId, 'Downloading SMIL');
    const formats: Format[] = [];
    for (const mediaUrl of extractSmilMediaUrls(smilXml)) {
      if (determine_ext(mediaUrl) === 'm3u8') {
        formats.push(...(await extractM3u8FormatsAndSubtitles(this, mediaUrl, videoId)).formats);
      } else {
        formats.push({ url: mediaUrl, format_id: determine_ext(mediaUrl) || 'http' });
      }
    }
    return { id: videoId, title, description, formats };
  }
}
