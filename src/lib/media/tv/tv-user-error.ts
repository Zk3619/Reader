/**
 * 影视模块面向用户的错误文案 + Toast
 */

import type { ToastVariant } from '@/components/shared/AppToasts';
import { isAbortError } from '@/lib/http';
import { isAndroid } from '@/lib/platform/detect';

/** 引擎/反射/JAR 等技术性错误（不应当「软提示」静默展示） */
export function isTvTechnicalError(msg: string): boolean {
  const s = msg.trim();
  if (!s) return false;
  return (
    /JAR Spider|JAR 引擎|JAR 调用|NoSuchMethodError|NoSuchMethodException|ClassNotFoundException|ClassFormatError|NoClassDefFoundError|LinkageError|UnsatisfiedLinkError|NetworkOnMainThreadException|NullPointerException|IllegalStateException|JSONException|JSONArray|tv-jar-host|DexClassLoader|DexNative|原生加固|\.so\b|Spider 调用失败|引擎不可用|引擎启动超时|python rpc|加固库进程已退出|DeadObjectException|已暂时禁用该加固源/i.test(
      s,
    ) ||
    (/失败|超时|Exception|Error:/.test(s) &&
      /homeContent|categoryContent|detailContent|playerContent|searchContent|csp_|Spider|Invoke|invoke|Guard/i.test(
        s,
      ))
  );
}

