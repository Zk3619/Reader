/**
 * 窗口控制按钮（置顶、最小化、最大化/还原、关闭）
 * 仅在桌面平台 + Tauri 环境显示，与导航栏逻辑一致。
 * 关闭时支持「隐藏到托盘」/「退出应用」选择及「记住我的选择」。
 */

import { createSignal, Show, onMount, onCleanup } from "solid-js"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Button } from "@/components/ui/button"
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from "@/components/shared/AppTooltip"
import {
  AppDialog,
  AppDialogScrollBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/shared/AppDialog"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { hideWindowAndSaveState, notifyMainWindowTrayVisibility, saveWindowStateBeforeExit } from "@/utils/window-state"
import {
  PinWindowIcon,
  UnpinWindowIcon,
  MinimizeWindowIcon,
  MaximizeWindowIcon,
  RestoreWindowIcon,
  XIcon,
} from "@/components/shared/icons"
import { isInnerWebSessionActive } from "@/lib/platform/inner-web"
import {
  retainInnerWebPanelForOverlay,
  releaseInnerWebPanelForOverlay,
  INNER_WEB_OVERLAY_Z,
} from "@/lib/platform/inner-web-panel-overlay"
import { appDialogScrollBodySpaceY4 } from "@/lib/ui/viewport-classes"
import { settingsStore } from "@/stores/settings"
import {
  clearCloseWindowAction,
  readCloseWindowAction,
  writeCloseWindowAction,
  type CloseWindowAction,
} from "@/lib/settings/close-action-prefs"

export function WindowControlButtons() {
  const [isTauri, setIsTauri] = createSignal(false)
  const [isDesktopPlatform, setIsDesktopPlatform] = createSignal(false)
  const [isMaximized, setIsMaximized] = createSignal(false)
  const [isAlwaysOnTop, setIsAlwaysOnTop] = createSignal(false)
  const [showCloseDialog, setShowCloseDialog] = createSignal(false)
  const [closeAction, setCloseAction] = createSignal<CloseWindowAction>("hide")
  const [rememberChoice, setRememberChoice] = createSignal(false)

  let appWindow: ReturnType<typeof getCurrentWindow> | null = null

  onMount(() => {
    try {
      const win = getCurrentWindow()
      appWindow = win
      setIsTauri(true)
      const userAgent = navigator.userAgent.toLowerCase()
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
      setIsDesktopPlatform(!isMobileUA)
      win
        .isMaximized()
        .then((maximized) => {
          setIsMaximized(maximized)
          win.onResized(() => {
            win.isMaximized().then(setIsMaximized)
          })
        })
        .catch(() => { })
      win
        .isAlwaysOnTop()
        .then(setIsAlwaysOnTop)
        .catch(() => { })
    } catch {
      setIsTauri(false)
    }
    return onCleanup(() => { })
  })

  const showWindowControls = () => isDesktopPlatform() && isTauri()

  async function toggleAlwaysOnTop() {
    if (!appWindow) return
    try {
      const next = !isAlwaysOnTop()
      await appWindow.setAlwaysOnTop(next)
      setIsAlwaysOnTop(next)
    } catch (error) {
      console.error("切换窗口置顶失败:", error)
    }
  }

  async function minimizeWindow() {
    if (appWindow) {
      try {
        if (settingsStore.state.app.minimizeToTray) {
          await hideWindowAndSaveState()
        } else {
          await appWindow.minimize()
        }
      } catch (error) {
        console.error("最小化窗口失败:", error)
      }
    }
  }

  async function maximizeWindow() {
    if (appWindow) {
      try {
        if (isMaximized()) {
          await appWindow.unmaximize()
          setIsMaximized(false)
        } else {
          await appWindow.maximize()
          setIsMaximized(true)
        }
      } catch (error) {
        console.error("最大化窗口失败:", error)
      }
    }
  }

  async function closeWindow(event?: MouseEvent | KeyboardEvent) {
    if (!isTauri()) return
    if (event?.target instanceof HTMLElement) {
      ; (event.target as HTMLElement).blur()
    }
    if (settingsStore.state.app.closeToTray) {
      await executeCloseAction("hide")
      return
    }
    const savedChoice = readCloseWindowAction()
    if (savedChoice) {
      await executeCloseAction(savedChoice)
      return
    }
    if (isInnerWebSessionActive()) {
      await retainInnerWebPanelForOverlay()
    }
    setShowCloseDialog(true)
  }

  async function executeCloseAction(
    action: CloseWindowAction,
    options?: { persistRemember?: boolean },
  ) {
    if (action === "hide") {
      if (appWindow) {
        try {
          await hideWindowAndSaveState()
        } catch (error) {
          console.error("隐藏到托盘失败:", error)
          if (appWindow) {
            await appWindow.hide()
            notifyMainWindowTrayVisibility("hidden")
          }
        }
      }
    } else {
      if (appWindow) {
        try {
          await saveWindowStateBeforeExit()
        } catch (error) {
          console.error("保存窗口状态失败:", error)
        }
        try {
          await appWindow.close()
        } catch (error) {
          console.error("关闭窗口失败:", error)
        }
      }
    }
    if (options?.persistRemember) {
      if (rememberChoice()) {
        writeCloseWindowAction(action)
      } else {
        clearCloseWindowAction()
      }
    }
    setShowCloseDialog(false)
    if (isInnerWebSessionActive()) {
      releaseInnerWebPanelForOverlay({ overlap: true })
    }
  }

  function handleCloseConfirm() {
    void executeCloseAction(closeAction(), { persistRemember: true })
  }

  function handleCloseCancel() {
    setShowCloseDialog(false)
    if (isInnerWebSessionActive()) {
      releaseInnerWebPanelForOverlay({ immediate: true })
    }
  }

  return (
    <>
      <Show when={showWindowControls()}>
        <div class="flex items-center gap-1 no-drag">
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class={`h-9 w-9 rounded-md hover:bg-muted transition-colors ${isAlwaysOnTop() ? "bg-muted text-foreground" : ""}`}
              onClick={toggleAlwaysOnTop}
            >
              <Show when={isAlwaysOnTop()} fallback={<PinWindowIcon class="h-4 w-4" size={16} />}>
                <UnpinWindowIcon class="h-4 w-4" size={16} />
              </Show>
              <span class="sr-only">{isAlwaysOnTop() ? "取消置顶" : "窗口置顶"}</span>
            </AppTooltipTrigger>
            <AppTooltipContent>{isAlwaysOnTop() ? "取消置顶" : "窗口置顶"}</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-muted transition-colors" onClick={minimizeWindow}>
              <MinimizeWindowIcon class="h-4 w-4" size={16} />
              <span class="sr-only">最小化</span>
            </AppTooltipTrigger>
            <AppTooltipContent>最小化</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-muted transition-colors" onClick={maximizeWindow}>
              <Show
                when={isMaximized()}
                fallback={<MaximizeWindowIcon class="h-4 w-4" size={16} />}
              >
                <RestoreWindowIcon class="h-4 w-4" size={16} />
              </Show>
              <span class="sr-only">{isMaximized() ? "还原" : "最大化"}</span>
            </AppTooltipTrigger>
            <AppTooltipContent>{isMaximized() ? "还原" : "最大化"}</AppTooltipContent>
          </AppTooltip>
          <AppTooltip>
            <AppTooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={(e: MouseEvent) => {
              ; (e.currentTarget as HTMLElement).blur()
              closeWindow(e)
            }}>
              <XIcon class="h-4 w-4" size={16} />
              <span class="sr-only">关闭</span>
            </AppTooltipTrigger>
            <AppTooltipContent>关闭</AppTooltipContent>
          </AppTooltip>
        </div>
      </Show>

      <AppDialog
        open={showCloseDialog()}
        onOpenChange={(open) => {
          if (!open) handleCloseCancel()
        }}
      >
        <AppDialogContent
          portalZClass={
            isInnerWebSessionActive()
              ? `${INNER_WEB_OVERLAY_Z} reader-inner-web-overlay-portal`
              : undefined
          }
        >
          <AppDialogHeader>
            <AppDialogTitle>关闭</AppDialogTitle>
          </AppDialogHeader>
          <AppDialogScrollBody class={appDialogScrollBodySpaceY4}>
            <RadioGroup
              value={closeAction()}
              onChange={(value: string) => setCloseAction(value as CloseWindowAction)}
            >
              <RadioGroupItem value="hide">
                <RadioGroupItemLabel>隐藏到托盘</RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="quit">
                <RadioGroupItemLabel>退出应用</RadioGroupItemLabel>
              </RadioGroupItem>
            </RadioGroup>
            <div class="flex items-center gap-2">
              <Checkbox
                id="window-close-remember"
                checked={rememberChoice()}
                onChange={setRememberChoice}
              />
              <Label for="window-close-remember">
                <div>
                  <div class="text-sm font-medium">记住我的选择</div>
                  <div class="text-xs text-muted-foreground">
                    可在「设置 → 窗口与系统」中修改或清除。
                  </div>
                </div>
              </Label>
            </div>
          </AppDialogScrollBody>
          <AppDialogFooter>
            <Button variant="outline" onClick={handleCloseCancel}>
              取消
            </Button>
            <Button variant="default" onClick={handleCloseConfirm}>
              确定
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  )
}
