/**
 * 应用级 Toast 通知（基于 solid-sonner）
 * 布局：默认左侧 variant 图标 + 右侧标题/描述；variant plain 无图标；底部可绑定时长或数值进度条。
 */

import type { JSX } from "solid-js"
import { createMemo, createRoot, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { toast, type ExternalToast, type ToasterProps } from "solid-sonner"
import * as ToastPrimitive from "@kobalte/core/toast"
import type { ToastSwipeDirection } from "@kobalte/core/toast"
import { Toaster } from "@/components/ui/sonner"
import {
  Toast as KobalteToast,
  ToastClose,
  ToastDescription,
  ToastTitle,
  type ToastVariant as KobalteToastVariant,
} from "@/components/ui/toast"
import { APP_TOAST_Z } from "@/lib/ui/overlay-z"
import {
  appToastSwipeDirections,
  KOBALTE_TOAST_REGION_ID,
  kobalteToastSwipeDirection,
  normalizeAppToastPosition,
  normalizeAppToastStyle,
  toastListPositionClass,
  type AppToastPosition,
} from "@/lib/ui/app-toast-config"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-solid"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"
import { isMobile } from "@/lib/platform/detect"
import { cn } from "@/lib/utils"
import { settingsState } from "@/stores/settings"

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

/** Sonner 标准风格：不含 reader-app-toast 增强 class */
const SONNER_MINIMAL_TOAST_OPTIONS: ToasterProps["toastOptions"] = {
  classes: {
    toast:
      "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
    description: "group-[.toast]:text-muted-foreground",
    actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
    cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
  },
}

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

const DESKTOP_MAX_VISIBLE_TOASTS = 3

/** 脚本通知 toast id 前缀（用于流式槽位分组与批量收起） */
export const SCRIPT_NOTICE_TOAST_ID_PREFIX = 'reader-script-notice:'

let toastSlotSerial = 0
let mobileActiveToastId: string | number | undefined
const desktopToastIds: (string | number)[] = []
let mobileActiveScriptToastId: string | number | undefined
const desktopScriptToastIds: (string | number)[] = []

const kobalteExternalIdMap = new Map<string | number, number>()
const kobalteReverseIdMap = new Map<number, string | number>()

function getActiveToastStyle() {
  return normalizeAppToastStyle(settingsState.app.toastStyle)
}

function getActiveToastPosition(): AppToastPosition {
  return normalizeAppToastPosition(settingsState.app.toastPosition)
}

function releaseKobalteMapping(externalId: string | number): void {
  const kobalteId = kobalteExternalIdMap.get(externalId)
  if (kobalteId != null) {
    kobalteExternalIdMap.delete(externalId)
    kobalteReverseIdMap.delete(kobalteId)
  }
}

function registerKobalteMapping(externalId: string | number, kobalteId: number): void {
  kobalteExternalIdMap.set(externalId, kobalteId)
  kobalteReverseIdMap.set(kobalteId, externalId)
}

function dismissToastByExternalId(id: string | number): void {
  if (getActiveToastStyle() === "toast") {
    const kobalteId = kobalteExternalIdMap.get(id)
    if (kobalteId != null) {
      ToastPrimitive.toaster.dismiss(kobalteId)
      releaseKobalteMapping(id)
    }
  } else {
    toast.dismiss(id)
  }
  releaseToastSlot(id)
}

function isScriptNoticeToastId(id: string | number): boolean {
  return String(id).startsWith(SCRIPT_NOTICE_TOAST_ID_PREFIX)
}

/** Sonner `visibleToasts`：移动端 1 条，桌面端 3 条 */
export function getAppToastVisibleLimit(): number {
  return isMobile() ? 1 : DESKTOP_MAX_VISIBLE_TOASTS
}

function isToastSlotExempt(id: string | number): boolean {
  return id === UPDATE_TOC_TOAST_ID
}

function releaseToastSlot(id: string | number): void {
  if (isToastSlotExempt(id)) return
  if (isScriptNoticeToastId(id)) {
    if (mobileActiveScriptToastId === id) mobileActiveScriptToastId = undefined
    const sIdx = desktopScriptToastIds.indexOf(id)
    if (sIdx >= 0) desktopScriptToastIds.splice(sIdx, 1)
    return
  }
  if (mobileActiveToastId === id) mobileActiveToastId = undefined
  const idx = desktopToastIds.indexOf(id)
  if (idx >= 0) desktopToastIds.splice(idx, 1)
}

function syncToastQueue(queue: (string | number)[]): void {
  const active = new Set(toast.getToasts().map((t) => t.id))
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!active.has(queue[i]!)) {
      queue.splice(i, 1)
    }
  }
}

