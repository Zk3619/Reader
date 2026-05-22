/**
 * 应用级 Toast 通知（基于 solid-sonner）
 */

import type { JSX } from "solid-js"
import { createSignal, onCleanup, onMount } from "solid-js"
import { toast, type ExternalToast } from "solid-sonner"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

const KEY_PERMANENT = "reader.immersiveToastDismissed"
const KEY_UNTIL = "reader.immersiveToastDismissedUntil"
const KEY_SESSION = "reader.immersiveToastDismissedSession"
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type ImmersiveToastChoice = "session" | "week" | "permanent" | ""

export type ToastVariant = "default" | "destructive" | "success" | "warning" | "error"

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

const APP_TOAST_CLASS = "reader-app-toast group"

/** 非 persistent 通知的默认自动关闭时长（毫秒） */
export const DEFAULT_TOAST_DURATION = 3000

/**
 * 修复 solid-sonner 在 toast 上 pointer capture 后，若 pointerup 发生在容器外，
 * 内部 interacting 无法复位、悬停暂停一直生效导致通知永不自动关闭的问题。
 */
export function SonnerInteractionFix() {
  onMount(() => {
    const reset = (e: PointerEvent) => {
      // 仅响应真实指针事件；合成 pointerup 会冒泡回 window，否则会无限递归
      if (!e.isTrusted) return
      document.querySelectorAll("[data-sonner-toaster]").forEach((el) => {
        el.dispatchEvent(new PointerEvent("pointerup", { bubbles: false }))
      })
    }
    window.addEventListener("pointerup", reset)
    window.addEventListener("pointercancel", reset)
    onCleanup(() => {
      window.removeEventListener("pointerup", reset)
      window.removeEventListener("pointercancel", reset)
    })
  })
  return null
}

function toastOptions(props: {
  description?: JSX.Element
  duration?: number
  persistent?: boolean
  showProgress?: boolean
}): ExternalToast {
  const duration = props.persistent ? Number.POSITIVE_INFINITY : (props.duration ?? DEFAULT_TOAST_DURATION)
  const showProgress =
    (props.showProgress ?? false) &&
    !props.persistent &&
    Number.isFinite(duration) &&
    duration > 0

  const options: ExternalToast = {
    duration,
    closeButton: true,
    class: cn(APP_TOAST_CLASS, showProgress && "reader-app-toast--progress"),
  }

  if (showProgress) {
    options.style = { "--toast-duration": `${duration}ms` }
  }

  const description = withToastProgress(props.description, duration, showProgress)
  if (description) {
    options.description = description
  }

  return options
}

function withToastProgress(
  description: JSX.Element | undefined,
  duration: number,
  showProgress: boolean,
): JSX.Element | undefined {
  if (!showProgress) return description
  // 勿使用带 onMount 的组件：description 在 showAppToast 调用处构建（常在 async 回调里），
  // 不在应用 createRoot 内，会导致 "computations created outside createRoot" 警告。
  return (
    <>
      {description}
      <div
        class="toast-progress-bar pointer-events-none h-0.5 w-full shrink-0 bg-current/30"
        style={{ "--toast-duration": `${duration}ms` }}
        aria-hidden
      />
    </>
  )
}

function resolveMessage(props: { title?: JSX.Element; description?: JSX.Element }): JSX.Element | string {
  if (props.title) return props.title
  if (props.description) return props.description
  return ""
}

/** 书源脚本 toast 固定 id：新消息替换旧内容，避免多条高卡片堆叠错乱 */
const READER_SCRIPT_TOAST_ID = "reader-script-toast"

/** 书源脚本框线输出：保留行首/段前空行，仅规整制表符与行尾空白 */
function normalizeScriptToastText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "    ").trimEnd()
}

/**
 * 书源脚本 longToast / checkStatus 等多行框线输出。
 * 使用标准 toast（data-styled）参与 Sonner 堆叠；固定 id 避免多条高卡片并存。
 */
export function showScriptToast(text: string, options?: { duration?: number }) {
  const body = normalizeScriptToastText(text)
  if (!body) return

  const duration = options?.duration ?? 20_000

  toast(body, {
    id: READER_SCRIPT_TOAST_ID,
    duration,
    closeButton: true,
    class: "reader-script-toast select-none",
    classNames: {
      toast: "reader-script-toast-shell select-none",
      title: "reader-script-toast-text select-none",
    },
  })
}

/**
 * 通用 Toast 通知函数
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
  if (props.children) {
    toast.custom(() => props.children!, toastOptions(props))
    return
  }

  const message = resolveMessage(props)
  if (!message) return

  const options = toastOptions({
    description: props.title && props.description ? props.description : undefined,
    duration: props.duration,
    persistent: props.persistent,
    showProgress: props.showProgress,
  })

  const variant = props.variant ?? "default"
  switch (variant) {
    case "success":
      toast.success(message, options)
      break
    case "warning":
      toast.warning(message, options)
      break
    case "error":
    case "destructive":
      toast.error(message, options)
      break
    default:
      toast(message, options)
  }
}

export function showImmersiveEnterToast() {
  toast.custom(() => <ImmersiveToastContent />, {
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    class: APP_TOAST_CLASS,
  })
}

function ImmersiveToastContent() {
  const [choice, setChoice] = createSignal<ImmersiveToastChoice>("")

  return (
    <div class="grid w-full min-w-[280px] gap-2">
      <p class="text-sm font-medium leading-none">已进入沉浸模式</p>
      <p class="text-sm text-muted-foreground">可按 ESC 键退出</p>
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
