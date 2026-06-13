import { For, Show, createSignal } from 'solid-js';
import type { ReaderUiConfig } from '@/lib/api';
import {
  DEFAULT_READER_SPACING,
  READER_FONT_PRESETS,
  READER_THEME_PRESETS,
  resolveThemeIndex,
} from '@/lib/reader-theme-config';
import { loadNetworkFont } from '@/lib/reader-font';
import { showToast } from '@/lib/toast';

export function ReadSettingsPanel(props: {
  config: ReaderUiConfig;
  onChange: (patch: Partial<ReaderUiConfig>) => void;
}) {
  const [fontUrl, setFontUrl] = createSignal('');
  const [fontLoading, setFontLoading] = createSignal(false);

  const spacing = () => ({
    ...DEFAULT_READER_SPACING,
    ...(props.config.spacing as Partial<typeof DEFAULT_READER_SPACING> | undefined),
  });

  const themeIndex = () => resolveThemeIndex(props.config);

  return (
    <div class="space-y-4 text-sm">
      <div>
        <p class="mb-2 font-medium">主题纹理</p>
        <div class="grid grid-cols-4 gap-2">
          <For each={READER_THEME_PRESETS}>
            {(preset, i) => (
              <button
                type="button"
                title={preset.name}
                class={`h-10 rounded-lg border-2 transition ${themeIndex() === i() ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                style={{
                  background: preset.bodyTexture ?? preset.bodyBg,
                  color: preset.fg,
                }}
                onClick={() =>
                  props.onChange({ theme: i(), themeName: undefined })
                }
              >
                <span class="text-[10px]">{preset.name}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <label class="block">
        字号 {props.config.fontSize ?? 18}px
        <input
          type="range"
          min="14"
          max="32"
          value={props.config.fontSize ?? 18}
          class="mt-1 w-full"
          onInput={(e) => props.onChange({ fontSize: Number(e.currentTarget.value) })}
        />
      </label>

      <label class="block">
        字体
        <select
          class="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
          value={String(props.config.font ?? 0)}
          onChange={(e) => props.onChange({ font: Number(e.currentTarget.value) })}
        >
          <For each={READER_FONT_PRESETS}>
            {(f) => <option value={f.id}>{f.label}</option>}
          </For>
        </select>
      </label>

      <label class="block">
        自定义字体（留空用预设）
        <input
          type="text"
          class="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5"
          value={String(props.config.customFontName ?? '')}
          placeholder="如：LXGW WenKai"
          onInput={(e) => props.onChange({ customFontName: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        网络字体 URL
        <div class="mt-1 flex gap-2">
          <input
            type="url"
            class="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5"
            value={fontUrl()}
            placeholder="https://example.com/font.woff2"
            onInput={(e) => setFontUrl(e.currentTarget.value)}
          />
          <button
            type="button"
            class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            disabled={fontLoading()}
            onClick={() => {
              void (async () => {
                setFontLoading(true);
                try {
                  const name = String(props.config.customFontName ?? '').trim() || 'CustomFont';
                  await loadNetworkFont(name, fontUrl());
                  props.onChange({ customFontName: name });
                  showToast('字体加载成功', 'success');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : '字体加载失败', 'error');
                } finally {
                  setFontLoading(false);
                }
              })();
            }}
          >
            {fontLoading() ? '加载中…' : '加载'}
          </button>
        </div>
      </label>

      <label class="block">
        阅读宽度 {props.config.readWidth ?? 720}px
        <input
          type="range"
          min="480"
          max="960"
          step="20"
          value={props.config.readWidth ?? 720}
          class="mt-1 w-full"
          onInput={(e) => props.onChange({ readWidth: Number(e.currentTarget.value) })}
        />
      </label>

      <label class="block">
        行距 {spacing().line.toFixed(1)}
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={spacing().line}
          class="mt-1 w-full"
          onInput={(e) =>
            props.onChange({
              spacing: { ...spacing(), line: Number(e.currentTarget.value) },
            })
          }
        />
      </label>

      <label class="block">
        段距 {spacing().paragraph.toFixed(1)}
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={spacing().paragraph}
          class="mt-1 w-full"
          onInput={(e) =>
            props.onChange({
              spacing: { ...spacing(), paragraph: Number(e.currentTarget.value) },
            })
          }
        />
      </label>

      <label class="block">
        字距 {spacing().letter.toFixed(1)}
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={spacing().letter}
          class="mt-1 w-full"
          onInput={(e) =>
            props.onChange({
              spacing: { ...spacing(), letter: Number(e.currentTarget.value) },
            })
          }
        />
      </label>

      <label class="block">
        翻页滚动速度 {props.config.jumpDuration ?? 1000}ms
        <input
          type="range"
          min="0"
          max="2000"
          step="100"
          value={props.config.jumpDuration ?? 1000}
          class="mt-1 w-full"
          onInput={(e) => props.onChange({ jumpDuration: Number(e.currentTarget.value) })}
        />
      </label>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(props.config.infiniteLoading)}
          onChange={(e) => props.onChange({ infiniteLoading: e.currentTarget.checked })}
        />
        无限滚动预载下一章
      </label>

      <Show when={props.config.infiniteLoading}>
        <p class="text-xs opacity-60">滚动到底部时自动加载后续章节</p>
      </Show>

      <p class="text-xs opacity-60">← → 翻章 · ↑ ↓ 滚动 · 点击空白切换工具栏</p>
    </div>
  );
}
