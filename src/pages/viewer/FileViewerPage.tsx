/**
 * 文件阅读（PDF 等）
 * 对齐 Legado 网络文件 / WebFile 章节
 */

import { createSignal, Show, type Accessor } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerChromeSlots } from '@/components/viewer/MediaViewerChromeSlots';
import { useMediaViewerMainStageClass } from '@/lib/viewer/viewer-chrome-layout';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';

export interface FileViewerPageProps {
  onClose: () => void;
  entryVisible?: Accessor<boolean>;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

export function FileViewerPage(props: FileViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const mainStageClass = useMediaViewerMainStageClass('flex flex-col bg-muted/30');

  const book = () => viewerStore.state.book;
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const url = () => viewerStore.state.primaryUrl;
  const loading = () => viewerStore.state.loading;
  const bootstrapping = () => viewerStore.isMediaViewerBootstrapping();
  const error = () => viewerStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    await viewerStore.loadChapter(next);
  };

  return (
    <>
      <MediaViewerShell entryVisible={props.entryVisible}>
        <MediaViewerShellMain>
          <MediaViewerChromeSlots
            header={
              <MediaViewerHeader>
                <MediaViewerToolbarHeader
                  title={book()?.name ?? ''}
                  subtitle={chapterTitle()}
                  onClose={props.onClose}
                  onOpenCatalog={() => setCatalogOpen(true)}
                  onRefresh={() => {
                    if (!viewerStore.isOpen()) {
                      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
                      return;
                    }
                    void viewerStore.refreshChapter();
                  }}
                  loading={loading()}
                />
              </MediaViewerHeader>
            }
            footer={
              <MediaViewerFooter>
                <MediaViewerChapterNavFooter
                  chapterIndex={chapterIndex()}
                  catalogLength={catalog().length}
                  loading={loading()}
                  onPrev={() => void goChapter(-1)}
                  onNext={() => void goChapter(1)}
                />
              </MediaViewerFooter>
            }
          >
          <div class={mainStageClass()}>
            <Show when={bootstrapping() || loading()}>
              <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                加载中…
              </div>
            </Show>
            <Show when={!bootstrapping() && !loading() && error()}>
              <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p class="text-sm text-destructive">{error()}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void viewerStore.refreshChapter()}
                >
                  重试
                </Button>
              </div>
            </Show>
            <Show when={!bootstrapping() && !loading() && url()}>
              {(fileUrl) => (
                <>
                  <Show
                    when={isPdfUrl(fileUrl())}
                    fallback={
                      <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
                        <p class="text-center text-sm text-muted-foreground">
                          当前格式请在浏览器中打开或下载
                        </p>
                        <div class="flex flex-wrap justify-center gap-2">
                          <a
                            class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                            href={fileUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            打开链接
                          </a>
                          <a
                            class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium"
                            href={fileUrl()}
                            download=""
                          >
                            下载
                          </a>
                        </div>
                      </div>
                    }
                  >
                    <iframe
                      title={chapterTitle()}
                      src={fileUrl()}
                      class="min-h-0 flex-1 w-full border-0"
                    />
                  </Show>
                </>
              )}
            </Show>
          </div>
          </MediaViewerChromeSlots>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaViewerCatalog
              open={catalogOpen()}
              loading={bootstrapping()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void viewerStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}
