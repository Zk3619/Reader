/**
 * AdobePassIE — Adobe Pass MVPD auth base (yt-dlp adobepass.py)
 */

import { InfoExtractor, ExtractorError, NO_DEFAULT } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs, unescapeHTML } from '../../utils';

export type MsoInfo = {
  name: string;
  username_field?: string;
  password_field?: string;
  login_hostname?: string;
};

/** Major MSOs used by US TV site extractors (subset of upstream MSO_INFO) */
export const MSO_INFO: Record<string, MsoInfo> = {
  DTV: { name: 'DIRECTV', username_field: 'username', password_field: 'password' },
  ATT: { name: 'AT&T U-verse', username_field: 'userid', password_field: 'password' },
  ATTOTT: { name: 'DIRECTV NOW', username_field: 'email', password_field: 'loginpassword' },
  RCN: { name: 'RCN', username_field: 'username', password_field: 'password' },
  Rogers: { name: 'Rogers', username_field: 'UserName', password_field: 'UserPassword' },
  Comcast_SSO: {
    name: 'Comcast XFINITY',
    username_field: 'user',
    password_field: 'passwd',
    login_hostname: 'login.xfinity.com',
  },
  TWC: { name: 'Time Warner Cable | Spectrum', username_field: 'Ecom_User_ID', password_field: 'Ecom_Password' },
  Brighthouse: {
    name: 'Bright House Networks | Spectrum',
    username_field: 'j_username',
    password_field: 'j_password',
  },
  Charter_Direct: { name: 'Charter Spectrum', username_field: 'IDToken1', password_field: 'IDToken2' },
  Spectrum: { name: 'Spectrum', username_field: 'IDToken1', password_field: 'IDToken2' },
  Philo: { name: 'Philo', username_field: 'ident' },
  Verizon: {
    name: 'Verizon FiOS',
    username_field: 'IDToken1',
    password_field: 'IDToken2',
    login_hostname: 'ssoauth.verizon.com',
  },
  Fubo: { name: 'Fubo', username_field: 'username', password_field: 'password' },
  Cablevision: { name: 'Optimum/Cablevision', username_field: 'j_username', password_field: 'j_password' },
  slingtv: {
    name: 'Sling TV',
    username_field: 'username',
    password_field: 'password',
    login_hostname: 'identity.sling.com',
  },
  Suddenlink: { name: 'Suddenlink', username_field: 'username', password_field: 'password' },
  AlticeOne: { name: 'Optimum TV', username_field: 'j_username', password_field: 'j_password' },
};

type WebpageHandle = { text: string; url: string; headers: Record<string, string> };

type RequestorCache = {
  authn_token?: string;
  [guid: string]: string | undefined;
};

const mvpdCacheStore = new Map<string, RequestorCache>();

function urlencodePostdata(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}

function urlJoin(base: string, relative: string): string {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
}

