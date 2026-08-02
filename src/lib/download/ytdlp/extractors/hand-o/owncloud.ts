/** OwnCloudIE — ported from yt-dlp owncloud.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { determine_ext, url_or_none } from '../../utils';
import { hiddenInputs, urlencodePostdata } from './_helpers';

const INSTANCES_RE = String.raw`(?:[^.]+\.)?sciebo\.de|cloud\.uni-koblenz-landau\.de`;

export class OwnCloudIE extends InfoExtractor {
  static IE_NAME = 'owncloud';
  static _VALID_URL = new RegExp(String.raw`https?:\/\/(?:${INSTANCES_RE})\/s\/(?<id>[\w.-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let webpage = await this._download_webpage(url, videoId);

    if (/<label[^>]+for="password"/.test(webpage)) {
      webpage = await this._verifyVideoPassword(webpage, url, videoId);
    }

    const inputs = hiddenInputs(webpage);
    const title = inputs.filename;
    const parsedUrl = new URL(url);

    return {
      id: videoId,
      title,
      url:
        url_or_none(inputs.downloadURL) ||
        new URL('download', parsedUrl.href.endsWith('/') ? parsedUrl.href : `${parsedUrl.href}/`).href,
      ext: determine_ext(title) || undefined,
    };
  }

  protected async _verifyVideoPassword(webpage: string, pageUrl: string, videoId: string): Promise<string> {
    const password = (this.params as Record<string, unknown>).videopassword as string | undefined;
    if (password == null) {
      throw new ExtractorError(
        'This video is protected by a password, use the --video-password option',
        { expected: true },
      );
    }

    const validationResponse = (
      await this._request_webpage(
        {
          url: pageUrl,
          data: urlencodePostdata({
            requesttoken: hiddenInputs(webpage).requesttoken || '',
            password,
          }),
        },
        videoId,
        'Validating Password',
      )
    )!.text;

    if (/<label[^>]+for="password"/.test(validationResponse)) {
      const warning =
        this._search_regex(/<div[^>]+class="warning">([^<]*)<\/div>/, validationResponse, 'warning', null, false) ||
        'The password is wrong';
      throw new ExtractorError(`Opening the video failed, owncloud said: ${JSON.stringify(warning)}`, {
        expected: true,
      });
    }
    return validationResponse;
  }
}
