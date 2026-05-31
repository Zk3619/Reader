/**
 * 应用级 Toast 通知（基于 solid-sonner）
 * 布局：默认左侧 variant 图标 + 右侧标题/描述；variant plain 无图标；底部可绑定时长或数值进度条。
 */

import type { JSX } from "solid-js"
import { createSignal, onCleanup, onMount } from "solid-js"
import { toast, type ExternalToast, type ToasterProps } from "solid-sonner"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-solid"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

const KEY_PERMANENT = "reader.immersiveToastDismissed"
const KEY_UNTIL = "reader.immersiveToastDismissedUntil"
const KEY_SESSION = "reader.immersiveToastDismissedSession"
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export type ImmersiveToastChoice = "session" | "week" | "permanent" | ""

/** 对外变体；destructive / warn 为兼容别名；plain / none 为无左侧图标 */
export type ToastVariant =
  | "default"
  | "plain"
  | "none"
  | "success"
  | "info"
  | "warning"
  | "warn"
  | "error"
  | "destructive"

type ResolvedToastVariant = "default" | "plain" | "success" | "info" | "warning" | "error"

export type ToastProgressInput =
  | boolean
  | number
  | { mode: "duration"; ms?: number }
  | { mode: "value"; value: number }

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

/** 非 persistent 通知的默认自动关闭时长（毫秒）；悬停暂停后按剩余时间继续（Sonner 原生行为） */
export const DEFAULT_TOAST_DURATION = 3000

/** Toast 最大宽度（dvw） */
export const APP_TOAST_MAX_WIDTH = "min(26.25rem, calc(100dvw - 2rem))"

/** Toast 最大高度（dvh） */
export const APP_TOAST_MAX_HEIGHT = "min(80dvh, 28rem)"

/** 展开后内容区最大高度（dvh） */
export const APP_TOAST_CONTENT_MAX_HEIGHT = "min(calc(80dvh - 2rem), calc(28rem - 2rem))"

/** 挂到 `.reader-toast-host` 的 CSS 变量，供 App.css 约束宽高 */
export function appToastHostStyle(): Record<string, string> {
  return {
    "--reader-app-toast-max-width": APP_TOAST_MAX_WIDTH,
    "--reader-app-toast-max-height": APP_TOAST_MAX_HEIGHT,
    "--reader-app-toast-content-max-height": APP_TOAST_CONTENT_MAX_HEIGHT,
  }
}

/** 书架批量更新目录进行中的 toast（数值进度条；完成后须 dismiss） */
export const UPDATE_TOC_TOAST_ID = "reader-update-toc-toast"

export function dismissAppToast(id?: string | number) {
  toast.dismiss(id)
}

const valueProgressFills = new Map<string | number, HTMLDivElement>()

/** 更新固定 id 的数值进度条（0–1 为已完成比例）；须先 showAppToast({ id, progress: number }) */
export function updateAppToastProgress(toastId: string | number, value: number) {
  const fill = valueProgressFills.get(toastId)
  if (!fill) return
  const v = Math.min(1, Math.max(0, value))
  fill.style.width = `${(1 - v) * 100}%`
}

type ResolvedToastProgress = { mode: "duration"; ms: number } | { mode: "value"; value: number }

function normalizeVariant(variant?: ToastVariant): ResolvedToastVariant {
  switch (variant) {
    case "plain":
    case "none":
      return "plain"
    case "success":
      return "success"
    case "info":
      return "info"
    case "warning":
    case "warn":
      return "warning"
    case "error":
    case "destructive":
      return "error"
    default:
      return "default"
  }
}

type ToastIcons = NonNullable<ToasterProps["icons"]>

/** 须在 App 根组件 render 内调用，供 Toaster icons 使用（勿在 async 回调里创建 JSX） */
export function createAppToastIcons(): ToastIcons {
  const cls = "size-5 shrink-0"
  return {
    success: <CircleCheck class={cn(cls, "text-emerald-600 dark:text-emerald-500")} aria-hidden />,
    info: <Info class={cn(cls, "text-sky-600 dark:text-sky-500")} aria-hidden />,
    warning: <TriangleAlert class={cn(cls, "text-amber-600 dark:text-amber-500")} aria-hidden />,
    error: <CircleAlert class={cn(cls, "text-destructive")} aria-hidden />,
  }
}

