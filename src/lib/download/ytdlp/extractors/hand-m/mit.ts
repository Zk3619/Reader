/**
 * TechTVMITIE / OCWMITIE — ported from yt-dlp mit.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, get_element_by_id } from '../../utils';

function extractYoutubeId(url: string): string | null {
  const m =
    url.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/^([A-Za-z0-9_-]{11})$/);
  return m?.[1] ?? null;
}

export class TechTVMITIE extends InfoExtractor {
  static IE_NAME = 'techtv.mit.edu';
  static _VALID_URL = /https?:\/\/techtv\.mit\.edu\/(?:videos|embeds)\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const rawPage = await this._download_webpage(`http://techtv.mit.edu/videos/${videoId}`, videoId);
    const cleanPage = rawPage.replace(/<!--.*?-->/gs, '');

    const baseMatch = rawPage.match(/ipadUrl: '(.+?cloudfront.net\/)/);
    const baseUrl = baseMatch?.[1]?.startsWith('//')
      ? `http:${baseMatch[1]}`
      : baseMatch?.[1] || '';
    const formatsJson = this._search_regex(/bitrates: (\[.+?\])/, rawPage, 'video formats')!;
    const formatsMit = JSON.parse(formatsJson) as Array<Record<string, unknown>>;

    const formats: Format[] = formatsMit.map((f) => {
      const urlPart = String(f.url ?? '');
      const [ext, , path] = urlPart.split(':');
      return {
        format_id: String(f.label ?? 'http'),
        url: baseUrl + path,
        ext: ext || 'mp4',
        format: String(f.label ?? ''),
        width: f.width as number | undefined,
        vbr: f.bitrate as number | undefined,
      };
    });

    const title = get_element_by_id('edit-title', cleanPage) || undefined;
    const description = clean_html(get_element_by_id('edit-description', cleanPage) || '') || undefined;
    const thumbMatch = rawPage.match(/playlist:.*?url: '(.+?)'/s);
    const thumbnail = thumbMatch?.[1];

    return {
      id: videoId,
      title,
      formats,
      description,
      thumbnail,
    };
  }
}

export class OCWMITIE extends InfoExtractor {
  static IE_NAME = 'ocw.mit.edu';
  static _VALID_URL = /https?:\/\/ocw\.mit\.edu\/courses\/(?<topic>[a-z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const topic = this._match_valid_url(url)!.groups?.topic ?? '';
    const webpage = await this._download_webpage(url, topic);
    const title = this._html_search_meta('WT.cg_s', webpage) || undefined;
    const description = this._html_search_meta('Description', webpage) || undefined;

    let yt: string | null = null;
    const embedChapter = webpage.match(/ocw_embed_chapter_media\((.+?)\)/);
    if (embedChapter) {
      const metadata = embedChapter[1]!.replace(/['"]/g, '').split(/, ?/);
      yt = metadata[1] ?? null;
    } else {
      const embedMedia = webpage.match(/ocw_embed_media\((.+?)\)/);
      if (embedMedia) {
        const metadata = embedMedia[1]!.replace(/['"]/g, '').split(/, ?/);
        yt = metadata[1] ?? null;
      }
    }
    if (!yt) throw new ExtractorError('Unable to find embedded YouTube video.');
    const videoId = extractYoutubeId(yt);
    if (!videoId) throw new ExtractorError('Unable to parse YouTube video id.');

    return {
      _type: 'url_transparent',
      id: videoId,
      title,
      description,
      url: yt.startsWith('http') ? yt : `https://www.youtube.com/watch?v=${videoId}`,
      ie_key: 'Youtube',
    };
  }
}
