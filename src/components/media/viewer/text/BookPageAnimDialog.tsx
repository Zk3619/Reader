/**
 * 本书翻页动画（对齐 Legado BaseReadBookActivity.showPageAnimConfig / menu_page_anim）
 */

import { createEffect, createSignal, For } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import * as booksDb from '@/lib/database/books';
import {
  BOOK_PAGE_ANIM_PICKER_LABELS,
  BOOK_PAGE_ANIM_PICKER_OPTIONS,
  bookPageAnimPickerToLegado,
  legadoPageAnimToPickerValue,
  type BookPageAnimPickerValue,
} from '@/lib/book/legado-page-anim';
import { normalizeTextViewerPageAnim } from '@/lib/media/text/text-viewer-page-anim';
import {
  AppDialogScrollBody,
} from '@/components/shared/AppDialog';
import {
  ViewerAppDialog,
  ViewerAppDialogContent,
  ViewerAppDialogFooter,
  ViewerAppDialogHeader,
  ViewerAppDialogTitle,
} from '@/components/media/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import { showAppToast } from '@/components/shared/AppToasts';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

const optionRowClass =
  'flex cursor-pointer items-center rounded-md px-2 py-1.5 hover:bg-muted/50 has-[[data-checked]]:bg-accent has-[[data-checked]]:text-accent-foreground';

function triggerOptionRadio(el: HTMLElement) {
  el.querySelector<HTMLInputElement>('input[type="radio"]')?.click();
}

export interface BookPageAnimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookPageAnimDialog(props: BookPageAnimDialogProps) {
  const [value, setValue] = createSignal<BookPageAnimPickerValue>('default');
  const [saving, setSaving] = createSignal(false);

  const uiDefaultLabel = () => {
    const ui = normalizeTextViewerPageAnim(textViewerStore.state.config.pageAnim);
    return BOOK_PAGE_ANIM_PICKER_LABELS[ui] ?? ui;
  };

  createEffect(() => {
    if (!props.open) return;
    const book = textViewerStore.state.book;
    setValue(legadoPageAnimToPickerValue(book?.readConfig?.pageAnim as number | undefined));
  });

  const handleSave = async () => {
    const book = textViewerStore.state.book;
    if (!book || textViewerStore.isGuestReading()) return;

    const pageAnim = bookPageAnimPickerToLegado(value());
    const readConfig = {
      ...book.readConfig,
      pageAnim,
    };

    setSaving(true);
    try {
      const updated = { ...book, readConfig };
      await booksDb.updateBook(updated);
      textViewerStore.patchBookReadConfig(readConfig);
      showAppToast({
        title: '本书翻页动画已更新',
        description:
          value() === 'default'
            ? `当前跟随界面设置（${uiDefaultLabel()}）`
            : BOOK_PAGE_ANIM_PICKER_LABELS[value()],
      });
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
      <ViewerAppDialogContent class="w-[calc(100dvw-2rem)] max-w-[20rem]">
        <ViewerAppDialogHeader>
          <ViewerAppDialogTitle>翻页动画（本书）</ViewerAppDialogTitle>
        </ViewerAppDialogHeader>
        <AppDialogScrollBody frameClass={dialogScrollFrameFlex} class="px-6">
          <p class="mb-3 text-xs text-muted-foreground">
            界面设置当前为「{uiDefaultLabel()}」。选择「默认」时将跟随界面抽屉中的翻页模式。
          </p>
          <RadioGroup
            value={value()}
            onChange={(v) => setValue(v as BookPageAnimPickerValue)}
            class="flex flex-col gap-2"
          >
            <For each={[...BOOK_PAGE_ANIM_PICKER_OPTIONS]}>
              {(option) => (
                <div
                  class={optionRowClass}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => triggerOptionRadio(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      triggerOptionRadio(e.currentTarget);
                    }
                  }}
                >
                  <RadioGroupItem value={option} class="w-full">
                    <RadioGroupItemLabel>{BOOK_PAGE_ANIM_PICKER_LABELS[option]}</RadioGroupItemLabel>
                  </RadioGroupItem>
                </div>
              )}
            </For>
          </RadioGroup>
        </AppDialogScrollBody>
        <ViewerAppDialogFooter class={cn('gap-2')}>
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
