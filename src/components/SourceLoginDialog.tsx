/**
 * 书源登录对话框（仅当 loginUi 且 loginUrl 非 http(s) 时使用）
 * 常规 http(s) 登录由 App 直接走 open-url 浏览器方案，不进入本弹窗。
 * 本弹窗：loginUi 为 JSON 表单 + loginUrl 为脚本时，渲染表单并执行登录脚本。
 */

import { createSignal, createMemo, createEffect, Show, For } from 'solid-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { showAppToast } from '@/components/AppToasts';
import {
  runLoginScript,
  runLoginScriptRust,
  getStoredLoginInfo,
  clearSourceLoginState,
  clearSourceLoginStateLocalStorageOnly,
} from '@/lib/js-engine';
import { isTauri } from '@/lib/platform/detect';
import JSON5 from 'json5';
import type { BookSource } from '@/types';

/** legado loginUi 表单项（与晴天聚合等书源格式一致） */
interface LoginUiItem {
  name?: string;
  type?: string;
  action?: string;
  style?: Record<string, unknown>;
}

/** 将书源 loginUi 的 style（如 layout_flexGrow、layout_flexBasisPercent）转为 CSS 样式对象，与 Legado 布局一致 */
function itemStyleToCss(
  style: Record<string, unknown> | undefined,
  /** 无 style 时是否占满一行（用于输入框默认单独成行） */
  defaultFullWidth?: boolean
): Record<string, string> {
  const css: Record<string, string> = {};
  if (defaultFullWidth) {
    css.flexBasis = '100%';
    css.minWidth = '0';
  }
  if (!style || typeof style !== 'object') return css;
  const grow = style.layout_flexGrow ?? style.layout_flexgrow;
  if (typeof grow === 'number') css.flexGrow = String(grow);
  const basis = style.layout_flexBasisPercent ?? style.layout_flexbasispercent;
  if (typeof basis === 'number') {
    css.flexBasis = basis <= 1 ? `${basis * 100}%` : `${basis}%`;
    css.flexShrink = '0';
  }
  return css;
}

/** 按钮项按百分比占位、不随内容撑开：固定宽度为 flexBasis 百分比 */
function buttonWrapperStyle(itemCss: Record<string, string>): Record<string, string> {
  const out = { ...itemCss };
  out.flexGrow = '0';
  const basis = out.flexBasis;
  if (basis) {
    out.width = basis;
    out.maxWidth = basis;
    out.minWidth = '0';
    out.boxSizing = 'border-box';
  }
  return out;
}

/** 是否为分区标题（无 action 的 button，或名称为「==…」「↓↓…」等分隔说明，与 Legado 一致渲染为整行文字） */
function isDividerLabel(item: LoginUiItem): boolean {
  if (item.type !== 'button') return false;
  const name = (item.name ?? '').trim();
  if (!name) return false;
  const action = (item.action ?? '').trim();
  if (!action) return true;
  return /^=+=/.test(name) || /^↓+↓/.test(name);
}

/** 符合 HTML 规范的 autocomplete 值（axe autocomplete-valid 白名单） */
const AUTOFILL_VALUES = ['off', 'username', 'email', 'current-password'] as const;
type AutocompleteValue = (typeof AUTOFILL_VALUES)[number];

/** 根据表单项类型与名称返回符合规范的 autocomplete 值（满足 axe autocomplete-valid） */
function getAutocomplete(item: LoginUiItem): AutocompleteValue {
  if (item.type === 'password') return 'current-password';
  const name = (item.name ?? '').toLowerCase();
  if (
    /username|用户名|账号|用户|account/.test(name) ||
    name === 'name'
  )
    return 'username';
  if (/email|邮箱|邮件|e-mail/.test(name)) return 'email';
  return 'off';
}

/** 取 item 的 layout_flexBasisPercent（0.4=40% 一行两个，1=100% 独占一行） */
function getBasisPercent(item: LoginUiItem): number {
  const style = item.style;
  if (!style || typeof style !== 'object') return 1;
  const v = style.layout_flexBasisPercent ?? style.layout_flexbasispercent;
  return typeof v === 'number' ? v : 1;
}

/**
 * 按 Legado 规则将表单项分成多行：输入/分区/100% 各占一行，40% 每行最多两个
 */
