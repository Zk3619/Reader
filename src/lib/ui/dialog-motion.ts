/**
 * Kobalte Dialog / AppDialog 进出场动画（依赖 tailwindcss-animate + data-expanded / data-closed）。
 * 与 @kobalte/core 的 solid-presence 配合：关闭时须存在 animationName 变化才会播 exit。
 */

/** 遮罩：淡入淡出 */
export const appDialogOverlayMotionClass =
  'data-expanded:animate-in data-closed:animate-out data-expanded:fade-in-0 data-closed:fade-out-0 duration-200';

/** 内容：淡入淡出 + 缩放 + 自中心滑入（与 shadcn dialog 一致） */
export const appDialogContentMotionClass =
  'data-expanded:animate-in data-closed:animate-out data-expanded:fade-in-0 data-closed:fade-out-0 data-expanded:zoom-in-95 data-closed:zoom-out-95 data-expanded:slide-in-from-left-1/2 data-expanded:slide-in-from-top-[48%] data-closed:slide-out-to-left-1/2 data-closed:slide-out-to-top-[48%] duration-200';
