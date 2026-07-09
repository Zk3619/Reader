/**
 * 主题预览沙盒 — draft pack 隔离 + 真实主程序壳层 DOM
 */

import {
  createMemo,
  createRenderEffect,
  createSignal,
  onCleanup,
  Show,
  type Accessor,
} from 'solid-js';
import { cn } from '@/lib/utils';
import type { ReaderThemePackV1, ThemeApplyScope, ThemeComponentId } from '@/lib/theme/schema/theme-pack-v1';
import { applyPreviewThemePackToElement } from '@/lib/theme/theme-runtime';
import { ThemeDraftRuntimeProvider } from '@/components/theme/ThemeDraftRuntimeProvider';
import { ThemeAppShellPreview } from '@/components/theme/ThemeAppShellPreview';
import { ThemeViewerShellPreview } from '@/components/theme/ThemeViewerShellPreview';
import { GlobalThemeEffectsLayer } from '@/components/theme/GlobalThemeEffectsLayer';
import { ShellLayoutProvider } from '@/components/shell/ShellLayoutProvider';
import { SidebarProvider } from '@/components/ui/sidebar';
import { scrollEdgeInset, scrollGutterStableBoth } from '@/lib/ui/viewport-classes';

import type { ThemePreviewViewport } from '@/lib/theme/preview/preview-viewport';
import {
  PREVIEW_VIEWPORT_WIDTH,
  PREVIEW_VIEWER_SHELL_MIN_HEIGHT_PX,
} from '@/lib/theme/preview/preview-viewport';

const appSidebarStyle = {
  '--sidebar-width': '12rem',
  '--sidebar-width-icon': '3rem',
} as const;

function readAccessor<T>(value: T | Accessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}

export interface ThemePreviewSandboxProps {
  pack: ReaderThemePackV1 | Accessor<ReaderThemePackV1>;
  scope: ThemeApplyScope | Accessor<ThemeApplyScope>;
  previewMode: 'full' | 'component' | Accessor<'full' | 'component'>;
  selectedComponentId?: ThemeComponentId | Accessor<ThemeComponentId | undefined>;
  colorMode?: 'light' | 'dark' | Accessor<'light' | 'dark'>;
  viewport?: ThemePreviewViewport | Accessor<ThemePreviewViewport>;
  packRevision?: number | Accessor<number>;
  class?: string;
}

export function ThemePreviewSandbox(props: ThemePreviewSandboxProps) {
  const [rootEl, setRootEl] = createSignal<HTMLDivElement>();

  const viewport = () => readAccessor(props.viewport) ?? 'desktop';
  const scope = () => readAccessor(props.scope);
  const colorMode = () => readAccessor(props.colorMode) ?? 'light';
  const previewMode = () => readAccessor(props.previewMode) ?? 'full';
  const selectedComponentId = () => readAccessor(props.selectedComponentId);
  const showApp = () => scope() === 'app' || scope() === 'all';
  const showViewer = () => scope() === 'viewer' || scope() === 'all';

  const pack = () => readAccessor(props.pack);
  const packRevision = () => readAccessor(props.packRevision ?? 0);

  const applyPreviewTheme = () => {
    const el = rootEl();
    if (!el) return;
    const currentPack = pack();
    applyPreviewThemePackToElement(el, currentPack, {
      scope: scope(),
      preview: true,
      colorMode: colorMode(),
    });
  };

  createRenderEffect(() => {
    void packRevision();
    void colorMode();
    void scope();
    const currentPack = pack();
    void currentPack.app?.tokens?.light;
    void currentPack.app?.tokens?.dark;
    void currentPack.app?.tokens?.layout;
    void currentPack.viewer?.text;
    applyPreviewTheme();
  });

  onCleanup(() => {
    const el = rootEl();
    if (el) {
      el.removeAttribute('data-theme-pack-id');
      el.removeAttribute('data-theme-scope');
      el.removeAttribute('data-theme-scope-viewer');
    }
  });

  const viewerThemeId = createMemo(() => {
    void packRevision();
    const id = pack().viewer?.text?.paletteId;
    if (id === 'custom' || id == null) return 0;
    return typeof id === 'number' ? id : 0;
  });

  /** 主题工作室预览始终展示侧栏（含手机视口），便于编辑侧栏样式 */
  const showSidebar = () => true;

  return (
    <div
      class={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/20',
        props.class,
      )}
      data-theme-preview="true"
    >
      <div
        class={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain',
          scrollGutterStableBoth,
          scrollEdgeInset,
          'p-3',
        )}
      >
        <div
          class="mx-auto flex w-full min-w-0 flex-col self-stretch"
          style={{ 'max-width': `${PREVIEW_VIEWPORT_WIDTH[viewport()]}px` }}
        >
          <ThemeDraftRuntimeProvider
            pack={pack}
            scope={scope()}
            revision={packRevision}
          >
            <ShellLayoutProvider windowWidth={() => PREVIEW_VIEWPORT_WIDTH[viewport()]}>
              <SidebarProvider style={appSidebarStyle} class="w-full min-w-0">
                <div
                  ref={setRootEl}
                  data-theme-preview-mode={colorMode()}
                  class={cn(
                    'relative flex w-full min-w-0 flex-col overflow-x-hidden rounded-lg border border-border bg-background shadow-sm',
                    colorMode() === 'dark' && 'dark',
                  )}
                >
                  <GlobalThemeEffectsLayer pack={pack()} domain="app" embedded />

                  <Show when={showApp()}>
                    <ThemeAppShellPreview
                      selectedComponentId={selectedComponentId()}
                      previewMode={previewMode()}
                      showSidebar={showSidebar()}
                      viewport={viewport()}
                      class="shrink-0 min-h-[520px]"
                    />
                  </Show>

                  <Show when={showViewer()}>
                    <div
                      class={cn('shrink-0', showApp() && 'border-t border-border/60')}
                      style={{ 'min-height': `${PREVIEW_VIEWER_SHELL_MIN_HEIGHT_PX}px` }}
                    >
                      <GlobalThemeEffectsLayer pack={pack()} domain="viewer" embedded />
                      <ThemeViewerShellPreview
                        themeId={viewerThemeId()}
                        selectedComponentId={selectedComponentId()}
                        previewMode={previewMode()}
                        class="min-h-[inherit]"
                      />
                    </div>
                  </Show>
                </div>
              </SidebarProvider>
            </ShellLayoutProvider>
          </ThemeDraftRuntimeProvider>
        </div>
      </div>
    </div>
  );
}
