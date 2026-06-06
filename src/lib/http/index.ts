/**
 * HTTP请求封装模块
 * 对应 legado 项目的 HttpHelper.kt 和 OkHttpUtils.kt
 * 
 * 设计原则：
 * 1. TypeScript主导 - 所有业务逻辑在TypeScript中实现
 * 2. 环境适配 - 自动检测Tauri环境，使用Tauri HTTP插件绕过CORS
 * 3. 统一接口 - 提供与原生fetch类似的API，便于使用
 * 4. 功能完整 - 支持Cookie、重试、并发控制、代理等
 */

import { invoke } from '@tauri-apps/api/core';
import {
  getJarCookie,
  mergeJarWithRequestCookie,
  saveResponseCookies,
} from '@/lib/http/cookie-jar';
import { createRateLimiter } from '@/lib/http/rate-limiter';
import {
  collapseUrlPathSlashes,
  sanitizeHttpHeaders,
  stripMisplacedCookieFromHttpUrl,
} from '@/lib/book-source/utils';
import { isTauri } from '@/lib/platform/detect';
import { toWebHttpProxyRequest } from '@/lib/http/web-http-proxy';
import { isAbortError, mergeAbortSignals, raceWithAbortSignal } from '@/lib/http/abort';
import { decodeBookSourceResponseBytes } from '@/lib/book-source/response-charset';

export { isAbortError } from '@/lib/http/abort';

async function bytesToHttpResponseText(
  data: ArrayBuffer | Uint8Array,
  contentEncoding?: string | null,
): Promise<string> {
  const raw = data instanceof Uint8Array ? data : new Uint8Array(data);
  return decodeBookSourceResponseBytes(raw, undefined, contentEncoding);
}

/**
 * 规范化 URL，确保跨平台兼容性
 * 处理 URL 编码、空格、特殊字符等问题
 */
