/**
 * 文件阅读（PDF 等）
 * 对齐 Legado 网络文件 / WebFile 章节
 */

import { createSignal, Show } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-reader';
import { MediaReaderShell } from '@/components/reader/MediaReaderShell';
import { MediaReaderCatalog } from '@/components/reader/MediaReaderCatalog';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export interface FileViewerPageProps {
  onClose: () => void;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

export function FileViewerPage(props: FileViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const url = () => mediaReaderStore.state.primaryUrl;
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    await mediaReaderStore.loadChapter(next);
  };

  return (
    <>
      <MediaReaderShell
        title={book()?.name ?? ''}
        subtitle={chapterTitle()}
        onClose={props.onClose}
        onOpenCatalog={() => setCatalogOpen(true)}
        onRefresh={() => void mediaReaderStore.refreshChapter()}
        loading={loading()}
        footer={
          <div class="flex items-center justify-center gap-3 px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() <= 0 || loading()}
              onClick={() => void goChapter(-1)}
            >
              上一章
            </Button>
            <span class="text-xs text-muted-foreground">
              {catalog().length > 0 ? `${chapterIndex() + 1} / ${catalog().length}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() >= catalog().length - 1 || loading()}
              onClick={() => void goChapter(1)}
            >
              下一章
            </Button>
          </div>
        }
      >
        <div class="flex h-full flex-col bg-muted/30">
          <Show when={loading()}>
            <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          </Show>
          <Show when={!loading() && error()}>
            <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p class="text-sm text-destructive">{error()}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void mediaReaderStore.refreshChapter()}
              >
                重试
              </Button>
            </div>
          </Show>
          <Show when={!loading() && url()}>
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
      </MediaReaderShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaReaderCatalog
              open={catalogOpen()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void mediaReaderStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}