function appendQuery(url: string, query: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

function xmlText(xmlStr: string, tag: string): string {
  const m = xmlStr.match(new RegExp(`<${tag}>(.+?)</${tag}>`, 's'));
  if (!m?.[1]) throw new ExtractorError(`Unable to extract ${tag} from MVPD XML`);
  return m[1];
}

function unifiedTimestampFromMvpd(dateStr: string): number | null {
  const normalized = dateStr.replace(/[_ ]GMT/g, '');
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

export class AdobePassIE extends InfoExtractor {
  static IE_NAME = 'adobepass';
  static _VALID_URL = false as const;
  static _SERVICE_PROVIDER_TEMPLATE = 'https://sp.auth.adobe.com/adobe-services/%s';
  static _USER_AGENT =
    'Mozilla/5.0 (X11; Linux i686; rv:47.0) Gecko/20100101 Firefox/47.0';
  static _MVPD_CACHE = 'ap-mvpd';
  static _DOWNLOADING_LOGIN_PAGE = 'Downloading Provider Login Page';

  /** Per-instance MVPD token storage (mirrors yt-dlp cache.store/load) */
  protected _mvpdInstanceCache = new Map<string, RequestorCache>();

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('AdobePassIE is not a standalone extractor', { expected: true });
  }

  static _getMsoHeaders(_msoInfo: MsoInfo): Record<string, string> {
    return {};
  }

  static _get_mvpd_resource(
    providerId: string,
    title: string,
    guid: string,
    rating: string,
  ): string {
    return (
      '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">' +
      '<channel>' +
      `<title>${providerId}</title>` +
      '<item>' +
      `<title>${title}</title>` +
      `<guid>${guid}</guid>` +
      `<media:rating scheme="urn:v-chip">${rating}</media:rating>` +
      '</item>' +
      '</channel>' +
      '</rss>'
    );
  }

  protected _cacheLoad(requestorId: string): RequestorCache {
    const globalKey = `${AdobePassIE._MVPD_CACHE}:${requestorId}`;
    return (
      this._mvpdInstanceCache.get(requestorId) ||
      mvpdCacheStore.get(globalKey) ||
      {}
    );
  }

  protected _cacheStore(requestorId: string, data: RequestorCache): void {
    const globalKey = `${AdobePassIE._MVPD_CACHE}:${requestorId}`;
    this._mvpdInstanceCache.set(requestorId, data);
    mvpdCacheStore.set(globalKey, data);
  }

  protected _getParam(name: string): unknown {
    const dashed = name.replace(/_/g, '-');
    return this.params[name] ?? this.params[dashed];
  }

  protected _get_login_info(
    usernameOpt: string,
    passwordOpt: string,
    _netrcMachine?: string,
  ): [string | null, string | null] {
    const u = this._getParam(usernameOpt);
    const p = this._getParam(passwordOpt);
    return [u != null && String(u).length ? String(u) : null, p != null && String(p).length ? String(p) : null];
  }

  protected _hidden_inputs(html: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
      const tag = m[0]!;
      if (!/type\s*=\s*["']?hidden["']?/i.test(tag)) continue;
      const name = /name\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      const value = /value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
      if (name) out[name] = unescapeHTML(value);
    }
    return out;
  }

  protected async _download_webpage_handle(
    url: string,
    videoId: string,
    note?: string,
    opts?: {
      query?: Record<string, string>;
      data?: string;
      headers?: Record<string, string>;
      method?: string;
    },
  ): Promise<WebpageHandle> {
    const headers = {
      ...this.geo_verification_headers(),
      ...(opts?.headers || {}),
    };
    let finalUrl = url;
    if (opts?.query) finalUrl = appendQuery(finalUrl, opts.query);
    if (note) this.to_screen(`${videoId}: ${note}`);
    const method = opts?.method || (opts?.data ? 'POST' : 'GET');
    const res = await this._fetchWithHeaders(finalUrl, { method, headers, body: opts?.data });
    return { text: res.text, url: res.url, headers: res.headers };
  }

  protected async _download_json_handle<T = unknown>(
    url: string,
    videoId: string,
    note?: string,
    opts?: {
      data?: string;
      headers?: Record<string, string>;
      query?: Record<string, string>;
    },
  ): Promise<{ data: T; headers: Record<string, string>; url: string }> {
    let finalUrl = url;
    if (opts?.query) finalUrl = appendQuery(finalUrl, opts.query);
    if (note) this.to_screen(`${videoId}: ${note}`);
    const headers = { ...(opts?.headers || {}) };
    const res = await this._fetchWithHeaders(finalUrl, {
      method: opts?.data ? 'POST' : 'GET',
      headers,
      body: opts?.data,
    });
    return { data: JSON.parse(res.text) as T, headers: res.headers, url: res.url };
  }

  private async _fetchWithHeaders(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ text: string; url: string; headers: Record<string, string> }> {
    const hdrs = await this._buildHeaders(url, init.headers);
    const method = init.method || 'GET';

    if (typeof fetch === 'function') {
      const res = await fetch(url, { method, headers: hdrs, body: init.body });
      if (!res.ok) throw new ExtractorError(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { text, url: res.url || url, headers };
    }

    const text = await this._httpGetText(url, hdrs, { method, body: init.body });
    return { text, url, headers: {} };
  }

  protected _extract_redirect_url(html: string, baseUrl?: string, fatal = false): string | null {
    const redirectRe = /[0-9]{,2};\s*(?:URL|url)=['"]?([^'"]+)/i;
    const m = html.match(
      new RegExp(
        `(?i)<meta\\s+(?=(?:[a-z-]+="[^"]+"\\s+)*http-equiv="refresh")(?:[a-z-]+="[^"]+"\\s+)*?content="${redirectRe.source}`,
      ),
    );
    if (!m?.[1]) {
      if (fatal) throw new ExtractorError('Unable to extract meta refresh redirect');
      return null;
    }
    let redirectUrl = unescapeHTML(m[1]);
    if (baseUrl) redirectUrl = urlJoin(baseUrl, redirectUrl);
    return redirectUrl;
  }

  /**
   * Adobe Pass MVPD auth — simplified but callable main flow.
   * Returns short-authorize XML (media token).
   */
  async _extract_mvpd_auth(
    url: string,
    videoId: string,
    requestorId: string,
    resource: string,
    softwareStatement: string,
  ): Promise<string> {
    const msoId = this._getParam('ap_mso') as string | undefined;
    const msoInfo: MsoInfo = msoId && MSO_INFO[msoId] ? MSO_INFO[msoId]! : { name: '' };

    const isExpired = (token: string, dateEle: string): boolean => {
      const tokenExpires = unifiedTimestampFromMvpd(xmlText(token, dateEle));
      return tokenExpires != null && tokenExpires <= Math.trunc(Date.now() / 1000);
    };

    const postForm = async (
      formPageRes: WebpageHandle,
      note: string,
      data: Record<string, string> = {},
      validateUrl = false,
    ): Promise<WebpageHandle> => {
      const formPage = formPageRes.text;
      const postUrlRaw = this._html_search_regex(
        /<form[^>]+action=(["'])(?<url>.+?)\1/i,
        formPage,
        'post url',
        NO_DEFAULT,
        true,
        'url',
      )!;
      let postUrl = postUrlRaw!;
      if (!/^https?:\/\//i.test(postUrl)) postUrl = urlJoin(formPageRes.url, postUrl);
      if (validateUrl) {
        const expectedHostname = msoInfo.login_hostname;
        let parsed: URL;
        try {
          parsed = new URL(postUrl);
        } catch {
          throw new ExtractorError(`Invalid login URL: ${postUrl}`);
        }
        if (expectedHostname && expectedHostname !== parsed.hostname) {
          throw new ExtractorError(
            `Unexpected login URL hostname; expected "${expectedHostname}" but got "${parsed.hostname}". Aborting before submitting credentials`,
          );
        }
        if (parsed.protocol !== 'https:') {
          this.to_screen('Upgrading login URL scheme to https');
          parsed.protocol = 'https:';
          postUrl = parsed.toString();
        }
      }
      const formData = { ...this._hidden_inputs(formPage), ...data };
      return this._download_webpage_handle(postUrl, videoId, note, {
        data: urlencodePostdata(formData),
        headers: {
          ...AdobePassIE._getMsoHeaders(msoInfo),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    };

    const raiseMvpdRequired = (): never => {
      throw new ExtractorError(
        'This video is only available for users of participating TV providers. ' +
          'Use --ap-mso to specify Adobe Pass Multiple-system operator Identifier ' +
          'and --ap-username and --ap-password or --netrc to provide account credentials.',
        { expected: true },
      );
    };

    const mvpdHeaders: Record<string, string> = {
      ap_42: 'anonymous',
      ap_11: 'Linux i686',
      ap_z: AdobePassIE._USER_AGENT,
      'User-Agent': AdobePassIE._USER_AGENT,
    };

    const guid = resource.includes('<') ? xmlText(resource, 'guid') : resource;

    for (let attempt = 0; attempt < 2; attempt++) {
      const requestorInfo = { ...this._cacheLoad(requestorId) };
      let authnToken = requestorInfo.authn_token;
      if (authnToken && isExpired(authnToken, 'simpleTokenExpires')) authnToken = undefined;

      if (!authnToken) {
        if (!msoId) raiseMvpdRequired();
        const resolvedMsoId = msoId as string;
        const [username, password] = this._get_login_info('ap_username', 'ap_password', resolvedMsoId);
        if (!username || !password) raiseMvpdRequired();
        const resolvedUsername = username as string;
        const resolvedPassword = password as string;

        const deviceHandle = await this._download_json_handle<{ deviceId: string }>(
          'https://sp.auth.adobe.com/indiv/devices',
          videoId,
          'Registering device with Adobe',
          {
            data: JSON.stringify({ fingerprint: crypto.randomUUID().replace(/-/g, '') }),
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          },
        );
        const deviceId = deviceHandle.data.deviceId;
        mvpdHeaders.pass_sfp = deviceHandle.headers.pass_sfp || deviceHandle.headers['pass_sfp'] || '';
        mvpdHeaders.Ap_21 = deviceId;

        const registration = await this._download_json<{
          client_id: string;
          client_secret: string;
        }>(
          'https://sp.auth.adobe.com/o/client/register',
          videoId,
          'Registering client with Adobe',
          {
            data: JSON.stringify({ software_statement: softwareStatement }),
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            method: 'POST',
          },
        );

        const tokenResp = await this._download_json<{ access_token: string }>(
          'https://sp.auth.adobe.com/o/client/token',
          videoId,
          'Obtaining access token',
          {
            data: urlencodePostdata({
              grant_type: 'client_credentials',
              client_id: registration.client_id,
              client_secret: registration.client_secret,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            method: 'POST',
          },
        );
        const accessToken = tokenResp.access_token;
        mvpdHeaders.Authorization = `Bearer ${accessToken}`;

        const regCodeResp = await this._download_json<{ code: string }>(
          `https://sp.auth.adobe.com/reggie/v1/${requestorId}/regcode`,
          videoId,
          'Obtaining registration code',
          {
            data: urlencodePostdata({
              requestor: requestorId,
              deviceId,
              format: 'json',
            }),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
            method: 'POST',
          },
        );
        const regCode = regCodeResp.code;

        let providerRedirectPageRes = await this._download_webpage_handle(
          AdobePassIE._SERVICE_PROVIDER_TEMPLATE.replace('%s', 'authenticate/saml'),
          videoId,
          'Downloading Provider Redirect Page',
          {
            query: {
              noflash: 'true',
              mso_id: resolvedMsoId,
              requestor_id: requestorId,
              no_iframe: 'false',
              domain_name: 'adobe.com',
              redirect_url: url,
              reg_code: regCode,
            },
            headers: AdobePassIE._getMsoHeaders(msoInfo),
          },
        );

        if (resolvedMsoId === 'Comcast_SSO') {
          await this._authComcast(
            providerRedirectPageRes,
            videoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
        } else if (resolvedMsoId === 'Philo') {
          throw new ExtractorError(
            'Philo Adobe Pass login requires an interactive auth code; not supported in Reader yet',
            { expected: true },
          );
        } else if (resolvedMsoId === 'Verizon') {
          await this._authVerizon(
            providerRedirectPageRes,
            videoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
        } else if (resolvedMsoId === 'Spectrum' || resolvedMsoId === 'Charter_Direct') {
          await this._authSpectrum(
            providerRedirectPageRes,
            videoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
        } else if (resolvedMsoId === 'Fubo') {
          await this._authFubo(
            providerRedirectPageRes,
            videoId,
            resolvedUsername,
            resolvedPassword,
          );
        } else if (resolvedMsoId === 'slingtv') {
          providerRedirectPageRes = await this._authSling(
            providerRedirectPageRes,
            videoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
          await postForm(providerRedirectPageRes, 'Confirming Login');
        } else if (resolvedMsoId === 'Suddenlink') {
          providerRedirectPageRes = await this._authSuddenlink(
            providerRedirectPageRes,
            videoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
          await postForm(providerRedirectPageRes, 'Confirming Login');
        } else {
          providerRedirectPageRes = await this._authGeneric(
            providerRedirectPageRes,
            videoId,
            resolvedMsoId,
            msoInfo,
            resolvedUsername,
            resolvedPassword,
            postForm,
          );
        }

        let session: string;
        try {
          session = await this._fetchWithHeaders(
            AdobePassIE._SERVICE_PROVIDER_TEMPLATE.replace('%s', 'session'),
            {
              method: 'POST',
              headers: {
                ...mvpdHeaders,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: urlencodePostdata({
                _method: 'GET',
                requestor_id: requestorId,
                reg_code: regCode,
              }),
            },
          ).then((r) => r.text);
        } catch (e) {
          if (!msoId) raiseMvpdRequired();
          throw e;
        }

        if (session.includes('<pendingLogout')) {
          this._cacheStore(requestorId, {});
          continue;
        }
        authnToken = unescapeHTML(xmlText(session, 'authnToken'));
        requestorInfo.authn_token = authnToken;
        this._cacheStore(requestorId, requestorInfo);
      }

      let authzToken = requestorInfo[guid];
      if (authzToken && isExpired(authzToken, 'simpleTokenTTL')) authzToken = undefined;

      if (!authzToken) {
        const authorize = await this._fetchWithHeaders(
          AdobePassIE._SERVICE_PROVIDER_TEMPLATE.replace('%s', 'authorize'),
          {
            method: 'POST',
            headers: {
              ...mvpdHeaders,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: urlencodePostdata({
              resource_id: resource,
              requestor_id: requestorId,
              authentication_token: authnToken!,
              mso_id: xmlText(authnToken!, 'simpleTokenMsoID'),
              userMeta: '1',
            }),
          },
        ).then((r) => r.text);

        if (authorize.includes('<pendingLogout')) {
          this._cacheStore(requestorId, {});
          continue;
        }
        if (authorize.includes('<error')) {
          throw new ExtractorError(xmlText(authorize, 'details'), { expected: true });
        }
        authzToken = unescapeHTML(xmlText(authorize, 'authzToken'));
        requestorInfo[guid] = authzToken;
        this._cacheStore(requestorId, requestorInfo);
      }

      mvpdHeaders.ap_19 = xmlText(authnToken!, 'simpleSamlNameID');
      mvpdHeaders.ap_23 = xmlText(authnToken!, 'simpleSamlSessionIndex');

      const shortAuthorize = await this._fetchWithHeaders(
        AdobePassIE._SERVICE_PROVIDER_TEMPLATE.replace('%s', 'shortAuthorize'),
        {
          method: 'POST',
          headers: {
            ...mvpdHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: urlencodePostdata({
            authz_token: authzToken!,
            requestor_id: requestorId,
            session_guid: xmlText(authnToken!, 'simpleTokenAuthenticationGuid'),
            hashed_guid: 'false',
          }),
        },
      ).then((r) => r.text);

      if (shortAuthorize.includes('<pendingLogout')) {
        this._cacheStore(requestorId, {});
        continue;
      }
      return shortAuthorize;
    }

    throw new ExtractorError('Adobe Pass authentication failed after retry', { expected: true });
  }

  private async _authComcast(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<void> {
    let page = providerRedirectPageRes.text;
    if (page.includes('automatically signing you in')) {
      const oauthRedirect = this._html_search_regex(
        /window\.location\s*=\s*['"]([^'"]+)/,
        page,
        'oauth redirect',
      )!;
      await this._download_webpage(oauthRedirect!, videoId, 'Confirming auto login');
      return;
    }
    if (page.includes('automatically signed in with')) {
      const oauthRedirect = this._html_search_regex(
        /continue:\s*"(https:\/\/oauth\.xfinity\.com\/oauth\/authorize\?.+)"/,
        page,
        'oauth redirect (signed)',
      )!;
      await this._download_webpage(oauthRedirect!, videoId, 'Confirming auto login');
      return;
    }

    let providerLoginPageRes = providerRedirectPageRes;
    if (!page.includes('<form name="signin"')) {
      if (page.includes('http-equiv="refresh"')) {
        const oauthRedirect = this._extract_redirect_url(page, providerRedirectPageRes.url, true)!;
        providerLoginPageRes = await this._download_webpage_handle(
          oauthRedirect,
          videoId,
          AdobePassIE._DOWNLOADING_LOGIN_PAGE,
          { headers: AdobePassIE._getMsoHeaders(msoInfo) },
        );
      } else {
        providerLoginPageRes = await postForm(providerRedirectPageRes, AdobePassIE._DOWNLOADING_LOGIN_PAGE);
      }
    }

    let mvpdConfirmPageRes = await postForm(
      providerLoginPageRes,
      'Logging in',
      {
        [msoInfo.username_field || 'user']: username,
        [msoInfo.password_field || 'passwd']: password,
      },
      true,
    );
    if (mvpdConfirmPageRes.text.includes('<button class="submit" value="Resume">Resume</button>')) {
      await postForm(mvpdConfirmPageRes, 'Confirming Login');
    }
  }

  private async _authVerizon(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<void> {
    const page = providerRedirectPageRes.text;
    if (page.includes('Please wait ...') && !page.includes("'N'== \"Y\"")) {
      const samlRedirect = this._html_search_regex(
        /self\.parent\.location=(["'])(?<url>.+?)\1/,
        page,
        'SAML Redirect URL',
        NO_DEFAULT,
        true,
        'url',
      )!;
      await this._download_webpage(samlRedirect!, videoId, 'Downloading SAML Login Page');
      return;
    }

    let samlLoginPage: string;
    if (page.includes('Verizon FiOS - sign in')) {
      const samlLoginPageRes = await postForm(
        providerRedirectPageRes,
        'Logging in',
        {
          [msoInfo.username_field || 'IDToken1']: username,
          [msoInfo.password_field || 'IDToken2']: password,
        },
        true,
      );
      samlLoginPage = samlLoginPageRes.text;
      if (samlLoginPage.includes('Please try again.')) {
        throw new ExtractorError(
          "We're sorry, but either the User ID or Password entered is not correct.",
          { expected: true },
        );
      }
    } else {
      let samlRedirect = this._html_search_regex(
        /var\surl\s*=\s*(["'])(?<url>.+?)\1/,
        page,
        'SAML Redirect URL',
        NO_DEFAULT,
        true,
        'url',
      )!;
      samlRedirect = samlRedirect!
        .replace(/\\\//g, '/')
        .replace(/\\-/g, '-')
        .replace(/\\x26/g, '&');
      const samlPage = await this._download_webpage(samlRedirect, videoId, 'Downloading SAML Login Page');
      const samlLoginPageRes = await postForm(
        { text: samlPage, url: samlRedirect, headers: {} },
        'Logging in',
        {
          [msoInfo.username_field || 'IDToken1']: username,
          [msoInfo.password_field || 'IDToken2']: password,
        },
        true,
      );
      samlLoginPage = samlLoginPageRes.text;
      if (samlLoginPage.includes('Please try again.')) {
        throw new ExtractorError('Failed to login, incorrect User ID or Password.', { expected: true });
      }
    }

    const samlLoginUrl = this._search_regex(
      /xmlHttp\.open\("POST"\s*,\s*(["'])(?<url>.+?)\1/,
      samlLoginPage,
      'SAML Login URL',
      NO_DEFAULT,
      true,
      'url',
    )!;
    const samlResponseJson = await this._download_json<{
      targetValue: string;
      SAMLResponse: string;
      RelayState: string;
    }>(samlLoginUrl!, videoId, 'Downloading SAML Response', {
      headers: { 'Content-Type': 'text/xml' },
      method: 'POST',
    });
    await this._fetchWithHeaders(samlResponseJson.targetValue, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: urlencodePostdata({
        SAMLResponse: samlResponseJson.SAMLResponse,
        RelayState: samlResponseJson.RelayState,
      }),
    });
  }

  private async _authSpectrum(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<void> {
    const providerLoginPageRes = await postForm(
      providerRedirectPageRes,
      AdobePassIE._DOWNLOADING_LOGIN_PAGE,
    );
    const samlLoginPage = providerLoginPageRes.text;
    const relayState = this._search_regex(
      /RelayState\s*=\s*"(?<relay>.+?)";/,
      samlLoginPage,
      'RelayState',
      NO_DEFAULT,
      true,
      'relay',
    )!;
    const samlRequest = this._search_regex(
      /SAMLRequest\s*=\s*"(?<saml_request>.+?)\";/,
      samlLoginPage,
      'SAMLRequest',
      NO_DEFAULT,
      true,
      'saml_request',
    )!;
    const samlResponseJson = await this._download_json<{
      SAMLRedirectUri: string;
      SAMLResponse: string;
    }>(
      'https://tveauthn.spectrum.net/tveauthentication/api/v1/manualAuth',
      videoId,
      'Downloading SAML Response',
      {
        data: JSON.stringify({
          [msoInfo.username_field || 'IDToken1']: username,
          [msoInfo.password_field || 'IDToken2']: password,
          RelayState: relayState,
          SAMLRequest: samlRequest,
        }),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        method: 'POST',
      },
    );
    await this._fetchWithHeaders(samlResponseJson.SAMLRedirectUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: urlencodePostdata({
        SAMLResponse: samlResponseJson.SAMLResponse,
        RelayState: relayState!,
      }),
    });
  }

  private async _authFubo(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    username: string,
    password: string,
  ): Promise<void> {
    const qs = parse_qs(providerRedirectPageRes.url);
    const flatQuery: Record<string, string> = {};
    for (const [k, vals] of Object.entries(qs)) flatQuery[k] = vals[0] || '';
    const fuboResponse = await this._download_json<{ code: string; state: string }>(
      'https://api.fubo.tv/partners/tve/connect',
      videoId,
      'Authenticating with Fubo',
      {
        query: flatQuery,
        data: JSON.stringify({ username, password }),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    await this._request_webpage(
      {
        url: 'https://sp.auth.adobe.com/adobe-services/oauth2',
        data: urlencodePostdata({ code: fuboResponse.code, state: fuboResponse.state }),
      },
      videoId,
      'Authenticating with Adobe',
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
  }

  private async _authSling(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<WebpageHandle> {
    const firstBookend = providerRedirectPageRes;
    const hiddenData = { ...this._hidden_inputs(firstBookend.text), history: '1' };
    const providerLoginPageRes = await this._download_webpage_handle(
      firstBookend.url,
      videoId,
      'Sending first bookend',
      { query: hiddenData },
    );
    const providerAssociationRedirect = await postForm(
      providerLoginPageRes,
      'Logging in',
      {
        [msoInfo.username_field || 'username']: username,
        [msoInfo.password_field || 'password']: password,
      },
      true,
    );
    const providerRefreshRedirectUrl = this._extract_redirect_url(
      providerAssociationRedirect.text,
      providerAssociationRedirect.url,
    );
    if (!providerRefreshRedirectUrl) {
      throw new ExtractorError('Unable to extract SlingTV auth redirect');
    }
    const lastBookend = await this._download_webpage_handle(
      providerRefreshRedirectUrl,
      videoId,
      'Downloading Auth Association Redirect Page',
    );
    const finalHidden = { ...this._hidden_inputs(lastBookend.text), history: '3' };
    return this._download_webpage_handle(lastBookend.url, videoId, 'Sending final bookend', {
      query: finalHidden,
    });
  }

  private async _authSuddenlink(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<WebpageHandle> {
    const firstBookend = await postForm(providerRedirectPageRes, 'Pressing Continue...');
    const hiddenData = { ...this._hidden_inputs(firstBookend.text), history_val: '1' };
    let providerLoginRedirectPageRes = await this._download_webpage_handle(
      firstBookend.url,
      videoId,
      'Sending First Bookend',
      { query: hiddenData },
    );
    let providerLoginPageRes = providerLoginRedirectPageRes;
    if (
      !providerLoginRedirectPageRes.text.includes('id="password" type="password" name="password"')
    ) {
      const providerTryauthUrl = this._html_search_regex(
        /url:\s*['"]([^'"]+)/,
        providerLoginRedirectPageRes.text,
        'ajaxurl',
      )!;
      const providerTryauthPage = await this._download_webpage(
        providerTryauthUrl!,
        videoId,
        'Submitting TryAuth',
        { query: hiddenData },
      );
      providerLoginPageRes = await this._download_webpage_handle(
        `https://authorize.suddenlink.net/saml/module.php/authSynacor/login.php?AuthState=${providerTryauthPage}`,
        videoId,
        'Getting Login Page',
        { query: hiddenData },
      );
    }
    const providerAssociationRedirect = await postForm(
      providerLoginPageRes,
      'Logging in',
      {
        [msoInfo.username_field || 'username']: username,
        [msoInfo.password_field || 'password']: password,
      },
      true,
    );
    const providerRefreshRedirectUrl = this._extract_redirect_url(
      providerAssociationRedirect.text,
      providerAssociationRedirect.url,
    );
    if (!providerRefreshRedirectUrl) {
      throw new ExtractorError('Unable to extract Suddenlink auth redirect');
    }
    const lastBookend = await this._download_webpage_handle(
      providerRefreshRedirectUrl,
      videoId,
      'Downloading Auth Association Redirect Page',
    );
    const finalHidden = { ...this._hidden_inputs(lastBookend.text), history_val: '3' };
    return this._download_webpage_handle(lastBookend.url, videoId, 'Sending Final Bookend', {
      query: finalHidden,
    });
  }

  private async _authGeneric(
    providerRedirectPageRes: WebpageHandle,
    videoId: string,
    msoId: string,
    msoInfo: MsoInfo,
    username: string,
    password: string,
    postForm: (
      res: WebpageHandle,
      note: string,
      data?: Record<string, string>,
      validateUrl?: boolean,
    ) => Promise<WebpageHandle>,
  ): Promise<WebpageHandle> {
    let redirectRes = providerRedirectPageRes;
    const refreshUrl = this._extract_redirect_url(redirectRes.text, redirectRes.url);
    if (refreshUrl) {
      redirectRes = await this._download_webpage_handle(
        refreshUrl,
        videoId,
        'Downloading Provider Redirect Page (meta refresh)',
      );
    }
    const providerLoginPageRes = await postForm(redirectRes, AdobePassIE._DOWNLOADING_LOGIN_PAGE);
    const formData: Record<string, string> = {
      [msoInfo.username_field || 'username']: username,
      [msoInfo.password_field || 'password']: password,
    };
    if (msoId === 'Cablevision' || msoId === 'AlticeOne') formData._eventId_proceed = '';
    const mvpdConfirmPageRes = await postForm(providerLoginPageRes, 'Logging in', formData, true);
    if (msoId !== 'Rogers') await postForm(mvpdConfirmPageRes, 'Confirming Login');
    return mvpdConfirmPageRes;
  }
}