function claimStreamToastSlot(
  id: string | number,
  mobileActive: { current: string | number | undefined },
  desktopQueue: (string | number)[],
): void {
  const limit = getAppToastVisibleLimit()

  if (isMobile()) {
    if (mobileActive.current != null && mobileActive.current !== id) {
      const prev = mobileActive.current
      dismissToastByExternalId(prev)
    }
    mobileActive.current = id
    return
  }

  syncToastQueue(desktopQueue)
  if (!desktopQueue.includes(id)) {
    desktopQueue.push(id)
  }
  while (desktopQueue.length > limit) {
    const oldest = desktopQueue.shift()
    if (oldest != null && oldest !== id) {
      dismissToastByExternalId(oldest)
    }
  }
}

/**
 * 流式槽位：新通知插入队尾并上顶；满员时 dismiss 队首（视觉最上方/最旧）再入队。
 * 移动端上限 1（新条顶替当前条并退场）；桌面端上限 3。
 */
function claimToastSlot(requestedId?: string | number): string | number {
  const id =
    requestedId ?? `reader-app-toast-${Date.now()}-${++toastSlotSerial}`

  if (isToastSlotExempt(id)) {
    return id
  }

  if (isScriptNoticeToastId(id)) {
    claimStreamToastSlot(id, { get current() { return mobileActiveScriptToastId }, set current(v) { mobileActiveScriptToastId = v } }, desktopScriptToastIds)
    return id
  }

  claimStreamToastSlot(id, { get current() { return mobileActiveToastId }, set current(v) { mobileActiveToastId = v } }, desktopToastIds)
  return id
}

export function dismissAppToast(id?: string | number) {
  if (id == null) {
    if (getActiveToastStyle() === "toast") {
      ToastPrimitive.toaster.clear()
      kobalteExternalIdMap.clear()
      kobalteReverseIdMap.clear()
    } else {
      toast.dismiss()
    }
    mobileActiveToastId = undefined
    desktopToastIds.length = 0
    mobileActiveScriptToastId = undefined
    desktopScriptToastIds.length = 0
    return
  }
  dismissToastByExternalId(id)
}