function groupItemsIntoRows(items: LoginUiItem[]): LoginUiItem[][] {
  const rows: LoginUiItem[][] = [];
  let currentRow: LoginUiItem[] = [];
  let rowSum = 0;

  for (const item of items) {
    const isInput = item.type !== 'button';
    const isDivider = isDividerLabel(item);
    const basis = isInput || isDivider ? 1 : getBasisPercent(item);

    if (basis >= 1 || isInput || isDivider) {
      if (currentRow.length) {
        rows.push(currentRow);
        currentRow = [];
        rowSum = 0;
      }
      rows.push([item]);
      continue;
    }
    if (rowSum + basis > 1 && currentRow.length) {
      rows.push(currentRow);
      currentRow = [];
      rowSum = 0;
    }
    currentRow.push(item);
    rowSum += basis;
  }
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

export interface SourceLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前要登录的书源（需配置 loginUrl 或 loginUi） */
  source: BookSource | null;
}

/**
 * 从书源对象中取 loginUi 字符串（兼容键名大小写，与 DB/导入一致）
 */
function getSourceLoginUi(source: BookSource | null): string | undefined {
  if (!source || typeof source !== 'object') return undefined;
  const s = source as Record<string, unknown>;
  if (s.loginUi != null && typeof s.loginUi === 'string') return s.loginUi.trim();
  if (s.loginui != null && typeof s.loginui === 'string') return s.loginui.trim();
  for (const [k, v] of Object.entries(s)) {
    if (k.toLowerCase() === 'loginui' && v != null && typeof v === 'string') return v.trim();
  }
  return undefined;
}

/**
 * 解析 loginUi（对齐 Legado 的 GSON.fromJsonArray(loginUi)）
 * 支持：标准 JSON 数组、JSON5（单引号等）、双重编码、换行差异
 */
function parseLoginUi(loginUi: string | unknown[] | undefined): LoginUiItem[] | null {
  if (loginUi == null) return null;
  if (Array.isArray(loginUi)) {
    return loginUi.length > 0 ? (loginUi as LoginUiItem[]) : null;
  }
  let s = String(loginUi).trim().replace(/^\uFEFF/, '');
  if (!s) return null;

  const tryParse = (raw: string): LoginUiItem[] | null => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as LoginUiItem[];
      return null;
    } catch {
      try {
        const parsed = JSON5.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed as LoginUiItem[];
      } catch {
        // ignore
      }
      return null;
    }
  };

  try {
    if (s.startsWith('"')) {
      const unescaped = JSON.parse(s) as unknown;
      if (typeof unescaped === 'string') s = unescaped.trim().replace(/^\uFEFF/, '');
    }
    let arr = tryParse(s);
    if (arr) return arr.length > 0 ? arr : null;
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    arr = tryParse(s);
    if (arr) return arr.length > 0 ? arr : null;
    const first = s.indexOf('[');
    const last = s.lastIndexOf(']');
    if (first !== -1 && last > first) {
      arr = tryParse(s.slice(first, last + 1));
      if (arr) return arr.length > 0 ? arr : null;
    }
    const noTrailingComma = s.replace(/,(\s*])/g, '$1');
    if (noTrailingComma !== s) arr = tryParse(noTrailingComma);
    if (arr) return arr.length > 0 ? arr : null;
    return null;
  } catch {
    return null;
  }
}

