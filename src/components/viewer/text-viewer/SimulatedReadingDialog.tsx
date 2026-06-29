/**
 * 模拟追更（对齐 Legado BaseReadBookActivity.showSimulatedReading）
 */

import { createEffect, createSignal, Show } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import * as booksDb from '@/lib/database/books';
import {
  formatTodayIso,
  type ReadSimulatingConfig,
} from '@/lib/book/simulated-reading';
import {
  AppDialogScrollBody,
} from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '@/components/ui/switch';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { showAppToast } from '@/components/shared/AppToasts';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';

export interface SimulatedReadingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimulatedReadingDialog(props: SimulatedReadingDialogProps) {
  const [enabled, setEnabled] = createSignal(false);
  const [startDate, setStartDate] = createSignal(formatTodayIso());
  const [startChapter, setStartChapter] = createSignal('0');
  const [dailyChapters, setDailyChapters] = createSignal('3');
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    const book = textViewerStore.state.book;
    const cfg = (book?.readConfig ?? {}) as ReadSimulatingConfig;
    setEnabled(cfg.readSimulating === true);
    setStartDate(
      typeof cfg.startDate === 'string' && cfg.startDate.trim()
        ? cfg.startDate.trim()
        : formatTodayIso(),
    );
    setStartChapter(String(cfg.startChapter ?? 0));
    setDailyChapters(String(cfg.dailyChapters ?? 3));
  });

  const handleSave = async () => {
    const book = textViewerStore.state.book;
    if (!book || textViewerStore.isGuestReading()) return;

    const start = Math.max(0, Math.floor(Number(startChapter()) || 0));
    const daily = Math.max(1, Math.floor(Number(dailyChapters()) || 3));
    const readConfig = {
      ...book.readConfig,
      readSimulating: enabled(),
      startDate: startDate().trim() || formatTodayIso(),
      startChapter: start,
      dailyChapters: daily,
    };

    setSaving(true);
    try {
      const updated = { ...book, readConfig };
      await booksDb.updateBook(updated);
      textViewerStore.patchBookReadConfig(readConfig);
      const idx = textViewerStore.state.chapterIndex;
      const maxIdx = textViewerStore.maxReadableChapterIndex();
      if (idx > maxIdx) {
        await textViewerStore.jumpToChapter(maxIdx);
      } else {
        await textViewerStore.reloadDisplayedChapter();
      }
      showAppToast({ title: enabled() ? '已开启模拟追更' : '已关闭模拟追更' });
      props.onOpenChange(false);
    } catch (e) {
      showAppToast({
        title: '保存失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ViewerAppDialog open={props.open} onOpenChange={props.onOpenChange} modal={false}>
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-md">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>模拟追更</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class="space-y-4 px-6">
          <div class="flex items-center justify-between gap-4">
            <Label>启用</Label>
            <Switch checked={enabled()} onChange={setEnabled}>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
              <SwitchLabel class="sr-only">启用模拟追更</SwitchLabel>
            </Switch>
          </div>
          <div class="space-y-2">
            <Label>起始日期</Label>
            <TextField>
              <TextFieldInput
                type="date"
                value={startDate()}
                onInput={(e) => setStartDate(e.currentTarget.value)}
              />
            </TextField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-2">
              <Label>起始章节</Label>
              <TextField>
                <TextFieldInput
                  type="number"
                  min={0}
                  value={startChapter()}
                  onInput={(e) => setStartChapter(e.currentTarget.value)}
                />
              </TextField>
            </div>
            <div class="space-y-2">
              <Label>每日更新章数</Label>
              <TextField>
                <TextFieldInput
                  type="number"
                  min={1}
                  value={dailyChapters()}
                  onInput={(e) => setDailyChapters(e.currentTarget.value)}
                />
              </TextField>
            </div>
          </div>
          <Show when={enabled()}>
            <p class="text-xs text-muted-foreground">
              按起始日期与每日章数限制可阅读的最大章节，用于模拟连载更新节奏。
            </p>
          </Show>
        </AppDialogScrollBody>
        <ViewerAppDialogFooter class="gap-2">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={saving()} onClick={() => void handleSave()}>
            {saving() ? '保存中…' : '确定'}
          </Button>
        </ViewerAppDialogFooter>
      </ViewerAppDialogContent>
    </ViewerAppDialog>
  );
}