/** 收起所有脚本通知总线弹出的 toast（如关闭登录弹窗） */
export function dismissScriptNoticeToasts(): void {
  if (getActiveToastStyle() === "toast") {
    for (const [kobalteId, externalId] of kobalteReverseIdMap.entries()) {
      if (String(externalId).startsWith(SCRIPT_NOTICE_TOAST_ID_PREFIX)) {
        ToastPrimitive.toaster.dismiss(kobalteId)
        releaseKobalteMapping(externalId)
        releaseToastSlot(externalId)
      }
    }
    return
  }
  for (const t of toast.getToasts()) {
    const toastId = t.id
    if (toastId != null && String(toastId).startsWith(SCRIPT_NOTICE_TOAST_ID_PREFIX)) {
      dismissAppToast(toastId)
    }
  }
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

const TOAST_ICON_CLASS = "size-5 shrink-0"

/** 每条 toast 须单独创建 icon，不可复用 Toaster 级同一 JSX（Solid 会挪 DOM，堆叠时仅最新一条有图标） */
export function createAppToastIcon(
  variant: "success" | "info" | "warning" | "error",
): JSX.Element {
  switch (variant) {
    case "success":
      return (
        <CircleCheck
          class={cn(TOAST_ICON_CLASS, "text-emerald-600 dark:text-emerald-500")}
          aria-hidden
        />
      )
    case "info":
      return <Info class={cn(TOAST_ICON_CLASS, "text-sky-600 dark:text-sky-500")} aria-hidden />
    case "warning":
      return (
        <TriangleAlert
          class={cn(TOAST_ICON_CLASS, "text-amber-600 dark:text-amber-500")}
          aria-hidden
        />
      )
    case "error":
      return <CircleAlert class={cn(TOAST_ICON_CLASS, "text-destructive")} aria-hidden />
  }
}

function resolvePerToastIcon(variant: ResolvedToastVariant): JSX.Element | null {
  if (variant === "plain") return null
  if (variant === "default") return createAppToastIcon("info")
  return createAppToastIcon(variant)
}

let cachedAppToastIcons: ToastIcons | undefined

/** 供 Toaster 默认 icons（单条 toast 仍应走 resolvePerToastIcon 注入独立 icon） */
export function createAppToastIcons(): ToastIcons {
  if (cachedAppToastIcons) return cachedAppToastIcons
  createRoot(() => {
    cachedAppToastIcons = {
      success: createAppToastIcon("success"),
      info: createAppToastIcon("info"),
      warning: createAppToastIcon("warning"),
      error: createAppToastIcon("error"),
    }
  })
  return cachedAppToastIcons!
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

/** 与 `applyThemeToDocument` 写入的 `html.dark` 同步，避免 Sonner `theme="system"` 只看 OS 偏好 */
export function useToastTheme(): () => "light" | "dark" {
  const [isDark, setIsDark] = createSignal(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )

  onMount(() => {
    const sync = () => setIsDark(document.documentElement.classList.contains("dark"))
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    onCleanup(() => observer.disconnect())
    sync()
  })

  return () => (isDark() ? "dark" : "light")
}

export type AppToastHostProps = {
  icons: NonNullable<ToasterProps["icons"]>
}

function SonnerAppToastHost(props: AppToastHostProps) {
  const theme = useToastTheme()
  const useMinimalSonner = createMemo(
    () => normalizeAppToastStyle(settingsState.app.toastStyle) === "sonner",
  )
  const position = createMemo(() => getActiveToastPosition())
  const visibleLimit = createMemo(() => getAppToastVisibleLimit())

  return (
    <div class="reader-toast-host" data-kb-top-layer style={appToastHostStyle()}>
      <SonnerInteractionFix />
      <Toaster
        duration={DEFAULT_TOAST_DURATION}
        theme={theme()}
        position={position()}
        expand={visibleLimit() > 1}
        visibleToasts={visibleLimit()}
        closeButton
        richColors={false}
        toastOptions={useMinimalSonner() ? SONNER_MINIMAL_TOAST_OPTIONS : undefined}
        icons={props.icons}
        swipeDirections={appToastSwipeDirections(position())}
        class={APP_TOAST_Z}
      />
    </div>
  )
}

function KobalteAppToastHost() {
  const position = createMemo(() => getActiveToastPosition())
  const visibleLimit = createMemo(() => getAppToastVisibleLimit())
  const swipeDirection = createMemo((): ToastSwipeDirection =>
    kobalteToastSwipeDirection(position()),
  )

  return (
    <div class="reader-toast-host reader-kobalte-toast-host" data-kb-top-layer>
      <Portal>
        <ToastPrimitive.Region
          regionId={KOBALTE_TOAST_REGION_ID}
          limit={visibleLimit()}
          duration={DEFAULT_TOAST_DURATION}
          swipeDirection={swipeDirection()}
        >
          <ToastPrimitive.List
            class={cn(toastListPositionClass(position()), APP_TOAST_Z)}
          />
        </ToastPrimitive.Region>
      </Portal>
    </div>
  )
}

/** Portal 到 body 的全局 Toaster 宿主（须与应用主题一致） */
export function AppToastHost(props: AppToastHostProps) {
  const useKobalte = createMemo(() => getActiveToastStyle() === "toast")

  return (
    <Portal mount={document.body}>
      <Show when={useKobalte()} fallback={<SonnerAppToastHost icons={props.icons} />}>
        <KobalteAppToastHost />
      </Show>
    </Portal>
  )
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
    ...(props.id != null ? { id: props.id } : {}),
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

function mapKobalteVariant(variant: ResolvedToastVariant): KobalteToastVariant {
  switch (variant) {
    case "success":
      return "success"
    case "warning":
      return "warning"
    case "error":
      return "destructive"
    default:
      return "default"
  }
}

function dismissExistingKobalteExternalId(externalId: string | number): void {
  const existing = kobalteExternalIdMap.get(externalId)
  if (existing == null) return
  ToastPrimitive.toaster.dismiss(existing)
  releaseKobalteMapping(externalId)
}

function showKobalteAppToastImpl(props: {
  title?: JSX.Element
  description?: JSX.Element
  children?: JSX.Element
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
  progress?: ToastProgressInput
  id?: string | number
  script?: boolean
}) {
  const externalId = claimToastSlot(props.id)
  dismissExistingKobalteExternalId(externalId)

  const durationMs = props.persistent
    ? undefined
    : (props.duration ?? DEFAULT_TOAST_DURATION)
  const persistent = props.persistent ?? false
  const progress = resolveProgress(
    props.progress,
    props.persistent ? Number.POSITIVE_INFINITY : (props.duration ?? DEFAULT_TOAST_DURATION),
  )

  if (props.children) {
    const kobalteId = ToastPrimitive.toaster.show(
      (data) => (
        <KobalteToast toastId={data.toastId} persistent={persistent} duration={durationMs}>
          <div class="w-full min-w-[280px]">{props.children}</div>
          <ToastClose />
        </KobalteToast>
      ),
      { region: KOBALTE_TOAST_REGION_ID },
    )
    registerKobalteMapping(externalId, kobalteId)
    return
  }

  const variant = normalizeVariant(props.variant)
  const hasTitle = props.title != null && props.title !== ""
  const hasDescField = props.description != null && props.description !== ""

  if (!hasTitle && !hasDescField && !progress) return

  const icon = variant === "plain" ? null : resolvePerToastIcon(variant)
  const bodyProps = (): DescriptionBodyProps => ({
    description: hasDescField ? props.description : undefined,
    script: props.script,
    progress,
    toastId: externalId,
  })

  const kobalteId = ToastPrimitive.toaster.show(
    (data) => (
      <KobalteToast
        toastId={data.toastId}
        variant={mapKobalteVariant(variant)}
        duration={durationMs}
        persistent={persistent || progress != null}
      >
        <div class="flex min-w-0 items-start gap-3 pr-6">
          {icon ? <div class="mt-0.5 shrink-0">{icon}</div> : null}
          <div class="grid min-w-0 flex-1 gap-1">
            {hasTitle ? <ToastTitle>{props.title}</ToastTitle> : null}
            {!hasTitle && hasDescField ? (
              <ToastDescription class={cn(props.script && "whitespace-pre-wrap font-mono text-xs")}>
                {props.description}
              </ToastDescription>
            ) : null}
            {hasTitle && (hasDescField || progress) ? (
              <div class={cn("text-sm opacity-90", props.script && "whitespace-pre-wrap font-mono text-xs")}>
                {buildDescriptionBody(bodyProps())}
              </div>
            ) : null}
            {!hasTitle && !hasDescField && progress ? (
              <div ref={(el) => el && mountToastProgressBar(el, progress, externalId)} />
            ) : null}
          </div>
        </div>
        <ToastClose />
      </KobalteToast>
    ),
    { region: KOBALTE_TOAST_REGION_ID },
  )
  registerKobalteMapping(externalId, kobalteId)
}

/** 在独立 Solid root 中展示，避免 createResource/untrack 或 QuickJS 宿主间隙下 owner 链断裂 */
function showSonnerAppToastImpl(props: {
  title?: JSX.Element
  description?: JSX.Element
  children?: JSX.Element
  variant?: ToastVariant
  duration?: number
  persistent?: boolean
  progress?: ToastProgressInput
  id?: string | number
  script?: boolean
}) {
  const toastId = claimToastSlot(props.id)

  if (props.children) {
    const childDuration = props.persistent
      ? Number.POSITIVE_INFINITY
      : (props.duration ?? DEFAULT_TOAST_DURATION)
    toast.custom(
      () => props.children!,
      toastOptions({
        duration: props.duration,
        persistent: props.persistent,
        id: toastId,
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
    id: toastId,
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
    toastId,
  })

  if (hasTitle) {
    toastMessage = props.title!
    toastDescription = hasDescField || progress ? lazyDescriptionBody(bodyProps()) : undefined
  } else if (hasDescField) {
    toastMessage = props.description!
    toastDescription = progress
      ? lazyDescriptionBody({ script: props.script, progress, toastId })
      : undefined
  } else {
    toastMessage = " "
    toastDescription = lazyDescriptionBody({ script: props.script, progress, toastId })
  }

  if (toastMessage === "" || (toastMessage === " " && !toastDescription)) return

  const perToastIcon = resolvePerToastIcon(variant)
  const payload = { ...options, description: toastDescription, icon: perToastIcon }

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
  queueMicrotask(() => {
    createRoot(() => {
      if (getActiveToastStyle() === "toast") {
        showKobalteAppToastImpl(props)
      } else {
        showSonnerAppToastImpl(props)
      }
    })
  })
}

export function showImmersiveEnterToast() {
  queueMicrotask(() => {
    createRoot(() => {
      if (getActiveToastStyle() === "toast") {
        const externalId = claimToastSlot()
        dismissExistingKobalteExternalId(externalId)
        const kobalteId = ToastPrimitive.toaster.show(
          (data) => (
            <KobalteToast toastId={data.toastId} persistent>
              <ImmersiveToastContent />
              <ToastClose />
            </KobalteToast>
          ),
          { region: KOBALTE_TOAST_REGION_ID },
        )
        registerKobalteMapping(externalId, kobalteId)
        return
      }
      toast.custom(() => <ImmersiveToastContent />, {
        duration: Number.POSITIVE_INFINITY,
        closeButton: true,
        class: APP_TOAST_CLASS,
      })
    })
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