function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('无效的 URL');
  }

  // 去除首尾空格
  let cleaned = url.trim();
  cleaned = stripMisplacedCookieFromHttpUrl(cleaned);

  if (/^(data:|blob:|javascript:|file:|about:|legado:|yuedu:)/i.test(cleaned)) {
    return cleaned;
  }

  // 已是 __reader_http：仅解析为绝对地址，避免 URLSearchParams 重写 target 查询串
  if (cleaned.includes('__reader_http')) {
    try {
      const base =
        typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/';
      return new URL(cleaned, base).href;
    } catch {
      return cleaned;
    }
  }

  // 同源代理路径（如 /__reader_http?target=…），勿补 https:// 以免变成 https://__reader_http
  if (cleaned.startsWith('/') && typeof window !== 'undefined') {
    try {
      return new URL(cleaned, window.location.href).toString();
    } catch {
      /* 继续走下方逻辑 */
    }
  }

  // 确保有协议
  if (!cleaned.match(/^https?:\/\//i)) {
    cleaned = 'https://' + cleaned;
  }

  try {
    // 使用 URL 构造函数进行规范化
    // URL 构造函数会自动处理编码和规范化
    const urlObj = new URL(cleaned);

    // URL 构造函数已经规范化了 URL，直接返回
    // 但我们需要确保查询参数也被正确编码
    if (urlObj.search) {
      // URLSearchParams 会自动处理查询参数的编码
      const params = new URLSearchParams(urlObj.search);
      // 重新构建 URL，使用规范化后的查询参数
      urlObj.search = params.toString();
    }

    return collapseUrlPathSlashes(urlObj.toString());
  } catch (error) {
    // 如果 URL 解析失败，尝试手动处理
    console.warn('[HTTP] URL 解析失败，尝试手动规范化:', error);

    try {
      // 分离协议、主机和路径部分
      const match = cleaned.match(/^(https?:\/\/)([^\/?#]+)(.*)$/);
      if (match) {
        const [, protocol, host, pathAndQuery] = match;

        // 分离路径和查询参数
        const [path, query] = pathAndQuery.split('?');

        // 规范化路径：对每个路径段进行编码
        const normalizedPath = path.split('/').map(segment => {
          if (!segment) return segment;
          try {
            // 尝试解码（避免双重编码）
            const decoded = decodeURIComponent(segment);
            // 重新编码
            return encodeURIComponent(decoded);
          } catch {
            // 如果解码失败，直接编码
            return encodeURIComponent(segment);
          }
        }).join('/');

        // 规范化查询参数
        let normalizedQuery = '';
        if (query) {
          const params = new URLSearchParams(query);
          normalizedQuery = '?' + params.toString();
        }

        return collapseUrlPathSlashes(protocol + host + normalizedPath + normalizedQuery);
      }
    } catch (e) {
      console.warn('[HTTP] URL 手动规范化也失败:', e);
    }

    // 最后的回退：返回清理后的 URL
    return collapseUrlPathSlashes(cleaned);
  }
}

// 检测是否可以使用 Tauri HTTP 插件
let canUseTauriHttp: boolean | null = null;
async function checkCanUseTauriHttp(): Promise<boolean> {
  if (canUseTauriHttp !== null) return canUseTauriHttp;

  // 首先检查是否在 Tauri 环境
  if (!isTauri()) {
    canUseTauriHttp = false;
    return false;
  }

  try {
    // 尝试导入 Tauri HTTP 插件
    await import('@tauri-apps/plugin-http');
    canUseTauriHttp = true;
    return true;
  } catch (error) {
    console.warn('[HTTP] Tauri HTTP 插件不可用，降级到原生 fetch:', error);
    canUseTauriHttp = false;
    return false;
  }
}

/**
 * 请求选项
 */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | FormData | ArrayBuffer;
  timeout?: number;
  retry?: number; // 重试次数，默认0
  retryDelay?: number; // 重试延迟（毫秒），默认1000
  followRedirects?: boolean; // 是否跟随重定向，默认true
  enableCookieJar?: boolean; // 是否启用Cookie管理，默认false
  concurrentRate?: string; // 并发速率限制，格式：10/1s 表示每秒10个请求
  /** 为 true 时 4xx/5xx 不抛错，仍返回 response，便于登录脚本 ajax 解析 body（如 code/msg） */
  allowNon2xx?: boolean;
  /** 外部取消（如探索页切换分类）；与 timeout 合并，用户取消时保留 AbortError */
  signal?: AbortSignal;
  /** 对齐 Legado ruleContent ajax：仅使用传入 headers（不加 Accept 等浏览器默认头） */
  legadoMinimalHeaders?: boolean;
}

/**
 * HTTP响应
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  url: string;
  ok: boolean;
  text: () => Promise<string>;
  json: <T>() => Promise<T>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * 请求错误
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public url: string,
    message?: string,
    /** 非 2xx 响应正文（用于区分真实 CF 挑战页与业务错误页） */
    public body?: string,
  ) {
    super(message || `HTTP ${status} ${statusText}`);
    this.name = 'HttpError';
  }
}

/** Tauri HTTP 插件按 fetch 规范会丢弃这些头，须走 download_binary */
const TAURI_FETCH_STRIPPED_HEADERS = new Set(['referer', 'cookie', 'origin']);

function requestNeedsDownloadBinary(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((k) =>
    TAURI_FETCH_STRIPPED_HEADERS.has(k.toLowerCase()),
  );
}

type DownloadBinaryResult = {
  data: number[];
  status: number;
  headers: Record<string, string>;
  url: string;
};

async function fetchViaDownloadBinary(
  normalizedUrl: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeout: number,
  useOkHttpUserAgent = false,
): Promise<Response> {
  const result = await invoke<DownloadBinaryResult>('download_binary', {
    url: normalizedUrl,
    method: method || 'GET',
    headers,
    body,
    timeoutMs: timeout,
    useOkhttpUserAgent: useOkHttpUserAgent,
  });

  const data = new Uint8Array(result.data);
  const safeHeaders = new Headers();
  Object.entries(result.headers).forEach(([key, value]) => {
    try {
      safeHeaders.set(key, value);
    } catch {
      const safeValue = value.replace(/[^\x00-\xFF]/g, '?');
      try {
        safeHeaders.set(key, safeValue);
      } catch {
        /* skip */
      }
    }
  });

  let cachedText: string | null = null;
  const cachedArrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );

  return {
    status: result.status,
    statusText: result.status >= 200 && result.status < 300 ? 'OK' : 'Error',
    ok: result.status >= 200 && result.status < 300,
    headers: safeHeaders,
    url: result.url,
    text: async () => {
      if (cachedText === null) {
        const ce =
          result.headers['content-encoding'] ?? result.headers['Content-Encoding'];
        cachedText = await bytesToHttpResponseText(cachedArrayBuffer, ce);
      }
      return cachedText;
    },
    json: async () => {
      if (cachedText === null) {
        const ce =
          result.headers['content-encoding'] ?? result.headers['Content-Encoding'];
        cachedText = await bytesToHttpResponseText(cachedArrayBuffer, ce);
      }
      return JSON.parse(cachedText);
    },
    arrayBuffer: async () => cachedArrayBuffer,
  } as Response;
}

