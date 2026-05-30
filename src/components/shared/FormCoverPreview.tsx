/**
 * 表单对话框封面预览（固定 3:4 比例，防止大图撑破布局）
 */

import { createSignal, Show, createEffect } from 'solid-js';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { cn } from '@/lib/utils';
import { ImageIcon, AlertCircleIcon, BookCoverIcon } from '@/components/shared/icons';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';

const COVER_PREVIEW_MAX_W = 'max-w-64';

export function FormCoverPreview(props: {
  cover: () => string | undefined;
  onPickCover: () => void | Promise<void>;
  class?: string;
}) {
  const previewInfo = () => getCoverPreviewInfo(props.cover());
  const [imageError, setImageError] = createSignal(false);

  createEffect(() => {
    props.cover();
    setImageError(false);
  });

  const frameClass = cn(
    'relative mx-auto w-full shrink-0 overflow-hidden rounded-lg border bg-muted',
    COVER_PREVIEW_MAX_W,
    props.class,
  );

  return (
    <AspectRatio ratio={3 / 4} class={frameClass}>
      <button
        type="button"
        onClick={props.onPickCover}
        class="absolute inset-0 flex items-center justify-center overflow-hidden transition-colors hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <Show
          when={props.cover()?.trim()}
          fallback={
            <div class="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageIcon class="h-8 w-8" size={32} />
              <span>点击选择封面</span>
            </div>
          }
        >
          {(() => {
            const info = previewInfo();
            const cover = props.cover();
            if (!info.isValid) {
              return (
                <div class="flex flex-col items-center justify-center gap-2 px-2 text-sm text-destructive">
                  <AlertCircleIcon class="h-8 w-8" size={32} />
                  <span class="text-center">
                    {info.type === 'invalid' && cover?.startsWith('http') ? 'URL 格式错误' : '无效的输入'}
                  </span>
                </div>
              );
            }
            if (info.type === 'emoji') {
              return (
                <div class="flex h-full w-full items-center justify-center overflow-hidden text-4xl leading-none">
                  {cover}
                </div>
              );
            }
            if (info.url && !imageError()) {
              return (
                <img
                  src={info.url}
                  alt="封面预览"
                  class="absolute inset-0 h-full w-full object-cover"
                  onError={() => setImageError(true)}
                />
              );
            }
            if (imageError()) {
              return (
                <div class="flex flex-col items-center justify-center gap-2 px-2 text-sm text-destructive">
                  <AlertCircleIcon class="h-8 w-8" size={32} />
                  <span class="text-center">图片加载失败</span>
                </div>
              );
            }
            return (
              <div class="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <BookCoverIcon class="h-8 w-8" size={32} />
              </div>
            );
          })()}
        </Show>
      </button>
    </AspectRatio>
  );
}