/** 将引擎 / 网络原始错误转为可读中文 */
export function formatTvUserError(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim();
  if (!raw) return '操作失败，请稍后重试';

  // 站点超时：「站点「X」首页 超时（35s）」/ homeContent
  const siteTimeout = raw.match(/站点「([^」]+)」/);
  if (/超时/.test(raw) && siteTimeout) {
    // 饭太硬 fty 等 Guard 源在桌面常空等至超时
    if (/Guard|玩偶|点我切源|DexNative|加固/i.test(raw)) {
      return `站点「${siteTimeout[1]}」无响应；该配置多为 Android 加固源，桌面端无法运行，请换源`;
    }
    return `站点「${siteTimeout[1]}」响应超时，请稍后重试或更换源`;
  }
  if (/初始化影视引擎超时/.test(raw)) {
    return '影视引擎启动超时，请检查网络后重试';
  }
  if (/JAR 调用超时/.test(raw)) {
    if (/Guard|DexNative|加固/i.test(raw)) {
      return '站点引擎无响应；若为 Guard/加固源，桌面端无法运行，请换源或使用 Android';
    }
    return '站点引擎响应超时，请稍后重试';
  }
  if (/python rpc timeout/i.test(raw)) {
    return 'Python 引擎响应超时（首次可能在安装依赖，请稍后重试）';
  }
  if (/getAsString\(\).*null|JsonObject\.get\(String\).*null/i.test(raw)) {
    return '该源缺少 token/配置字段（盘搜等需在站点 ext 填写阿里 token）';
  }
  if (/No module named ['\"]Crypto['\"]|No module named ['\"]requests['\"]|No module named ['\"]pyquery['\"]/i.test(raw)) {
    return 'Python 依赖未就绪，请稍后重试（正在自动安装 pycryptodome/requests）';
  }
  // 必须先于泛化「network」匹配：Android 主线程联网会被收成「网络连接失败」
  if (/NetworkOnMainThreadException/i.test(raw)) {
    return '站点引擎在主线程发起了网络请求，请稍后重试';
  }
  if (
    /Failed to fetch|NetworkError when attempting to fetch|fetch failed|ERR_NETWORK|UnknownHostException|network security policy|CLEARTEXT communication|Network is unreachable/i.test(
      raw,
    )
  ) {
    return '网络连接失败，请检查网络或代理设置';
  }
  if (/下载 JAR 失败|下载 JAR HTTP|downloaded file is not a jar/i.test(raw)) {
    return '影视爬虫 JAR 下载失败，请检查网络或代理后重试';
  }
  if (/ECONNREFUSED|ENOTFOUND|ERR_CONNECTION/i.test(raw)) {
    return '无法连接服务器，请检查地址或网络';
  }
  if (/源不存在/.test(raw)) return '所选影视源不存在或已删除';
  if (/配置不存在/.test(raw)) return '配置不存在';
  if (/未加载配置|无可用来源/.test(raw)) {
    return '尚未加载可用影视源，请先在设置中导入配置';
  }
  if (/请先导入含 lives/.test(raw)) {
    return '请先导入含直播（lives）的配置，并在「直播使用」中选择源';
  }
  if (/壁纸文件为空|文件为空/.test(raw)) return '所选文件为空，请更换后重试';
  if (/无法解析影视配置/.test(raw)) return '无法解析配置内容，请确认是有效的 JSON';

  if (/影视 JAR 上次加载导致应用崩溃|已暂时禁用该加固源/.test(raw)) {
    return '该加固源上次导致应用崩溃，已暂时禁用。可在影视设置中重新尝试，或换用其它源';
  }

  if (/JSONArray text must start with|JSONException.*JSONArray/i.test(raw)) {
    return '站点返回的数据格式异常（豆瓣「猜你喜欢」需观看历史，可切换其它分类）';
  }
  // 具体异常必须先于「JAR Spider 调用失败」包装，否则加固/类加载失败会被收成笼统文案
  if (/加固库进程已退出|DexNative\/ftyguard|tvspider 进程|DeadObjectException/i.test(raw)) {
    return '加固爬虫（ftyguard）加载失败。请先到影视设置清理 JAR 缓存后重试；仍失败则该加密库无法在当前系统运行（常见于 Android 15 的 16KB 内存页），请换非 Guard 源';
  }
  if (/UnsatisfiedLinkError|ftyguard|DexNative|原生加固|\.so\b/i.test(raw)) {
    if (isAndroid()) {
      return '加固爬虫原生库加载失败，请清除影视 JAR 缓存后重试';
    }
    return '该影视源使用 Android 原生加固 JAR，桌面端无法运行；请换用非 Guard 源，或在 Android 版使用';
  }
  if (/NoSuchMethodError.*Init\.getSpider|Init\.getSpider/i.test(raw)) {
    return '站点引擎接口不兼容，请更新桌面 JAR 宿主或更换影视源';
  }
  if (/NoSuchMethodError|NoSuchMethodException/i.test(raw)) {
    return '站点引擎方法缺失，当前源可能与宿主不兼容';
  }
  if (/ClassNotFoundException|NoClassDefFoundError|ClassFormatError/i.test(raw)) {
    return '站点爬虫类加载失败，请检查 JAR 或更换源';
  }
  if (/NullPointerException/i.test(raw) && /JAR Spider|Guard|DexNative|Init/i.test(raw)) {
    return '站点爬虫初始化失败，请清除影视 JAR 缓存后重试';
  }
  if (/JAR Spider 调用失败|JAR 引擎不可用/.test(raw)) {
    const detail = raw
      .replace(/^JAR Spider 调用失败:\s*/i, '')
      .replace(/^JAR 引擎不可用:\s*/i, '')
      .trim();
    if (detail && detail !== raw) {
      const short = detail.length > 160 ? `${detail.slice(0, 160)}…` : detail;
      return `站点爬虫调用失败：${short}`;
    }
    return '站点爬虫调用失败，请稍后重试或更换影视源';
  }

  return raw
    .replace(/\bhomeContent\b/g, '首页')
    .replace(/\bcategoryContent\b/g, '分类列表')
    .replace(/\bdetailContent\b/g, '详情')
    .replace(/\bplayerContent\b/g, '播放地址')
    .replace(/\bsearchContent\b/g, '搜索')
    .replace(/超时（(\d+)s）/g, '超时（约 $1 秒）');
}

/**
 * 格式化错误、可选弹出 Toast，并返回供页内展示的文案。
 * 主动取消请求仅写入控制台警告，不派发 Toast；其余原始报错写入控制台错误。
 * @param toast 默认 true；空态/软提示可传 false
 */
export function reportTvError(
  title: string,
  err: unknown,
  opts?: { toast?: boolean; variant?: ToastVariant },
): string {
  if (isAbortError(err)) {
    console.warn(`[TV] ${title}`, err);
    return '';
  }

  const raw = err instanceof Error ? err.message : String(err ?? '');
  console.error(`[TV] ${title}`, err instanceof Error ? err : raw, err);
  const description = formatTvUserError(err);
  if (opts?.toast !== false) {
    void import('@/components/shared/AppToasts').then(({ showAppToast }) => {
      showAppToast({
        title,
        description,
        variant: opts?.variant ?? 'error',
      });
    });
  }
  return description;
}

/**
 * 处理引擎返回的 `result.msg`：技术错误 → Toast + 可读文案；普通提示 → 仅页内展示。
 */
export function reportTvResultMsg(title: string, msg: string): string {
  const soft = (msg ?? '').trim();
  if (!soft) return '';
  if (isTvTechnicalError(soft)) {
    return reportTvError(title, soft);
  }
  return formatTvUserError(soft);
}

/** 已是用户文案的软提示（不 Toast） */
export function tvSoftMessage(msg: string): string {
  return formatTvUserError(msg);
}