/**
 * 执行HTTP请求（核心函数）
 */
async function executeRequest(
  url: string,
  options: RequestOptions = {}
): Promise<HttpResponse> {
  // 规范化 URL，确保跨平台兼容性
  const normalizedUrl = normalizeUrl(url);

  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    followRedirects = true,
    enableCookieJar = false,
    signal: userSignal,
    legadoMinimalHeaders = false,
  } = options;

  if (userSignal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const useTauriHttp = await checkCanUseTauriHttp();

  // 设置默认User-Agent
  // 注意：Connection 和 Keep-Alive 是 fetch 规范禁止的 headers，由 HTTP 客户端自动管理
  const defaultHeaders: Record<string, string> = legadoMinimalHeaders
    ? { ...headers }
    : {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        ...headers,
      };

  // CookieJar + 请求头 Cookie：对齐 Legado AnalyzeUrl.setCookie（CookieStore 先合并，header 同名覆盖）
  if (enableCookieJar) {
    const jarCookie = await getJarCookie(normalizedUrl);
    const headerCookie = String(defaultHeaders['Cookie'] ?? defaultHeaders['cookie'] ?? '').trim();
    delete defaultHeaders['cookie'];
    const merged = mergeJarWithRequestCookie(jarCookie, headerCookie);
    if (merged) defaultHeaders['Cookie'] = merged;
  }

  // 移除null字符串的header
  Object.keys(defaultHeaders).forEach(key => {
    if (defaultHeaders[key] === 'null') {
      delete defaultHeaders[key];
    }
  });

  if (legadoMinimalHeaders) {
    const cookie = String(
      defaultHeaders.Cookie ?? defaultHeaders.cookie ?? '',
    ).trim();
    const contentType = String(
      defaultHeaders['Content-Type'] ?? defaultHeaders['content-type'] ?? 'application/json',
    ).trim();
    for (const key of Object.keys(defaultHeaders)) {
      delete defaultHeaders[key];
    }
    defaultHeaders['content-type'] = contentType || 'application/json';
    if (cookie) defaultHeaders.cookie = cookie;
  }

  const safeHeaders = sanitizeHttpHeaders(defaultHeaders);
  for (const key of Object.keys(defaultHeaders)) {
    delete defaultHeaders[key];
  }
  Object.assign(defaultHeaders, safeHeaders);

  try {
    let response: Response;

    if (useTauriHttp) {
      const bodyForRust = typeof body === 'string' ? body : undefined;
      const useRustDirect = requestNeedsDownloadBinary(defaultHeaders);

      if (useRustDirect) {
        response = await raceWithAbortSignal(
          fetchViaDownloadBinary(
            normalizedUrl,
            method,
            defaultHeaders,
            bodyForRust,
            timeout,
            legadoMinimalHeaders,
          ),
          userSignal,
        );
      } else {
      // 使用 Tauri 环境
      // 优先使用 Tauri HTTP 插件，如果失败（如非 UTF-8 响应），回退到自定义 Rust 命令
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');

        const tauriOptions: any = {
          method,
          headers: defaultHeaders,
          connectTimeout: timeout,
          maxRedirections: followRedirects ? 10 : 0,
          // 信任所有证书：许多书源网站使用的证书不在 Mozilla CA 列表中（UnknownIssuer 错误）
          // 参考 legado 使用 SSLHelper.unsafeTrustManager 信任所有证书的做法
          // 统一配置：所有平台（桌面端和移动端）都信任所有证书，以兼容各种书源网站
          danger: {
            acceptInvalidCerts: true,
            acceptInvalidHostnames: true,
          },
        };

        if (body !== undefined && body !== null) {
          tauriOptions.body = body;
        }

        const tauriResponse = await raceWithAbortSignal(
          tauriFetch(normalizedUrl, tauriOptions),
          userSignal,
        );

        // 转换Tauri响应headers
        const responseHeaders = new Headers();
        if (tauriResponse.headers) {
          if (tauriResponse.headers instanceof Map) {
            tauriResponse.headers.forEach((value: string, key: string) => {
              responseHeaders.set(key, value);
            });
          } else if (typeof tauriResponse.headers === 'object') {
            Object.entries(tauriResponse.headers).forEach(([key, value]) => {
              responseHeaders.set(key, String(value));
            });
          }
        }

        // 优先获取二进制数据，避免 text() 的 UTF-8 解码问题
        let cachedText: string | null = null;
        let cachedArrayBuffer: ArrayBuffer | null = null;

        try {
          const tauriResponseAny = tauriResponse as any;
          if (typeof tauriResponseAny.bytes === 'function') {
            const bytes = await tauriResponseAny.bytes();
            if (bytes instanceof Uint8Array) {
              // 部分环境（如部分 WebView）无 SharedArrayBuffer，且 bytes.buffer 可能为 SharedArrayBuffer，统一用拷贝得到普通 ArrayBuffer
              const copy = bytes.slice(0);
              cachedArrayBuffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
            } else if (Array.isArray(bytes)) {
              cachedArrayBuffer = new Uint8Array(bytes).buffer;
            }
          }
        } catch (e) {
          console.warn('[HTTP] Tauri fetch bytes() 失败:', e);
        }

        // 创建 Response 对象
        response = {
          status: tauriResponse.status,
          statusText: tauriResponse.statusText || '',
          ok: tauriResponse.ok,
          headers: responseHeaders,
          url: tauriResponse.url || url,
          text: async () => {
            if (cachedText === null) {
              if (cachedArrayBuffer !== null) {
                cachedText = await bytesToHttpResponseText(
                  cachedArrayBuffer,
                  responseHeaders.get('content-encoding'),
                );
              } else {
                const ab = await tauriResponse.arrayBuffer();
                cachedText = await bytesToHttpResponseText(
                  ab,
                  responseHeaders.get('content-encoding'),
                );
              }
            }
            return cachedText;
          },
          json: async () => {
            if (cachedText === null) {
              if (cachedArrayBuffer !== null) {
                cachedText = await bytesToHttpResponseText(
                  cachedArrayBuffer,
                  responseHeaders.get('content-encoding'),
                );
              } else {
                const ab = await tauriResponse.arrayBuffer();
                cachedText = await bytesToHttpResponseText(
                  ab,
                  responseHeaders.get('content-encoding'),
                );
              }
            }
            return JSON.parse(cachedText);
          },
          arrayBuffer: async () => {
            if (cachedArrayBuffer !== null) {
              return cachedArrayBuffer;
            }
            // 回退：从 text 转换
            if (cachedText === null) {
              cachedText = await tauriResponse.text();
            }
            cachedArrayBuffer = new TextEncoder().encode(cachedText).buffer;
            return cachedArrayBuffer;
          },
        } as Response;
      } catch (tauriFetchError: any) {
        // Tauri HTTP 插件失败（如非 UTF-8 响应头/体、危险设置未启用等），回退到自定义 Rust 命令
        const errMsg = String(tauriFetchError?.message || tauriFetchError || '');
        const errorDetails = {
          message: errMsg,
          stack: tauriFetchError?.stack,
          name: tauriFetchError?.name,
          cause: tauriFetchError?.cause,
          url: normalizedUrl,
        };

        // 检查是否是连接错误，如果是，可能是 Android 网络配置问题
        const isConnectError = errMsg.toLowerCase().includes('connect') ||
          errMsg.toLowerCase().includes('error sending request');

        // 检查是否是危险设置未启用错误
        const isDangerousSettingsError = errMsg.toLowerCase().includes('dangerous settings');

        if (isDangerousSettingsError) {
          // 危险设置未启用是预期的回退情况，使用更低的日志级别
          console.debug(`[HTTP] Tauri HTTP 插件危险设置未启用，使用 download_binary 命令`);
        } else if (isConnectError) {
          console.warn(`[HTTP] Tauri HTTP 插件连接失败 (${errMsg})，尝试 download_binary 命令`, errorDetails);
        } else {
          console.warn(`[HTTP] Tauri HTTP 插件失败 (${errMsg})，回退到 download_binary 命令`, errorDetails);
        }

        try {
          if (!isDangerousSettingsError) {
            console.debug('[HTTP] 调用 download_binary，参数:', {
              url: normalizedUrl,
              method: method || 'GET',
              headers: defaultHeaders,
              timeoutMs: timeout,
              bodyLen: bodyForRust?.length ?? 0,
            });
          } else if (
            (method === 'POST' || method === 'PUT' || method === 'PATCH') &&
            bodyForRust &&
            bodyForRust.length > 0
          ) {
            console.warn(
              '[HTTP] Tauri HTTP 插件未启用危险设置，POST 经 download_binary 回退（已携带 body）',
              { url: normalizedUrl.slice(0, 80), bodyLen: bodyForRust.length }
            );
          }

          response = await raceWithAbortSignal(
            fetchViaDownloadBinary(
              normalizedUrl,
              method,
              defaultHeaders,
              bodyForRust,
              timeout,
              legadoMinimalHeaders,
            ),
            userSignal,
          );

          if (!isDangerousSettingsError) {
            console.debug('[HTTP] download_binary 成功，状态码:', response.status);
          }
        } catch (invokeError: any) {
          // Rust 命令也失败了，记录详细错误信息
          const invokeErrorMsg = String(invokeError?.message || invokeError || '');
          const invokeErrorDetails = {
            message: invokeErrorMsg,
            stack: invokeError?.stack,
            name: invokeError?.name,
            cause: invokeError?.cause,
            url: normalizedUrl,
            originalError: errMsg,
          };
          console.error('[HTTP] download_binary 命令也失败了:', invokeErrorDetails);

          // 抛出包含详细信息的错误
          throw new Error(`download_binary 失败: ${invokeErrorMsg} (原始错误: ${errMsg})`);
        }
      }
      }
    } else {
      // 浏览器环境：Cookie 为 forbidden 头，须走同源 __reader_http 代理（见 web-http-proxy.ts）
      const { signal, dispose } = mergeAbortSignals(timeout, userSignal);

      try {
        const proxied = toWebHttpProxyRequest(normalizedUrl, {
          method,
          headers: defaultHeaders,
          body: body as string | FormData | ArrayBuffer | undefined,
          redirect: followRedirects ? 'follow' : 'manual',
          signal,
        });

        if (proxied) {
          response = await fetch(proxied.url, { ...proxied.init, signal });
        } else {
          response = await fetch(normalizedUrl, {
            method,
            headers: defaultHeaders,
            body: body as BodyInit,
            redirect: followRedirects ? 'follow' : 'manual',
            signal,
          });
        }
      } finally {
        dispose();
      }
    }

    // 对齐 Legado CookieManager.saveResponse：含 403 在内的所有响应都写入 Set-Cookie
    if (enableCookieJar && response.headers) {
      await saveResponseCookies(normalizedUrl, response.headers);
    }

    // 转换响应为统一格式
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // 保存 useTauriHttp 的值，避免闭包问题
    const isTauriResponse = useTauriHttp;

    return {
      status: response.status,
      statusText: response.statusText || '',
      headers: responseHeaders,
      url: response.url || normalizedUrl,
      ok: response.ok,
      text: async () => {
        if (isTauriResponse) {
          return (response as any).text();
        }
        const ab = await response.arrayBuffer();
        return bytesToHttpResponseText(ab, response.headers.get('content-encoding'));
      },
      json: async <T = any>() => {
        if (isTauriResponse) {
          const jsonData = await (response as any).json();
          return jsonData as T;
        }
        const text = await bytesToHttpResponseText(
          await response.arrayBuffer(),
          response.headers.get('content-encoding'),
        );
        return JSON.parse(text) as T;
      },
      arrayBuffer: async () => {
        if (isTauriResponse) {
          return (response as any).arrayBuffer();
        }
        return response.arrayBuffer();
      },
    };
  } catch (error: any) {
    if (isAbortError(error)) {
      if (userSignal?.aborted) throw error;
      throw new HttpError(408, 'Request Timeout', normalizedUrl, '请求超时');
    }

    // 处理网络错误
    if (error instanceof HttpError) {
      throw error;
    }

    // 处理 Tauri HTTP 插件的错误
    // Tauri HTTP 插件可能抛出包含 "url not allowed" 或 "error sending request" 的错误
    const errorMessage = error.message || String(error) || '';
    const errorString = errorMessage.toLowerCase();

    if (errorString.includes('url not allowed') || errorString.includes('not allowed on the configured scope')) {
      console.error('[HTTP] URL 不在允许的作用域内:', {
        url: normalizedUrl,
        originalUrl: url,
        error: errorMessage,
        suggestion: '请检查 src-tauri/capabilities/default.json 中的 http:default 权限配置',
      });
      throw new HttpError(403, 'Forbidden', normalizedUrl, `URL 不在允许的作用域内: ${normalizedUrl}`);
    }

    if (errorString.includes('error sending request')) {
      console.error('[HTTP] 发送请求失败:', {
        url: normalizedUrl,
        originalUrl: url,
        error: errorMessage,
        stack: error.stack,
        suggestion: '可能是网络连接问题或服务器拒绝请求',
      });
      throw new HttpError(0, 'Network Error', normalizedUrl, `发送请求失败: ${errorMessage}`);
    }

    // 记录详细错误信息以便调试
    console.error('[HTTP] 请求失败:', {
      url: normalizedUrl,
      originalUrl: url,
      error: errorMessage,
      stack: error.stack,
      errorType: error.constructor?.name,
      errorKeys: Object.keys(error),
    });

    throw new HttpError(0, 'Network Error', normalizedUrl, errorMessage || '网络请求失败');
  }
}

