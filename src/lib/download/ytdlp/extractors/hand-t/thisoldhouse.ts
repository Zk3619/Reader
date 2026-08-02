/** ThisOldHouseIE — ported from yt-dlp thisoldhouse.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { filter_dict, parse_qs, smuggle_url, traverse_obj } from '../../utils';
import { hiddenInputs, urlencodePostdata } from './_helpers';

export class ThisOldHouseIE extends InfoExtractor {
  static _NETRC_MACHINE = 'thisoldhouse';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?thisoldhouse\.com\/(?:ask-this-old-house\/(?<id>season-\d+\/episode-\d+)|(?:watch|how-to|tv-episode|(?:[^/?#]+\/)?\d+)\/(?<id>[^/?#]+))/;

  protected async _performLogin(username: string, password: string): Promise<void> {
    const loginPage = await this._download_webpage(
      'https://www.thisoldhouse.com/insider-login',
      undefined,
      'Downloading login page',
    );
    const hidden = hiddenInputs(loginPage);
    const response = await this._download_json<Record<string, unknown>>(
      'https://www.thisoldhouse.com/wp-admin/admin-ajax.php',
      undefined,
      'Logging in',
      {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        method: 'POST',
        data: urlencodePostdata(
          filter_dict({
            action: 'onebill_subscriber_login',
            email: username,
            password,
            pricingPlanTerm: hidden.pricing_plan_term,
            utm_parameters: hidden.utm_parameters,
            nonce: hidden.mdcr_onebill_login_nonce,
          }) as Record<string, string | number | boolean>,
        ),
      },
    );

    const message = traverse_obj(response, ['data', 'message', String]) as string | undefined;
    if (!response.success) {
      if (message?.includes('Something went wrong')) {
        throw new ExtractorError('Invalid username or password', { expected: true });
      }
      throw new ExtractorError(message || 'Login was unsuccessful');
    }
    if (message?.includes('Your subscription is not active')) {
      this.report_warning(
        `${ThisOldHouseIE.IE_NAME} said your subscription is not active. ` +
          'If your subscription is active, this could be caused by too many sign-ins, ' +
          'and you should instead try using cookies',
      );
    } else {
      this.to_screen(`${ThisOldHouseIE.IE_NAME} said: ${message}`);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    if (webpage.includes('To Unlock This content')) {
      this.raise_login_required('This video is only available for subscribers');
    }

    const zypeMatch = webpage.match(
      /<iframe[^>]+src=["']((?:https?:)?\/\/(?:www\.)?thisoldhouse\.(?:chorus\.build|com)\/videos\/zype\/([0-9a-f]{24})[^"']*)["']/,
    );
    if (zypeMatch?.[1] && zypeMatch[2]) {
      let videoUrl = zypeMatch[1];
      const videoId = zypeMatch[2];
      const resolved = await this._request_webpage(videoUrl, videoId, 'Resolving Zype URL');
      if (resolved?.url) videoUrl = resolved.url;
      return this.url_result(videoUrl, 'Zype', videoId);
    }

    const bcMatch = webpage.match(
      /<iframe[^>]+src=["']((?:https?:)?\/\/(?:players\.brightcove\.net\/\d+\/\w+\/index\.html\?videoId=(\d+)|(?:www\.)thisoldhouse\.com\/videos\/brightcove\/(\d+)))["']/,
    );
    if (!bcMatch?.[1]) {
      throw new ExtractorError('Unable to find embedded video', { expected: true });
    }

    let videoUrl = bcMatch[1];
    const videoId = bcMatch[2] || bcMatch[3] || displayId;

    if (!parse_qs(videoUrl).videoId?.length) {
      const resolved = await this._request_webpage(videoUrl, videoId, 'Resolving Brightcove URL');
      if (resolved?.url) videoUrl = resolved.url;
    }

    return this.url_result(smuggle_url(videoUrl, { referrer: url }), 'BrightcoveNew', videoId);
  }
}
