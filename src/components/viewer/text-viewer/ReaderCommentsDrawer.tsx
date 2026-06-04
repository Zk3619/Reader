/**
 * 段评抽屉/面板
 * 窄屏时以 Drawer 从底部滑出，宽屏时以嵌入式面板显示在右侧
 */

import { Show } from 'solid-js';
import {
  ViewerAppDrawer,
  ViewerAppDrawerBody,
  ViewerAppDrawerCloseButton,
  ViewerAppDrawerContent,
  ViewerAppDrawerHeader,
  ViewerAppDrawerTitle,
} from '@/components/viewer/viewer-app-overlay';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export interface ReaderCommentsDrawerProps {
  /** 当前选中的段评位置：章节索引 + 段落索引（0 为章节标题，1 起为段落） */
  segment: { chapterIndex: number; segmentIndex: number } | null;
  /** 关闭回调 */
  onClose: () => void;
  /** 是否为嵌入式（宽屏右侧面板），不包 Drawer 外壳 */
  embedded?: boolean;
  /** 受控打开（窄屏 Drawer） */
  open?: boolean;
  /** 窄屏 Drawer 打开状态变更 */
  onOpenChange?: (open: boolean) => void;
}

/** 段评列表项 mock 类型，后续可对接真实 API */
export interface SegmentCommentItem {
  id: string;
  author: string;
  content: string;
  time: string;
  likeCount?: number;
}

/** 获取某段段评列表（占位：暂无真实数据源，后续可对接 API） */
function getSegmentComments(
  _chapterIndex: number,
  _segmentIndex: number
): SegmentCommentItem[] {
  return [];
}

function CommentsPanelContent(props: {
  segment: { chapterIndex: number; segmentIndex: number } | null;
  onClose: () => void;
  embedded?: boolean;
}) {
  const comments = () =>
    props.segment
      ? getSegmentComments(props.segment.chapterIndex, props.segment.segmentIndex)
      : [];

  return (
    <>
      <div
        class={cn(
          'flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2',
          props.embedded ? 'bg-muted/30' : ''
        )}
      >
        <span class="text-sm font-medium text-foreground">段评</span>
        <ViewerAppDrawerCloseButton onClick={props.onClose} aria-label="关闭段评" />
      </div>
      {/* 加 data-corvu-no-drag：此处仅滚动段评列表，不触发抽屉拖拽；拖拽仅作用于顶部把手/标题栏 */}
      <div class="flex-1 overflow-y-auto scroll-gutter-stable-both py-2 px-2 mb-4" data-corvu-no-drag>
        <Show
          when={comments().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <p>暂无段评</p>
              <p class="text-xs">段评列表占位面板；接入数据源后将显示真实评论。</p>
            </div>
          }
        >
          <ul class="space-y-3">
            {comments().map((c) => (
              <li class="rounded-md border border-border/50 bg-muted/20 p-2 text-sm">
                <div class="font-medium text-foreground">{c.author}</div>
                <p class="mt-1 text-muted-foreground">{c.content}</p>
                <div class="mt-1 text-xs text-muted-foreground">{c.time}</div>
              </li>
            ))}
          </ul>
        </Show>
      </div>
    </>
  );
}

export function ReaderCommentsDrawer(props: ReaderCommentsDrawerProps) {
  const embedded = () => props.embedded === true;

  const handleClose = () => {
    props.onClose();
    props.onOpenChange?.(false);
  };

  return (
    <Show
      when={!embedded()}
      fallback={
        <div class="flex h-full flex-col bg-background">
          <CommentsPanelContent
            segment={props.segment}
            onClose={props.onClose}
            embedded
          />
        </div>
      }
    >
      <ViewerAppDrawer
        open={props.open ?? false}
        onOpenChange={props.onOpenChange}
        snapPoints={[0, 1]}
        defaultSnapPoint={1}
      >
        {/* 仅关闭/全开两档，避免半屏时溢出按最大高度计算导致无法滚动 */}
        <ViewerAppDrawerContent
          class={cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]')}
          showNativeDragHandle={false}
        >
          <ViewerAppDrawerHeader class="sr-only" showClose={false}>
            <ViewerAppDrawerTitle>段评</ViewerAppDrawerTitle>
          </ViewerAppDrawerHeader>
          <ViewerAppDrawerBody>
            <CommentsPanelContent
              segment={props.segment}
              onClose={handleClose}
            />
          </ViewerAppDrawerBody>
        </ViewerAppDrawerContent>
      </ViewerAppDrawer>
    </Show>
  );
}
