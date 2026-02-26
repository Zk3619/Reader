/**
 * 应用级 Toast 通知组件
 * 基于 components/ui/toast 的基础组件，提供：
 * - 流畅的进入/退出动画
 * - 可选的进度条显示
 * - 统一的 Toast 体验
 */

import type { JSX } from "solid-js"
import { createSignal, Show, onMount } from "solid-js"
import * as ToastPrimitive from "@kobalte/core/toast"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  type ToastVariant,
} from "@/components/ui/toast"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"

const KEY_PERMANENT = "reader.immersiveToastDismissed"
const KEY_UNTIL = "reader.immersiveToastDismissedUntil"
const KEY_SESSION = "reader.immersiveToastDismissedSession"
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type ImmersiveToastChoice = "session" | "week" | "permanent" | ""

function persistChoice(choice: ImmersiveToastChoice) {
  if (typeof localStorage === "undefined" && typeof sessionStorage === "undefined") return
  switch (choice) {
    case "session":
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY_SESSION, "1")
      break
    case "week":
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(KEY_UNTIL, String(Date.now() + ONE_WEEK_MS))
      }
      break
    case "permanent":
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY_PERMANENT, "1")
      break
    default:
      break
  }
}

export function shouldShowImmersiveEnterToast(): boolean {
  if (typeof localStorage !== "undefined" && localStorage.getItem(KEY_PERMANENT) === "1") {
    return false
  }
  if (typeof localStorage !== "undefined") {
    const until = localStorage.getItem(KEY_UNTIL)
    if (until) {
      const t = Number(until)
      if (!Number.isNaN(t) && Date.now() < t) return false
    }
  }
  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(KEY_SESSION) === "1") {
    return false
  }
  return true
}

/**
 * 通用 Toast 通知函数
 * @param props Toast 配置选项
 * - title/description: 简单的标题和描述（与 children 互斥）
 * - children: 自定义内容（优先级高于 title/description）
 * - variant: Toast 样式变体
 * - duration: 显示时长（毫秒），persistent 为 true 时无效
 * - persistent: 是否持久显示（不自动关闭）
 * - showProgress: 是否显示进度条（仅在非持久化时有效）
 */
export function showAppToast(props: {
  title?: JSX.Element
  description?: JSX.Element
  children?: JSX.Element
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
  showProgress?: boolean
}) {
  ToastPrimitive.toaster.show((data) => {
    const duration = props.duration ?? 5000
    const showProgress = props.showProgress ?? false
    const hasCustomContent = !!props.children
    
    return (
      <div class="toast-wrapper">
        <AnimatedToastWrapper
          toastId={data.toastId}
          variant={props.variant ?? "default"}
          persistent={props.persistent}
          duration={props.persistent ? undefined : duration}
        >
          {hasCustomContent ? (
            props.children
          ) : (
            <div class="grid gap-1">
              {props.title && <ToastTitle>{props.title}</ToastTitle>}
              {props.description && <ToastDescription>{props.description}</ToastDescription>}
            </div>
          )}
          <Show when={showProgress && !props.persistent && duration > 0}>
            <ToastProgressBar duration={duration} />
          </Show>
          <ToastClose />
        </AnimatedToastWrapper>
      </div>
    )
  })
}

/**
 * Toast 进度条组件
 * 通过 ref 设置 CSS 变量，避免内联样式
 */
function ToastProgressBar(props: { duration: number }) {
  let progressBarRef: HTMLDivElement | undefined

  onMount(() => {
    if (progressBarRef) {
      progressBarRef.style.setProperty('--toast-duration', `${props.duration}ms`)
    }
  })

  return (
    <div 
      ref={progressBarRef}
      class="absolute bottom-0 left-0 h-0.5 bg-current/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 toast-progress-bar"
    />
  )
}

/**
 * 带动画的 Toast 包装组件
 * 通过 CSS 类 toast-animated 配合 App.css 中的 @keyframes 实现流畅动画
 */
function AnimatedToastWrapper(props: {
  toastId: number
  variant?: ToastVariant
  persistent?: boolean
  duration?: number
  children?: JSX.Element
}) {
  return (
    <Toast 
      toastId={props.toastId} 
      variant={props.variant}
      persistent={props.persistent}
      duration={props.duration}
      class="toast-enhanced toast-animated"
    >
      {props.children}
    </Toast>
  )
}

/**
 * 沉浸模式进入提示 Toast
 * 使用通用组件 showAppToast，保持统一的动画和样式
 */
export function showImmersiveEnterToast() {
  showAppToast({
    variant: "default",
    persistent: true,
    children: (
      <ImmersiveToastContent />
    ),
  })
}

/**
 * 沉浸模式 Toast 内容组件
 * 需要在组件内部管理状态，所以单独提取
 */
function ImmersiveToastContent() {
  const [choice, setChoice] = createSignal<ImmersiveToastChoice>("")
  
  return (
    <div class="grid gap-2">
      <ToastTitle>已进入沉浸模式</ToastTitle>
      <ToastDescription>可按 ESC 键退出</ToastDescription>
      <RadioGroup
        value={choice()}
        onChange={(value: string) => {
          const choiceValue = value as ImmersiveToastChoice
          setChoice(choiceValue)
          persistChoice(choiceValue)
        }}
        class="grid gap-2 pt-1"
      >
        <RadioGroupItem value="session">
          <RadioGroupItemLabel class="cursor-pointer font-normal">
            下次启动前不再提示
          </RadioGroupItemLabel>
        </RadioGroupItem>
        <RadioGroupItem value="week">
          <RadioGroupItemLabel class="cursor-pointer font-normal">
            近期（一周）不再提示
          </RadioGroupItemLabel>
        </RadioGroupItem>
        <RadioGroupItem value="permanent">
          <RadioGroupItemLabel class="cursor-pointer font-normal">
            不再提示
          </RadioGroupItemLabel>
        </RadioGroupItem>
      </RadioGroup>
    </div>
  )
}
