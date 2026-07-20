/**
 * HttpTTS 引擎管理（对标 Legado SpeakEngineDialog）
 */

import { createResource, createSignal, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { VirtualList } from '@/components/shared/virtual-list';
import { Button } from '@/components/ui/button';
import { AppTextField, AppTextFieldInput } from '@/components/shared/AppTextField';
import { deleteHttpTTS, getAllHttpTTS } from '@/lib/database/http-tts';
import {
  exportHttpTtsToJson,
  httpTtsWebPlaybackSupport,
  importDefaultHttpTts,
  importHttpTtsFromJson,
  importHttpTtsFromUrl,
  loadHttpTtsLoginInfo,
} from '@/lib/media/text/http-tts-import';
import { textViewerStore } from '@/stores/viewer';
import type { HttpTTS } from '@/types';
import { HttpTtsEditDialog } from '@/components/media/viewer/text/HttpTtsEditDialog';
import { HttpTtsLoginDialog } from '@/components/media/viewer/text/HttpTtsLoginDialog';
import { showAppToast } from '@/components/shared/AppToasts';
import { dialogScrollFrameFlex, dialogVirtualListScroll } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface HttpTtsEngineManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListChange?: () => void;
}

const HTTP_TTS_ENGINE_ROW_ESTIMATE_PX = 88;

export function HttpTtsEngineManager(props: HttpTtsEngineManagerProps) {
  let scrollTrack: HTMLDivElement | undefined;
  const [editOpen, setEditOpen] = createSignal(false);
  const [editTarget, setEditTarget] = createSignal<HttpTTS | null>(null);
  const [loginOpen, setLoginOpen] = createSignal(false);
  const [loginTarget, setLoginTarget] = createSignal<HttpTTS | null>(null);
  const [importUrl, setImportUrl] = createSignal('');
  const [importing, setImporting] = createSignal(false);

  const [list, { refetch }] = createResource(
    () => props.open,
    async (open) => (open ? getAllHttpTTS() : []),
  );

  const refresh = () => {
    refetch();
    props.onListChange?.();
  };

  const selectEngine = (item: HttpTTS) => {
    textViewerStore.setConfig({
      aloudEngine: 'httpTts',
      httpTtsId: item.id,
    });
    showAppToast({ title: `已选择：${item.name}` });
  };

  const handleDelete = async (item: HttpTTS) => {
    await deleteHttpTTS(item.id);
    const cfg = textViewerStore.state.config;
    if (cfg.httpTtsId === item.id) {
      textViewerStore.setConfig({ httpTtsId: null });
    }
    refresh();
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        setImporting(true);
        try {
          const text = await file.text();
          const result = await importHttpTtsFromJson(text, { overwrite: true });
          showAppToast({
            title: '导入完成',
            description: `成功 ${result.imported}，跳过 ${result.skipped}，冲突 ${result.conflicts}`,
          });
          refresh();
        } catch (e) {
          showAppToast({
            title: '导入失败',
            description: e instanceof Error ? e.message : String(e),
            variant: 'destructive',
          });
        } finally {
          setImporting(false);
        }
      })();
    };
    input.click();
  };

  const handleImportUrl = async () => {
    const url = importUrl().trim();
    if (!url) return;
    setImporting(true);
    try {
      const result = await importHttpTtsFromUrl(url, { overwrite: true });
      showAppToast({
        title: '导入完成',
        description: `成功 ${result.imported}`,
      });
      refresh();
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleImportDefault = async () => {
    setImporting(true);
    try {
      const result = await importDefaultHttpTts({ overwrite: false });
      showAppToast({
        title: '默认数据已导入',
        description: `新增 ${result.imported} 个引擎`,
      });
      refresh();
    } catch (e) {
      showAppToast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportHttpTtsToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'httpTTS.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showAppToast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
        <AppDialogContent portalToBody class="max-h-[90dvh]">
          <AppDialogHeader>
            <AppDialogTitle>朗读引擎管理</AppDialogTitle>
          </AppDialogHeader>
          <div class="shrink-0 space-y-3 px-6">
            <div class="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditTarget(null);
                  setEditOpen(true);
                }}
              >
                新增
              </Button>
              <Button size="sm" variant="outline" disabled={importing()} onClick={handleImportFile}>
                导入本地
              </Button>
              <Button size="sm" variant="outline" disabled={importing()} onClick={() => void handleImportDefault()}>
                导入默认
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleExport()}>
                导出
              </Button>
            </div>
            <div class="flex gap-2">
              <AppTextField class="flex-1">
                <AppTextFieldInput
                  placeholder="从 URL 导入 JSON"
                  value={importUrl()}
                  onInput={(e) => setImportUrl(e.currentTarget.value)}
                />
              </AppTextField>
              <Button size="sm" disabled={importing()} onClick={() => void handleImportUrl()}>
                导入
              </Button>
            </div>
          </div>
          <AppDialogScrollBody
            frameClass={dialogScrollFrameFlex}
            class={dialogVirtualListScroll}
            trackRef={(el) => {
              scrollTrack = el;
            }}
          >
            <Show when={list.loading}>
              <p class="text-sm text-muted-foreground">加载中…</p>
            </Show>
            <Show when={!list.loading && (list()?.length ?? 0) === 0}>
              <p class="py-4 text-center text-sm text-muted-foreground">暂无引擎，请新增或导入</p>
            </Show>
            <Show when={(list()?.length ?? 0) > 0}>
              <VirtualList
                items={() => list() ?? []}
                estimateSize={() => HTTP_TTS_ENGINE_ROW_ESTIMATE_PX}
                overscan={4}
                externalScrollElement={() => scrollTrack ?? null}
                getItemKey={(item) => item.id}
              >
                {(item) => {
                  const support = () => httpTtsWebPlaybackSupport(item.url);
                  const hasLogin = () =>
                    Boolean(item.loginUi?.trim()) && Boolean(loadHttpTtsLoginInfo(item.id));
                  const selected = () =>
                    textViewerStore.state.config.httpTtsId === item.id &&
                    textViewerStore.state.config.aloudEngine === 'httpTts';
                  return (
                    <div class="pb-2">
                      <div
                        class={cn(
                          'rounded-lg border p-3',
                          selected() ? 'border-primary' : 'border-border/60',
                        )}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            class="min-w-0 flex-1 text-left"
                            onClick={() => selectEngine(item)}
                          >
                            <div class="font-medium">{item.name}</div>
                            <div class="mt-1 text-xs text-muted-foreground">
                              {support() === 'full'
                                ? 'Web 完全支持'
                                : support() === 'limited'
                                  ? 'Web 部分支持'
                                  : 'Web 不支持 @js'}
                              {item.loginUi?.trim()
                                ? hasLogin()
                                  ? ' · 已登录'
                                  : ' · 需登录'
                                : ''}
                            </div>
                          </button>
                          <div class="flex shrink-0 gap-1">
                            <Show when={item.loginUi?.trim()}>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setLoginTarget(item);
                                  setLoginOpen(true);
                                }}
                              >
                                登录
                              </Button>
                            </Show>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditTarget(item);
                                setEditOpen(true);
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              class="text-destructive"
                              onClick={() => void handleDelete(item)}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </VirtualList>
            </Show>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              关闭
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>

      <HttpTtsEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        initial={editTarget()}
        onSaved={refresh}
      />
      <HttpTtsLoginDialog
        open={loginOpen()}
        onOpenChange={setLoginOpen}
        httpTts={loginTarget()}
      />
    </>
  );
}
