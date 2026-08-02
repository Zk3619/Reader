/**
 * CamtasiaEmbedIE — ported from yt-dlp camtasia.py
 * Embed-only extractor (_VALID_URL=false, no generic-embed detection
 * pipeline in this runtime); `_extractFromWebpage` carries the real logic
 * for future integration, `_real_extract` is a stub per convention.
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none } from '../../utils';
import { urljoin } from './_helpers';

export class CamtasiaEmbedIE extends InfoExtractor {
  static IE_NAME = 'camtasiaembed';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('CamtasiaEmbedIE is not a standalone extractor', { expected: true });
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo | null> {
    const camtasiaCfgPath = this._search_regex(
      /fo\.addVariable\(\s*"csConfigFile",\s*"([^"]+)"\s*\)/,
      webpage,
      'camtasia configuration file',
      null,
      false,
    );
    if (camtasiaCfgPath == null) return null;

    const title = this._html_search_meta('DC.title', webpage, undefined, true)!;
    const camtasiaUrl = urljoin(url, camtasiaCfgPath);
    const cfgXml = await this._download_webpage(camtasiaUrl, undefined, 'Downloading camtasia configuration');

    const filesetMatch = /<fileset\b[^>]*>([\s\S]*?)<\/fileset>/i.exec(cfgXml);
    const filesetBody = filesetMatch?.[1] || '';
    const entries: VideoInfo[] = [];
    const childRe = /<(\w+)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let cm: RegExpExecArray | null;
    while ((cm = childRe.exec(filesetBody))) {
      const tag = cm[1]!;
      const body = cm[2]!;
      const uriMatch = /<uri>([^<]*)<\/uri>/i.exec(body);
      if (!uriMatch) continue;
      const uriText = uriMatch[1]!;
      const durationMatch = /<duration>([^<]*)<\/duration>/i.exec(body);
      const idBase = uriText.split('/').pop() || uriText;
      const id = idBase.replace(/\.[^.]+$/, '');
      entries.push({
        id,
        title: `${title} - ${tag}`,
        url: urljoin(url, uriText),
        duration: float_or_none(durationMatch?.[1]) ?? undefined,
      } as VideoInfo);
    }

    return { _type: 'playlist', id: title, title, entries } as VideoInfo;
  }
}
