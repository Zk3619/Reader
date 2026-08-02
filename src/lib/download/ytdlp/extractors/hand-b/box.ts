/**
 * BoxIE — aligned with yt-dlp box.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj, update_url_query, url_or_none } from '../../utils';

export class BoxIE extends InfoExtractor {
  static IE_NAME = 'box';
  static _VALID_URL =
    /https?:\/\/(?:[^.]+\.)?(?<service>app|ent)\.box\.com\/s\/(?<shared_name>[^/?#]+)(?:\/file\/(?<id>\d+))?/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const sharedName = m.groups?.shared_name ?? m[2] ?? '';
    let fileId = m.groups?.id ?? m[3] ?? '';
    const service = m.groups?.service ?? m[1] ?? 'app';

    const webpage = await this._download_webpage(url, fileId || sharedName);

    if (!fileId) {
      const postStreamData = this._search_json<Record<string, unknown>>(
        /Box\.postStreamData\s*=/,
        webpage,
        'Box post-stream data',
        sharedName,
      );
      const sharedItem =
        (traverse_obj(postStreamData, ['/app-api/enduserapp/shared-item']) as Record<string, unknown>) || {};
      if (sharedItem.itemType !== 'file') {
        throw new ExtractorError('The requested resource is not a file', { expected: true });
      }
      fileId = String(sharedItem.itemID);
    }

    const boxConfig = this._search_json<{ requestToken: string }>(
      /Box\.config\s*=/,
      webpage,
      'Box config',
      fileId,
    )!;
    const requestToken = boxConfig.requestToken;

    const tokenResp = await this._download_json<Record<string, { read: string }>>(
      `https://${service}.box.com/app-api/enduserapp/elements/tokens`,
      fileId,
      'Downloading token JSON metadata',
      {
        method: 'POST',
        data: JSON.stringify({ fileIDs: [fileId] }),
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Token': requestToken,
          'X-Box-EndUser-API': `sharedName=${sharedName}`,
        },
      },
    );
    const accessToken = tokenResp[fileId]?.read || '';
    const sharedLink = `https://${service}.box.com/s/${sharedName}`;

    const f = await this._download_json<Record<string, unknown>>(
      `https://api.box.com/2.0/files/${fileId}`,
      fileId,
      'Downloading file JSON metadata',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          BoxApi: `shared_link=${sharedLink}`,
          'X-Rep-Hints': '[dash]',
        },
        query: {
          fields:
            'authenticated_download_url,created_at,created_by,description,extension,is_download_available,name,representations,size',
        },
      },
    );
    const title = String(f.name || fileId);

    const query = { access_token: accessToken, shared_link: sharedLink };

    const entries =
      (traverse_obj(f, ['representations', 'entries'], { get_all: true }) as Record<string, unknown>[]) || [];
    const dashEntries = entries.filter((e) => e?.representation === 'dash');

    const formats: Format[] = [];
    for (const entry of dashEntries) {
      const urlTemplate = url_or_none(
        (entry.content as Record<string, unknown>)?.url_template,
      );
      if (!urlTemplate) continue;
      const manifestUrl = update_url_query(urlTemplate.replace('{+asset_path}', 'manifest.mpd'), query);
      const fmts = await this._extract_mpd_formats(manifestUrl, fileId);
      for (const fmt of fmts) {
        fmt.extra_param_to_segment_url = new URL(manifestUrl).search.replace(/^\?/, '');
      }
      formats.push(...fmts);
    }

    const creator = (f.created_by as Record<string, unknown>) || {};

    return {
      id: fileId,
      title,
      formats,
      description: (f.description as string) || null,
      uploader: (creator.name as string) || undefined,
      timestamp: f.created_at ? Math.trunc(Date.parse(String(f.created_at)) / 1000) : undefined,
      uploader_id: creator.id != null ? String(creator.id) : undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'box',
      extractor_key: 'Box',
    };
  }
}
