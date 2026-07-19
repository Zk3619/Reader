/**
 * 书架缓存导出选项弹窗（文本 / 图片 / 音频共用）
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from '@/components/ui/radio-group';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import {
  NumberField,
  NumberFieldDecrementTrigger,
  NumberFieldGroup,
  NumberFieldIncrementTrigger,
  NumberFieldInput,
  NumberFieldLabel,
} from '@/components/ui/number-field';
import {
  DEFAULT_CACHE_EXPORT_OPTIONS,
  type CacheExportKind,
  type CacheExportOptions,
} from '@/lib/export/cache-export-types';
import { parseOfflineCacheChapterRange } from '@/lib/chapter-cache/offline-cache-actions';
import {
  resolveMediaConvertCapabilities,
  supportsAudioTargetFormat,
  supportsImageTargetFormat,
  type ResolvedMediaConvertCapabilities,
} from '@/lib/media/media-convert-capabilities';
import { isTauri } from '@/lib/platform/detect';
import type { Book } from '@/types';

export interface BookshelfCacheExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: Book | null;
  totalChapters: number;
  isManga: boolean;
  isAudioBook: boolean;
  exporting?: boolean;
  onConfirm: (options: CacheExportOptions) => void;
}

function sectionTitle(text: string) {
  return <p class="text-sm font-medium text-foreground">{text}</p>;
}

function helperText(text: string) {
  return <p class="text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

export function BookshelfCacheExportDialog(props: BookshelfCacheExportDialogProps) {
  const [kind, setKind] = createSignal<CacheExportKind>('text');
  const [startChapter, setStartChapter] = createSignal(1);
  const [endChapter, setEndChapter] = createSignal(1);
  const chapterTotal = () => Math.max(1, props.totalChapters);
  const [textFormat, setTextFormat] = createSignal(DEFAULT_CACHE_EXPORT_OPTIONS.textFormat);
  const [textLayout, setTextLayout] = createSignal(DEFAULT_CACHE_EXPORT_OPTIONS.textLayout);
  const [imageDelivery, setImageDelivery] = createSignal(DEFAULT_CACHE_EXPORT_OPTIONS.imageDelivery);
  const [imageTargetFormat, setImageTargetFormat] = createSignal(
    DEFAULT_CACHE_EXPORT_OPTIONS.imageTargetFormat,
  );
  const [imageGroupByChapter, setImageGroupByChapter] = createSignal(
    DEFAULT_CACHE_EXPORT_OPTIONS.imageGroupByChapter,
  );
  const [audioDelivery, setAudioDelivery] = createSignal(DEFAULT_CACHE_EXPORT_OPTIONS.audioDelivery);
  const [audioTargetFormat, setAudioTargetFormat] = createSignal(
    DEFAULT_CACHE_EXPORT_OPTIONS.audioTargetFormat,
  );
  const [audioMergeSingle, setAudioMergeSingle] = createSignal(
    DEFAULT_CACHE_EXPORT_OPTIONS.audioMergeSingle,
  );
  const [convertCaps, setConvertCaps] =
    createSignal<ResolvedMediaConvertCapabilities | null>(null);

  const imageConvertAvailable = () => convertCaps()?.image.available ?? false;
  const audioConvertAvailable = () => convertCaps()?.audio.available ?? false;

  const availableKinds = () => {
    const kinds: CacheExportKind[] = ['text'];
    if (props.isManga) kinds.push('image');
    if (props.isAudioBook) kinds.push('audio');
    return kinds;
  };

  const kindLabel = (k: CacheExportKind) => {
    if (k === 'text') return '文本正文';
    if (k === 'image') return '章节图片';
    return '章节音频';
  };

  createEffect(() => {
    if (!props.open) return;
    const total = chapterTotal();
    setStartChapter(1);
    setEndChapter(total);
    const kinds = availableKinds();
    setKind(kinds[0] ?? 'text');
    setTextFormat(DEFAULT_CACHE_EXPORT_OPTIONS.textFormat);
    setTextLayout(DEFAULT_CACHE_EXPORT_OPTIONS.textLayout);
    setImageDelivery(DEFAULT_CACHE_EXPORT_OPTIONS.imageDelivery);
    setImageTargetFormat(DEFAULT_CACHE_EXPORT_OPTIONS.imageTargetFormat);
    setImageGroupByChapter(DEFAULT_CACHE_EXPORT_OPTIONS.imageGroupByChapter);
    setAudioDelivery(DEFAULT_CACHE_EXPORT_OPTIONS.audioDelivery);
    setAudioTargetFormat(DEFAULT_CACHE_EXPORT_OPTIONS.audioTargetFormat);
    setAudioMergeSingle(DEFAULT_CACHE_EXPORT_OPTIONS.audioMergeSingle);
    void resolveMediaConvertCapabilities(true).then((caps) => {
      setConvertCaps(caps);
      if (!caps.image.available) {
        setImageTargetFormat('original');
      } else if (
        !supportsImageTargetFormat(caps, DEFAULT_CACHE_EXPORT_OPTIONS.imageTargetFormat)
      ) {
        setImageTargetFormat('original');
      }
      if (!caps.audio.available) {
        setAudioTargetFormat('original');
      } else if (
        !supportsAudioTargetFormat(caps, DEFAULT_CACHE_EXPORT_OPTIONS.audioTargetFormat)
      ) {
        setAudioTargetFormat('original');
      }
    });
  });

  const handleConfirm = () => {
    const total = chapterTotal();
    const range = parseOfflineCacheChapterRange({
      startRaw: String(startChapter()),
      endRaw: String(endChapter()),
      max: total,
      defaultStart: 1,
    });
    if (!range) return;

    const caps = convertCaps();
    const imageFormat =
      caps &&
      imageConvertAvailable() &&
      supportsImageTargetFormat(caps, imageTargetFormat())
        ? imageTargetFormat()
        : 'original';
    const audioFormat =
      caps &&
      audioConvertAvailable() &&
      supportsAudioTargetFormat(caps, audioTargetFormat())
        ? audioTargetFormat()
        : 'original';

    props.onConfirm({
      kind: kind(),
      startIndex: range.start - 1,
      endIndex: range.end - 1,
      onlyCached: true,
      textFormat: textFormat(),
      textLayout: textLayout(),
      imageDelivery: imageDelivery(),
      imageTargetFormat: imageFormat,
      imageGroupByChapter: imageGroupByChapter(),
      audioDelivery: audioDelivery(),
      audioTargetFormat: audioFormat,
      audioMergeSingle: audioMergeSingle(),
    });
  };

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="sm:max-w-lg">
        <AppDialogHeader>
          <AppDialogTitle>导出离线缓存</AppDialogTitle>
          <AppDialogDescription class="space-y-1">
            <span class="block truncate">{props.book?.name ?? ''}</span>
            <span class="block text-xs font-normal text-muted-foreground">
              仅导出所选范围内已缓存的内容，不会重新联网拉取
            </span>
          </AppDialogDescription>
        </AppDialogHeader>

        <div class="max-h-[min(70vh,32rem)] space-y-5 overflow-y-auto px-6 py-1">
          <Show when={availableKinds().length > 1}>
            <div class="space-y-2">
              {sectionTitle('导出内容')}
              {helperText('选择要导出的缓存类型')}
              <RadioGroup
                value={kind()}
                onChange={(v) => setKind(v as CacheExportKind)}
                class="gap-2"
              >
                <For each={availableKinds()}>
                  {(k) => (
                    <RadioGroupItem value={k}>
                      <RadioGroupItemLabel>{kindLabel(k)}</RadioGroupItemLabel>
                    </RadioGroupItem>
                  )}
                </For>
              </RadioGroup>
            </div>
          </Show>

          <div class="space-y-2">
            {sectionTitle('章节范围')}
            <div class="grid grid-cols-2 gap-3">
              <NumberField
                class="space-y-1.5"
                rawValue={startChapter()}
                onRawValueChange={(value) => {
                  if (!Number.isFinite(value) || value === startChapter()) return;
                  setStartChapter(value);
                }}
                minValue={1}
                maxValue={chapterTotal()}
                step={1}
              >
                <NumberFieldLabel>起始章节</NumberFieldLabel>
                <NumberFieldGroup>
                  <NumberFieldInput class="h-10 pr-7" />
                  <NumberFieldIncrementTrigger />
                  <NumberFieldDecrementTrigger />
                </NumberFieldGroup>
              </NumberField>
              <NumberField
                class="space-y-1.5"
                rawValue={endChapter()}
                onRawValueChange={(value) => {
                  if (!Number.isFinite(value) || value === endChapter()) return;
                  setEndChapter(value);
                }}
                minValue={1}
                maxValue={chapterTotal()}
                step={1}
              >
                <NumberFieldLabel>结束章节</NumberFieldLabel>
                <NumberFieldGroup>
                  <NumberFieldInput class="h-10 pr-7" />
                  <NumberFieldIncrementTrigger />
                  <NumberFieldDecrementTrigger />
                </NumberFieldGroup>
              </NumberField>
            </div>
            {helperText('章节号为目录中的顺序，仅包含该范围内已成功缓存的章节')}
          </div>

          <Show when={kind() === 'text'}>
            <div class="space-y-4">
              <div class="space-y-2">
                {sectionTitle('正文格式')}
                <RadioGroup
                  value={textFormat()}
                  onChange={(v) => setTextFormat(v as 'txt' | 'epub')}
                  class="gap-2"
                >
                  <RadioGroupItem value="txt">
                    <RadioGroupItemLabel>TXT 纯文本</RadioGroupItemLabel>
                  </RadioGroupItem>
                  <RadioGroupItem value="epub">
                    <RadioGroupItemLabel>EPUB 电子书</RadioGroupItemLabel>
                  </RadioGroupItem>
                </RadioGroup>
              </div>
              <div class="space-y-2">
                {sectionTitle('文件组织')}
                <RadioGroup
                  value={textLayout()}
                  onChange={(v) =>
                    setTextLayout(v as 'single' | 'split' | 'split_zip')
                  }
                  class="gap-2"
                >
                  <RadioGroupItem value="single">
                    <RadioGroupItemLabel>合并为一个文件</RadioGroupItemLabel>
                  </RadioGroupItem>
                  <Show when={isTauri()}>
                    <RadioGroupItem value="split">
                      <RadioGroupItemLabel>每章一个文件（保存到文件夹）</RadioGroupItemLabel>
                    </RadioGroupItem>
                  </Show>
                  <RadioGroupItem value="split_zip">
                    <RadioGroupItemLabel>每章一个文件（打包为 ZIP）</RadioGroupItemLabel>
                  </RadioGroupItem>
                </RadioGroup>
                {helperText(
                  isTauri()
                    ? '桌面版可将章节分别保存到文件夹，或使用 ZIP 便于分享'
                    : '浏览器环境建议使用 ZIP 方式下载',
                )}
              </div>
            </div>
          </Show>

          <Show when={kind() === 'image'}>
            <div class="space-y-4">
              <div class="space-y-2">
                {sectionTitle('保存方式')}
                <RadioGroup
                  value={imageDelivery()}
                  onChange={(v) => setImageDelivery(v as 'zip' | 'folder')}
                  class="gap-2"
                >
                  <RadioGroupItem value="zip">
                    <RadioGroupItemLabel>ZIP 压缩包</RadioGroupItemLabel>
                  </RadioGroupItem>
                  <Show when={isTauri()}>
                    <RadioGroupItem value="folder">
                      <RadioGroupItemLabel>保存到文件夹</RadioGroupItemLabel>
                    </RadioGroupItem>
                  </Show>
                </RadioGroup>
              </div>
              <div class="space-y-2">
                {sectionTitle('图片格式')}
                <Show
                  when={imageConvertAvailable()}
                  fallback={
                    helperText(
                      convertCaps()?.image.hint ??
                        '将按离线缓存时的原始图片格式导出',
                    )
                  }
                >
                  <RadioGroup
                    value={imageTargetFormat()}
                    onChange={(v) =>
                      setImageTargetFormat(
                        v as 'original' | 'jpeg' | 'png' | 'webp',
                      )
                    }
                    class="gap-2"
                  >
                    <RadioGroupItem value="original">
                      <RadioGroupItemLabel>保持原格式（推荐）</RadioGroupItemLabel>
                    </RadioGroupItem>
                    <Show
                      when={supportsImageTargetFormat(convertCaps()!, 'jpeg')}
                    >
                      <RadioGroupItem value="jpeg">
                        <RadioGroupItemLabel>转为 JPEG</RadioGroupItemLabel>
                      </RadioGroupItem>
                    </Show>
                    <Show
                      when={supportsImageTargetFormat(convertCaps()!, 'png')}
                    >
                      <RadioGroupItem value="png">
                        <RadioGroupItemLabel>转为 PNG</RadioGroupItemLabel>
                      </RadioGroupItem>
                    </Show>
                    <Show
                      when={supportsImageTargetFormat(convertCaps()!, 'webp')}
                    >
                      <RadioGroupItem value="webp">
                        <RadioGroupItemLabel>转为 WebP</RadioGroupItemLabel>
                      </RadioGroupItem>
                    </Show>
                  </RadioGroup>
                  <Show when={convertCaps()?.image.hint}>
                    {(hint) => helperText(hint())}
                  </Show>
                </Show>
              </div>
              <div class="flex items-start gap-2">
                <Checkbox
                  id="image-group-by-chapter"
                  class="mt-0.5"
                  checked={imageGroupByChapter()}
                  onChange={(checked) => setImageGroupByChapter(checked)}
                />
                <div class="space-y-0.5">
                  <Label for="image-group-by-chapter" class="cursor-pointer text-sm">
                    按章节分文件夹存放
                  </Label>
                  {helperText('例如「0001_第一章/001.jpg」，便于按章浏览')}
                </div>
              </div>
            </div>
          </Show>

          <Show when={kind() === 'audio'}>
            <div class="space-y-4">
              <div class="space-y-2">
                {sectionTitle('保存方式')}
                <RadioGroup
                  value={audioDelivery()}
                  onChange={(v) => setAudioDelivery(v as 'zip' | 'folder')}
                  class="gap-2"
                >
                  <RadioGroupItem value="zip">
                    <RadioGroupItemLabel>ZIP 压缩包</RadioGroupItemLabel>
                  </RadioGroupItem>
                  <Show when={isTauri()}>
                    <RadioGroupItem value="folder">
                      <RadioGroupItemLabel>保存到文件夹</RadioGroupItemLabel>
                    </RadioGroupItem>
                  </Show>
                </RadioGroup>
              </div>
              <div class="space-y-2">
                {sectionTitle('音频格式')}
                <Show
                  when={audioConvertAvailable()}
                  fallback={
                    helperText(
                      convertCaps()?.audio.hint ??
                        '将按离线缓存时的原始音频格式导出，不会转换格式或修改文件后缀',
                    )
                  }
                >
                  <RadioGroup
                    value={audioTargetFormat()}
                    onChange={(v) =>
                      setAudioTargetFormat(v as 'original' | 'mp3' | 'm4a')
                    }
                    class="gap-2"
                  >
                    <RadioGroupItem value="original">
                      <RadioGroupItemLabel>保持原格式（推荐）</RadioGroupItemLabel>
                    </RadioGroupItem>
                    <Show
                      when={supportsAudioTargetFormat(convertCaps()!, 'mp3')}
                    >
                      <RadioGroupItem value="mp3">
                        <RadioGroupItemLabel>转为 MP3</RadioGroupItemLabel>
                      </RadioGroupItem>
                    </Show>
                    <Show
                      when={supportsAudioTargetFormat(convertCaps()!, 'm4a')}
                    >
                      <RadioGroupItem value="m4a">
                        <RadioGroupItemLabel>转为 M4A</RadioGroupItemLabel>
                      </RadioGroupItem>
                    </Show>
                  </RadioGroup>
                  <Show when={convertCaps()?.audio.hint}>
                    {(hint) => helperText(hint())}
                  </Show>
                </Show>
              </div>
              <div class="flex items-start gap-2">
                <Checkbox
                  id="audio-merge-single"
                  class="mt-0.5"
                  checked={audioMergeSingle()}
                  onChange={(checked) => setAudioMergeSingle(checked)}
                />
                <div class="space-y-0.5">
                  <Label for="audio-merge-single" class="cursor-pointer text-sm">
                    合并为一个音频文件
                  </Label>
                  {helperText(
                    audioConvertAvailable()
                      ? '将所选章节内的音频段按顺序合并；若格式不一致可能无法合并'
                      : '仅当所有音频段均为相同 MP3 格式时可拼接合并',
                  )}
                </div>
              </div>
            </div>
          </Show>
        </div>

        <AppDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.exporting}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={props.exporting || !props.book}
          >
            开始导出
          </Button>
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