function resolveProgress(
  progress: ToastProgressInput | undefined,
  duration: number,
): ResolvedToastProgress | null {
  if (progress === undefined || progress === false) {
    return null
  }
  if (progress === true) return { mode: "duration", ms: duration }
  if (typeof progress === "number") {
    const v = Math.min(1, Math.max(0, progress))
    return { mode: "value", value: v }
  }
  if (progress.mode === "value") {
    return { mode: "value", value: Math.min(1, Math.max(0, progress.value)) }
  }
  return { mode: "duration", ms: progress.ms ?? duration }
}

/**
 * 修复 solid-sonner 在 toast 上 pointer capture 后，若 pointerup 发生在容器外，
 * 内部 interacting 无法复位、悬停暂停一直生效导致通知永不自动关闭的问题。
 */
export function SonnerInteractionFix() {
  onMount(() => {
    const reset = (e: PointerEvent) => {
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
  id?: string | number
  script?: boolean
  progress?: ResolvedToastProgress | null
  noIcon?: boolean
}): ExternalToast {
  const duration = props.persistent ? Number.POSITIVE_INFINITY : (props.duration ?? DEFAULT_TOAST_DURATION)
  const hasProgress = props.progress != null

  const options: ExternalToast = {
    id: props.id,
    duration,
    closeButton: true,
    class: cn(
      APP_TOAST_CLASS,
      hasProgress && "reader-app-toast--progress",
      props.noIcon && "reader-app-toast--plain",
    ),
    classNames: props.script
      ? { title: "whitespace-pre-wrap font-mono text-xs", description: "whitespace-pre-wrap font-mono text-xs" }
      : undefined,
  }

  if (props.description) {
    options.description = props.description
  }

  return options
}

const progressBarCleanups = new WeakMap<HTMLElement, () => void>()

/** 纯 DOM 进度条，避免在 Sonner description 内挂载 Solid 生命周期 */
function mountToastProgressBar(
  host: HTMLElement,
  progress: ResolvedToastProgress,
  toastId?: string | number,
) {
  progressBarCleanups.get(host)?.()
  host.replaceChildren()

  const track = document.createElement("div")
  track.className =
    "toast-progress-track pointer-events-none mt-1 h-0.5 w-full shrink-0 overflow-hidden rounded-full bg-current/20"
  track.setAttribute("aria-hidden", "true")
  const fill = document.createElement("div")
  fill.className = "toast-progress-fill h-full rounded-full bg-current/45"
  track.appendChild(fill)
  host.appendChild(track)

  if (progress.mode === "value") {
    const v = Math.min(1, Math.max(0, progress.value))
    fill.style.width = `${(1 - v) * 100}%`
    if (toastId != null) {
      valueProgressFills.set(toastId, fill)
      progressBarCleanups.set(host, () => {
        valueProgressFills.delete(toastId)
      })
    }
    return
  }

  const duration = progress.ms
  if (!Number.isFinite(duration) || duration <= 0) return

  const toastEl = host.closest("[data-sonner-toast]") as HTMLElement | null
  const toasterEl = toastEl?.closest("[data-sonner-toaster]") as HTMLElement | null

  const startTime = performance.now()
  let accumulatedPause = 0
  let pausedAt = 0
  let paused = false
  let rafId = 0

  const setPaused = (next: boolean) => {
    if (next === paused) return
    if (next) pausedAt = performance.now()
    else accumulatedPause += performance.now() - pausedAt
    paused = next
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return
    if ((e.target as HTMLElement).closest("button")) return
    setPaused(true)
  }
  const onPointerUp = () => setPaused(false)
  const onToasterEnter = () => setPaused(true)
  const onToasterLeave = (e: PointerEvent) => {
    if (toasterEl && e.relatedTarget instanceof Node && toasterEl.contains(e.relatedTarget)) return
    setPaused(false)
  }

  toastEl?.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerUp)
  toasterEl?.addEventListener("pointerenter", onToasterEnter)
  toasterEl?.addEventListener("pointerleave", onToasterLeave)

  const tick = () => {
    const now = performance.now()
    let elapsed = now - startTime - accumulatedPause
    if (paused) elapsed -= now - pausedAt
    const ratio = Math.max(0, Math.min(1, 1 - elapsed / duration))
    fill.style.width = `${ratio * 100}%`
    if (elapsed < duration) rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  const cleanup = () => {
    cancelAnimationFrame(rafId)
    toastEl?.removeEventListener("pointerdown", onPointerDown)
    window.removeEventListener("pointerup", onPointerUp)
    window.removeEventListener("pointercancel", onPointerUp)
    toasterEl?.removeEventListener("pointerenter", onToasterEnter)
    toasterEl?.removeEventListener("pointerleave", onToasterLeave)
  }
  progressBarCleanups.set(host, cleanup)
}

type DescriptionBodyProps = {
  description?: JSX.Element
  script?: boolean
  progress: ResolvedToastProgress | null
  toastId?: string | number
}

/** 在 Sonner Toast 渲染树内再构建 description，避免 async 回调里创建无法 dispose 的 computation */
function lazyDescriptionBody(props: DescriptionBodyProps): (() => JSX.Element) | undefined {
  const hasDesc = props.description != null && props.description !== false && props.description !== ""
  const hasProgress = props.progress != null
  if (!hasDesc && !hasProgress) return undefined
  return () => buildDescriptionBody(props)
}

function buildDescriptionBody(props: DescriptionBodyProps): JSX.Element {
  const hasDesc = props.description != null && props.description !== false && props.description !== ""
  const progress = props.progress

  return (
    <div class="flex min-w-0 flex-col gap-1">
      {hasDesc ? (
        <div class={cn("text-sm text-muted-foreground", props.script && "whitespace-pre-wrap font-mono text-xs")}>
          {props.description}
        </div>
      ) : null}
      {progress ? (
        <div ref={(el) => el && mountToastProgressBar(el, progress, props.toastId)} />
      ) : null}
    </div>
  )
}

/** 书源脚本框线输出：保留行首/段前空行，仅规整制表符与行尾空白 */
export function normalizeScriptToastText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, "    ").trimEnd()
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
  progress?: ToastProgressInput
  /** 固定 id，用于脚本 toast 等需要替换上一条的场景 */
  id?: string | number
  /** 书源脚本等多行等宽排版 */
  script?: boolean
}) {
  if (props.children) {
    const childDuration = props.persistent
      ? Number.POSITIVE_INFINITY
      : (props.duration ?? DEFAULT_TOAST_DURATION)
    toast.custom(
      () => props.children!,
      toastOptions({
        duration: props.duration,
        persistent: props.persistent,
        id: props.id,
        script: props.script,
        progress: resolveProgress(props.progress, childDuration),
      }),
    )
    return
  }

  const variant = normalizeVariant(props.variant)
  const duration = props.persistent ? Number.POSITIVE_INFINITY : (props.duration ?? DEFAULT_TOAST_DURATION)
  const progress = resolveProgress(props.progress, duration)

  const hasTitle = props.title != null && props.title !== ""
  const hasDescField = props.description != null && props.description !== ""

  if (!hasTitle && !hasDescField && !progress) return

  const noIcon = variant === "plain"
  const options = toastOptions({
    description: undefined,
    duration: props.duration,
    persistent: props.persistent,
    id: props.id,
    script: props.script,
    progress,
    noIcon,
  })
  let toastMessage: JSX.Element | string
  let toastDescription: (() => JSX.Element) | undefined

  const bodyProps = (): DescriptionBodyProps => ({
    description: hasDescField ? props.description : undefined,
    script: props.script,
    progress,
    toastId: props.id,
  })

  if (hasTitle) {
    toastMessage = props.title!
    toastDescription = hasDescField || progress ? lazyDescriptionBody(bodyProps()) : undefined
  } else if (hasDescField) {
    toastMessage = props.description!
    toastDescription = progress
      ? lazyDescriptionBody({ script: props.script, progress, toastId: props.id })
      : undefined
  } else {
    toastMessage = " "
    toastDescription = lazyDescriptionBody({ script: props.script, progress, toastId: props.id })
  }

  if (toastMessage === "" || (toastMessage === " " && !toastDescription)) return

  const payload = { ...options, description: toastDescription }

  switch (variant) {
    case "plain":
      toast(toastMessage, { ...payload, icon: null })
      break
    case "success":
      toast.success(toastMessage, payload)
      break
    case "info":
      toast.info(toastMessage, payload)
      break
    case "warning":
      toast.warning(toastMessage, payload)
      break
    case "error":
      toast.error(toastMessage, payload)
      break
    default:
      toast.info(toastMessage, payload)
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
