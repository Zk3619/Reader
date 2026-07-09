/**
 * Theme Studio 预览用 Mock 组件
 */

import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ContainerBackgroundLayer } from '@/lib/theme/background/ContainerBackgroundLayer';
import { getThemeComponentBackground } from '@/lib/theme/component-background';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';
import type { AppComponentId, ViewerComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { readerThemeClasses } from '@/lib/media/text/reader-theme-classes';
import {
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { componentOverrideToStyle } from '@/lib/theme/theme-runtime';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';

const MOCK_CHAPTER =
  '第一章 开端\n\n这是主题预览用的示例正文。调整颜色、排版与背景后可在此实时查看效果。';

export interface ThemePreviewMocksProps {
  pack: ReaderThemePackV1;
  componentId?: AppComponentId | ViewerComponentId | 'full';
  colorMode?: 'light' | 'dark';
  resolveAssetUrl?: (assetId: string) => string | undefined;
}

function overrideStyle(
  pack: ReaderThemePackV1,
  key: AppComponentId | ViewerComponentId,
): Record<string, string> {
  const app = pack.app?.components?.[key as AppComponentId];
  const viewer = pack.viewer?.components?.[key as ViewerComponentId];
  return componentOverrideToStyle(app ?? viewer, { componentId: key });
}

function MockComponentBackground(props: {
  pack: ReaderThemePackV1;
  id: AppComponentId | ViewerComponentId;
  resolveAssetUrl?: (assetId: string) => string | undefined;
}) {
  const config = () => getThemeComponentBackground(props.pack, props.id);
  return (
    <ContainerBackgroundLayer
      config={config()}
      assets={props.pack.assets}
      resolveAssetUrl={props.resolveAssetUrl}
    />
  );
}

export function ThemeAppPreviewMock(props: ThemePreviewMocksProps) {
  const show = (id: AppComponentId) =>
    props.componentId === 'full' || props.componentId === id || props.componentId === 'appShell';

  return (
    <div
      class={cn(
        'relative flex min-h-[320px] flex-col gap-4 overflow-hidden rounded-xl border border-border bg-background p-4 text-foreground',
        props.colorMode === 'dark' && 'dark',
      )}
      {...componentDataAttr('appShell')}
      style={overrideStyle(props.pack, 'appShell')}
    >
      <MockComponentBackground pack={props.pack} id="appShell" resolveAssetUrl={props.resolveAssetUrl} />
      <Show when={show('pageToolbar') || show('pageContent')}>
        <div
          class="relative overflow-hidden rounded-lg border border-border/60 bg-card px-3 py-2"
          {...componentDataAttr('pageContent')}
          style={overrideStyle(props.pack, 'pageContent')}
        >
          <MockComponentBackground pack={props.pack} id="pageContent" resolveAssetUrl={props.resolveAssetUrl} />
          <div class="relative z-1 flex items-center justify-between">
            <span class="text-sm font-semibold">页面区域</span>
            <span class="text-xs text-muted-foreground">预览</span>
          </div>
        </div>
      </Show>

      <Show when={show('pageToolbar')}>
        <div
          class="relative flex items-center justify-between overflow-hidden rounded-lg border border-border/60 bg-card px-3 py-2"
          {...componentDataAttr('pageToolbar')}
          style={overrideStyle(props.pack, 'pageToolbar')}
        >
          <MockComponentBackground pack={props.pack} id="pageToolbar" resolveAssetUrl={props.resolveAssetUrl} />
          <span class="relative z-1 text-sm font-semibold">页头工具栏</span>
        </div>
      </Show>

      <Show when={show('sidebar') || props.componentId === 'full'}>
        <div
          class="relative hidden w-48 shrink-0 overflow-hidden rounded-lg border border-border bg-sidebar p-3 text-sidebar-foreground sm:block"
          {...componentDataAttr('sidebar')}
          style={overrideStyle(props.pack, 'sidebar')}
        >
          <MockComponentBackground pack={props.pack} id="sidebar" resolveAssetUrl={props.resolveAssetUrl} />
          <div class="relative z-1">
          <p class="mb-2 text-xs font-medium text-muted-foreground">导航</p>
          <ul class="space-y-1 text-sm">
            <li>书架</li>
            <li>书源</li>
            <li>设置</li>
          </ul>
          </div>
        </div>
      </Show>

      <div class="grid flex-1 gap-3 sm:grid-cols-2">
        <Show when={show('bookshelfCard')}>
          <div
            class="relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
            {...componentDataAttr('bookshelfCard')}
            style={overrideStyle(props.pack, 'bookshelfCard')}
          >
            <MockComponentBackground pack={props.pack} id="bookshelfCard" resolveAssetUrl={props.resolveAssetUrl} />
            <div class="relative z-1">
            <div class="mb-3 aspect-3/4 rounded-md bg-muted" />
            <p class={bookGroupGridTitleClass()}>示例书籍</p>
            <p class={bookGroupGridSubtitleClass()}>作者名</p>
            </div>
          </div>
        </Show>

        <Show when={show('bookshelfGroupCard')}>
          <div
            class="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"
            {...componentDataAttr('bookshelfGroupCard')}
            style={overrideStyle(props.pack, 'bookshelfGroupCard')}
          >
            <MockComponentBackground pack={props.pack} id="bookshelfGroupCard" resolveAssetUrl={props.resolveAssetUrl} />
            <div class="relative z-1">
              <div class="mb-3 aspect-3/4 rounded-md bg-muted" />
              <p class={bookGroupGridTitleClass()}>默认分组</p>
              <p class={bookGroupGridSubtitleClass()}>12 本书</p>
            </div>
          </div>
        </Show>

        <Show when={show('surfaceCard')}>
          <div
            class="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm"
            {...componentDataAttr('surfaceCard')}
            style={overrideStyle(props.pack, 'surfaceCard')}
          >
            <MockComponentBackground pack={props.pack} id="surfaceCard" resolveAssetUrl={props.resolveAssetUrl} />
            <div class="relative z-1">
              <p class="font-medium">探索 / 书源卡片</p>
              <p class="text-xs text-muted-foreground">通用表面样式预览</p>
            </div>
          </div>
        </Show>

        <Show when={show('settingsTabPanel') || show('settingsCard')}>
          <div
            class="relative min-h-[120px] overflow-hidden rounded-xl border border-border bg-background p-4"
            {...componentDataAttr('settingsTabPanel')}
            style={overrideStyle(props.pack, 'settingsTabPanel')}
          >
            <MockComponentBackground pack={props.pack} id="settingsTabPanel" resolveAssetUrl={props.resolveAssetUrl} />
            <div class="relative z-1 space-y-2">
              <p class="font-medium">设置 Tab 面板</p>
              <p class="text-sm text-muted-foreground">桌面端分类内容区背景</p>
              <Show when={show('settingsCard')}>
                <div
                  class="flex h-16 items-center gap-3 rounded-lg border border-border/50 bg-card p-2 text-card-foreground"
                  {...componentDataAttr('settingsCard')}
                  style={overrideStyle(props.pack, 'settingsCard')}
                >
                  <MockComponentBackground pack={props.pack} id="settingsCard" resolveAssetUrl={props.resolveAssetUrl} />
                  <div class="relative z-1">
                    <p class="font-medium">设置分类卡片</p>
                    <p class="text-xs text-card-foreground/70">卡片背景预览</p>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={show('settingsRow')}>
          <div
            class="rounded-xl border border-border bg-card p-4"
            {...componentDataAttr('settingsRow')}
            style={overrideStyle(props.pack, 'settingsRow')}
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">设置项</p>
                <p class="text-sm text-muted-foreground">说明文字</p>
              </div>
              <div class="h-6 w-11 rounded-full bg-primary/20" />
            </div>
          </div>
        </Show>
      </div>

      <Show when={show('button')}>
        <div class="flex flex-wrap gap-2" {...componentDataAttr('button')} style={overrideStyle(props.pack, 'button')}>
          <Button>主要</Button>
          <Button variant="secondary">次要</Button>
          <Button variant="outline">描边</Button>
          <Button variant="destructive">危险</Button>
          <Button variant="ghost">幽灵</Button>
          <Button variant="link">链接</Button>
        </div>
      </Show>

      <Show when={show('dialog')}>
        <div
          class="relative overflow-hidden rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
          {...componentDataAttr('dialog')}
          style={overrideStyle(props.pack, 'dialog')}
        >
          <MockComponentBackground pack={props.pack} id="dialog" resolveAssetUrl={props.resolveAssetUrl} />
          <div class="relative z-1">
          <p class="font-semibold">对话框标题</p>
          <p class="mt-1 text-sm text-muted-foreground">这是对话框内容预览。</p>
          </div>
        </div>
      </Show>

      <Show when={show('dropdown')}>
        <div
          class="relative w-40 overflow-hidden rounded-lg border border-border bg-popover p-2 text-sm shadow-md"
          {...componentDataAttr('dropdown')}
          style={overrideStyle(props.pack, 'dropdown')}
        >
          <MockComponentBackground pack={props.pack} id="dropdown" resolveAssetUrl={props.resolveAssetUrl} />
          <ul class="relative z-1 space-y-1">
            <li>菜单项 A</li>
            <li>菜单项 B</li>
          </ul>
        </div>
      </Show>

      <Show when={show('select')}>
        <div
          class="relative w-48 overflow-hidden rounded-lg border border-border bg-popover p-2 text-sm"
          {...componentDataAttr('select')}
          style={overrideStyle(props.pack, 'select')}
        >
          <MockComponentBackground pack={props.pack} id="select" resolveAssetUrl={props.resolveAssetUrl} />
          <p class="relative z-1">选项一</p>
        </div>
      </Show>

      <Show when={show('toast')}>
        <div
          class="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-md"
          {...componentDataAttr('toast')}
          style={overrideStyle(props.pack, 'toast')}
        >
          <MockComponentBackground pack={props.pack} id="toast" resolveAssetUrl={props.resolveAssetUrl} />
          <span class="relative z-1">操作已完成</span>
        </div>
      </Show>
    </div>
  );
}

export function ThemeViewerPreviewMock(props: ThemePreviewMocksProps) {
  const themeId = () => {
    const id = props.pack.viewer?.text?.paletteId;
    if (id === 'custom' || id == null) return 0;
    return id;
  };
  const classes = () => readerThemeClasses(themeId());

  const show = (id: ViewerComponentId) =>
    props.componentId === 'full' || props.componentId === id || props.componentId === 'readerChrome';

  return (
    <div
      class="relative flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-border"
      {...componentDataAttr('readerChrome')}
      style={overrideStyle(props.pack, 'readerChrome')}
    >
      <Show when={show('toolbarHeader')}>
        <div
          class="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-sm"
          {...componentDataAttr('toolbarHeader')}
          style={overrideStyle(props.pack, 'toolbarHeader')}
        >
          <span class="text-muted-foreground">←</span>
          <span class="min-w-0 flex-1 truncate font-medium">示例书籍</span>
          <span class="text-muted-foreground">⋮</span>
        </div>
      </Show>

      <Show when={show('contentSlot')}>
        <div
          class={cn('relative flex-1 overflow-auto p-6', classes().bg, classes().text)}
          {...componentDataAttr('contentSlot')}
          style={overrideStyle(props.pack, 'contentSlot')}
        >
          <MockComponentBackground pack={props.pack} id="contentSlot" resolveAssetUrl={props.resolveAssetUrl} />
          <div class="relative z-1">
            <For each={MOCK_CHAPTER.split('\n\n')}>
              {(block) => (
                <p class="mb-4 whitespace-pre-wrap leading-relaxed">{block}</p>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={show('pageTip')}>
        <div
          class="border-t border-border/40 px-4 py-1 text-center text-xs text-muted-foreground"
          {...componentDataAttr('pageTip')}
          style={overrideStyle(props.pack, 'pageTip')}
        >
          1 / 128 · 本章 3200 字
        </div>
      </Show>

      <Show when={show('brightnessCapsule')}>
        <div
          class="absolute bottom-4 right-4 rounded-full border border-border/50 bg-background/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm"
          {...componentDataAttr('brightnessCapsule')}
          style={overrideStyle(props.pack, 'brightnessCapsule')}
        >
          ☀ 75%
        </div>
      </Show>

      <Show when={show('imageStage')}>
        <div
          class="relative flex flex-1 items-center justify-center bg-muted"
          {...componentDataAttr('imageStage')}
          style={overrideStyle(props.pack, 'imageStage')}
        >
          <MockComponentBackground pack={props.pack} id="imageStage" resolveAssetUrl={props.resolveAssetUrl} />
          <span class="relative z-1 text-sm text-muted-foreground">图片 Stage 预览</span>
        </div>
      </Show>

      <Show when={show('videoControls')}>
        <div
          class="flex items-center gap-3 border-t border-border bg-background px-4 py-3"
          {...componentDataAttr('videoControls')}
          style={overrideStyle(props.pack, 'videoControls')}
        >
          <span>▶</span>
          <div class="h-1 flex-1 rounded-full bg-muted">
            <div class="h-full w-1/3 rounded-full bg-primary" />
          </div>
          <span class="text-xs text-muted-foreground">03:24</span>
        </div>
      </Show>
    </div>
  );
}