export function SourceLoginDialog(props: SourceLoginDialogProps) {
  const loginUiRaw = () => getSourceLoginUi(props.source);

  const loginUiItems = createMemo(() => parseLoginUi(loginUiRaw()));
  const loginUiRows = createMemo(() => {
    const items = loginUiItems();
    return items?.length ? groupItemsIntoRows(items) : [];
  });
  const hasFormUi = () => (loginUiItems()?.length ?? 0) > 0;

  /** 表单模式：有可解析的 loginUi 即显示表单；有 loginUrl 脚本时点击按钮会执行脚本 */
  const useFormMode = () => hasFormUi();

  const [formValues, setFormValues] = createSignal<Record<string, string>>({});

  createEffect(() => {
    if (!props.open) {
      setFormValues({});
      return;
    }
    // 打开对话框时从 localStorage 预填邮箱、密码等
    const source = props.source;
    if (source?.sourceUrl != null) {
      const stored = getStoredLoginInfo(source.sourceUrl);
      if (Object.keys(stored).length > 0) setFormValues(stored);
    }
  });

  const handleFormChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const [running, setRunning] = createSignal(false);

  const USE_RUST_ENGINE_KEY = 'reader_login_use_rust_engine';
  let initialRust = false;
  try {
    initialRust = isTauri() && localStorage.getItem(USE_RUST_ENGINE_KEY) === '1';
  } catch { /* ignore */ }
  const [useRustEngine, setUseRustEngine] = createSignal(initialRust);
  const setUseRustEngineAndStore = (v: boolean) => {
    setUseRustEngine(v);
    try {
      if (v) localStorage.setItem(USE_RUST_ENGINE_KEY, '1');
      else localStorage.removeItem(USE_RUST_ENGINE_KEY);
    } catch { /* ignore */ }
  };

  const handleFormButton = async (item: LoginUiItem) => {
    const source = props.source;
    const action = (item.action ?? '').trim();
    if (!source || !action) {
      showAppToast({ title: '登录', description: '未配置执行动作', variant: 'default' });
      return;
    }
    if (!source.loginUrl?.trim()) {
      showAppToast({ title: '无法执行', description: '该书源未配置登录脚本（loginUrl）', variant: 'destructive' });
      return;
    }
    setRunning(true);
    const onToast = (msg: string, long?: boolean) => {
      showAppToast({
        title: long ? '登录' : '',
        description: msg?.trim() || (long ? '' : '已执行'),
        variant: 'default',
      });
    };
    try {
      if (useRustEngine()) {
        const out = await runLoginScriptRust(source, { formValues: formValues(), action, onToast });
        if (out?.loginInfoJson) {
          try {
            const parsed = JSON.parse(out.loginInfoJson) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const next: Record<string, string> = { ...formValues() };
              for (const [k, v] of Object.entries(parsed)) {
                if (typeof k === 'string' && (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
                  next[k] = v == null ? '' : String(v);
                }
              }
              setFormValues(next);
            }
          } catch {
            // ignore parse
          }
        }
      } else {
        await runLoginScript(source, { formValues: formValues(), action, onToast });
        const stored = getStoredLoginInfo(source.sourceUrl ?? '');
        if (Object.keys(stored).length > 0) setFormValues(stored);
      }
      showAppToast({ title: '执行完成', description: `「${item.name ?? ''}」已执行`, variant: 'default' });
    } catch (e) {
      console.error('登录脚本执行失败:', e);
      showAppToast({
        title: '执行失败',
        description: e instanceof Error ? e.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  /** 退出登录：先同步清空 localStorage（与脚本同 key），再异步清 HTTP cookie，最后可选执行 logout() */
  const handleLogout = async () => {
    const source = props.source;
    if (!source) {
      showAppToast({ title: '退出登录', description: '未找到当前书源', variant: 'destructive' });
      return;
    }
    setRunning(true);
    // 先同步清除 localStorage，确保下次 runLoginScript 读不到旧 cookie（不依赖异步顺序）
    clearSourceLoginStateLocalStorageOnly(source);
    setFormValues({});
    try {
      await clearSourceLoginState(source);
      if (source.loginUrl?.trim()) {
        try {
          await runLoginScript(source, {
            formValues: formValues(),
            action: 'logout()',
            onToast: (msg) => showAppToast({ description: msg, variant: 'default' }),
          });
        } catch {
          /* 书源可能未定义 logout()，已清除本地即可 */
        }
      }
      showAppToast({ title: '已退出登录', description: '本地登录态已清除', variant: 'default' });
    } catch (e) {
      console.error('[login-dialog] handleLogout 异常', e);
      showAppToast({ title: '退出登录失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <DialogContent class="max-w-[80vw] sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader class="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle class="text-lg font-semibold">
            {props.source ? `${props.source.sourceName} · 登录` : '书源登录'}
          </DialogTitle>
          <DialogDescription class="sr-only">
            在弹窗内完成书源登录或填写登录表单
          </DialogDescription>
        </DialogHeader>

        {/* loginUi 为 JSON 表单（如晴天聚合），渲染表单并执行登录脚本 */}
        <Show when={useFormMode()}>
          <div class="flex flex-col gap-4 p-4">
            <p class="text-sm text-muted-foreground">
              该书源使用自定义登录表单，填写后点击按钮将在本机脚本环境中执行登录。
            </p>
            <Show when={isTauri()}>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRustEngine()}
                  onInput={(e) => setUseRustEngineAndStore(e.currentTarget.checked)}
                  class="rounded border-input"
                />
                <span>使用 Rust 引擎（java.ajax 真阻塞，解析耗时准确）</span>
              </label>
            </Show>
            <form
              class="flex flex-col gap-3"
              onSubmit={(e) => e.preventDefault()}
            >
              {/* 按行渲染（与 Legado 一致：输入/100%/分区独占一行，40% 每行两格） */}
              <For each={loginUiRows()}>
                {(row) => (
                  <div class="flex w-full items-end justify-between gap-2">
                    <For each={row}>
                      {(item) => {
                        const isInput = item.type !== 'button';
                        const isDivider = isDividerLabel(item);
                        const itemCss = itemStyleToCss(item.style, isInput || isDivider);
                        const hasLayout = Object.keys(itemCss).length > 0;
                        const singleInRow = row.length === 1;
                        const autocomplete = getAutocomplete(item);
                        const btnWrapCss =
                          !isInput && !isDivider && hasLayout && !singleInRow
                            ? buttonWrapperStyle(itemCss)
                            : undefined;
                        return (
                          <Show
                            when={item.type !== 'button'}
                            fallback={
                              <Show
                                when={!isDivider}
                                fallback={
                                  <div class="w-full py-1.5 text-center text-xs text-muted-foreground">
                                    {item.name}
                                  </div>
                                }
                              >
                                <div
                                  classList={{
                                    'min-w-0 flex justify-center': true,
                                    'w-full': singleInRow && !isDivider,
                                  }}
                                  style={btnWrapCss}
                                >
                                  <Button
                                    type="button"
                                    variant={item.name?.includes('登录') ? 'default' : 'outline'}
                                    size="sm"
                                    disabled={running()}
                                    onClick={() => handleFormButton(item)}
                                    class="w-full justify-center"
                                  >
                                    {item.name}
                                  </Button>
                                </div>
                              </Show>
                            }
                          >
                            <div
                              class="flex min-w-0 flex-1 flex-col gap-1"
                              style={hasLayout ? itemCss : undefined}
                            >
                              <label class="text-sm font-medium text-foreground">
                                {item.name}
                              </label>
                              <input
                                type={
                                  item.type === 'password'
                                    ? 'password'
                                    : autocomplete === 'email'
                                      ? 'email'
                                      : 'text'
                                }
                                name={item.name}
                                placeholder={item.name}
                                value={formValues()[item.name ?? ''] ?? ''}
                                onInput={(e) =>
                                  handleFormChange(item.name ?? '', e.currentTarget.value)
                                }
                                class="h-9 min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                {...(autocomplete !== 'off' && { autocomplete })}
                              />
                            </div>
                          </Show>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
              {/* 退出登录：清除本地 cookie/登录信息，并可选执行书源 logout() */}
              <div class="mt-2 flex justify-end border-t border-border pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={running()}
                  onClick={handleLogout}
                  class="text-muted-foreground hover:text-destructive"
                >
                  退出登录
                </Button>
              </div>
            </form>
          </div>
        </Show>

        {/* 有书源但无表单模式时提示（与 Legado 一致：loginUi 为 JSON 数组方可解析） */}
        <Show when={props.source && !useFormMode()}>
          <div class="p-4 text-sm text-muted-foreground space-y-2">
            <p>
              该书源已配置登录，但未解析到登录表单。与 Legado 对齐：loginUi 须为 JSON 数组字符串（如晴天聚合书源格式）。
            </p>
            <p class="text-xs text-muted-foreground/80">
              排查：该书源 loginUi 长度 = {getSourceLoginUi(props.source)?.length ?? 0}（0 表示未传入或未正确保存，可删除该书源后重新从 JSON 文件导入一次）。
            </p>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