/**
 * 带重试的HTTP请求
 */
async function requestWithRetry(
  url: string,
  options: RequestOptions = {}
): Promise<HttpResponse> {
  const { retry = 0, retryDelay = 1000 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      return await executeRequest(url, options);
    } catch (error) {
      lastError = error as Error;

      if (isAbortError(error)) {
        throw error;
      }

      // 如果是最后一次尝试，直接抛出错误
      if (attempt === retry) {
        throw error;
      }

      // 等待后重试
      if (retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError || new Error('请求失败');
}

/**
 * HTTP请求主函数
 */
export async function request(
  url: string,
  options: RequestOptions = {}
): Promise<HttpResponse> {
  // 处理并发速率限制
  if (options.concurrentRate) {
    const limiter = createRateLimiter(options.concurrentRate);
    await limiter.acquire();
  }

  // 执行请求（带重试）
  const response = await requestWithRetry(url, options);

  // 调试：登录/检测服务器时便于确认是 2xx 还是 4xx
  if (response.ok && (url.includes('login') || url.includes('login_api'))) {
    console.warn('[HTTP] 响应 OK', { status: response.status, url: url.slice(0, 55) });
  }
  if (!response.ok && response.status >= 400) {
    if (options.allowNon2xx) {
      console.warn('[HTTP] 响应非 2xx（allowNon2xx，返回 body）', {
        status: response.status,
        url: response.url?.slice(0, 60),
      });
      return response;
    }
    let rawBody = '';
    let bodyPreview = '';
    try {
      rawBody = await response.text();
      bodyPreview = rawBody.slice(0, 200).replace(/\s+/g, ' ');
      if (rawBody.length > 200) bodyPreview += '...';
    } catch {
      bodyPreview = '(无法读取)';
    }
    console.warn('[HTTP] 响应非 2xx', {
      status: response.status,
      url: response.url?.slice(0, 60),
      bodyPreview: bodyPreview.slice(0, 150),
    });
    throw new HttpError(
      response.status,
      response.statusText,
      response.url,
      `HTTP ${response.status}: ${response.statusText}`,
      rawBody || undefined,
    );
  }

  return response;
}

/**
 * GET请求
 */
export async function get(
  url: string,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<string> {
  const response = await request(url, { ...options, method: 'GET' });
  return response.text();
}

/**
 * POST请求
 */
export async function post(
  url: string,
  body: string | FormData,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<string> {
  const response = await request(url, { ...options, method: 'POST', body });
  return response.text();
}

/**
 * 获取JSON数据
 */
export async function getJson<T>(
  url: string,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<T> {
  const response = await request(url, { ...options, method: 'GET' });
  return response.json<T>();
}

/**
 * POST JSON数据
 */
export async function postJson<T>(
  url: string,
  data: any,
  options?: Omit<RequestOptions, 'method' | 'body'>
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };
  const response = await request(url, {
    ...options,
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return response.json<T>();
}

// HttpError 已在文件顶部定义并导出，无需重复导出
