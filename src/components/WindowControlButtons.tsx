/**
 * 窗口控制按钮（最小化、最大化/还原、关闭）
 * 仅在桌面平台 + Tauri 环境显示，与导航栏逻辑一致。
 * 关闭时支持「隐藏到托盘」/「退出应用」选择及「记住我的选择」。
 */

import { createSignal, Show, onMount, onCleanup } from "solid-js"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { hideWindowAndSaveState, saveWindowStateBeforeExit } from "@/utils/window-state"

export function WindowControlButtons() {
  const [isTauri, setIsTauri] = createSignal(false)
  const [isDesktopPlatform, setIsDesktopPlatform] = createSignal(false)
  const [isMaximized, setIsMaximized] = createSignal(false)
  const [showCloseDialog, setShowCloseDialog] = createSignal(false)
  const [closeAction, setCloseAction] = createSignal<"hide" | "quit">("hide")
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
        .catch(() => {})
    } catch {
      setIsTauri(false)
    }
    return onCleanup(() => {})
  })

  const showWindowControls = () => isDesktopPlatform() && isTauri()

  async function minimizeWindow() {
    if (appWindow) {
      try {
        await appWindow.minimize()
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
      ;(event.target as HTMLElement).blur()
    }
    const savedChoice = localStorage.getItem("closeAction")
    if (savedChoice === "hide" || savedChoice === "quit") {
      await executeCloseAction(savedChoice as "hide" | "quit")
      return
    }
    setShowCloseDialog(true)
  }

  async function executeCloseAction(action: "hide" | "quit") {
    if (action === "hide") {
      if (appWindow) {
        try {
          await hideWindowAndSaveState()
        } catch (error) {
          console.error("隐藏到托盘失败:", error)
          if (appWindow) await appWindow.hide()
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
    if (rememberChoice()) {
      localStorage.setItem("closeAction", action)
    }
    setShowCloseDialog(false)
  }

  function handleCloseConfirm() {
    executeCloseAction(closeAction())
  }

  function handleCloseCancel() {
    setShowCloseDialog(false)
  }

  return (
    <>
      <Show when={showWindowControls()}>
        <div class="flex items-center gap-1 no-drag">
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-muted transition-colors" onClick={minimizeWindow}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
              >
                <path d="M5 12h14" />
              </svg>
              <span class="sr-only">最小化</span>
            </TooltipTrigger>
            <TooltipContent>最小化</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-muted transition-colors" onClick={maximizeWindow}>
            <Show
              when={isMaximized()}
              fallback={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-4 w-4"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="h-4 w-4"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            </Show>
            <span class="sr-only">{isMaximized() ? "还原" : "最大化"}</span>
            </TooltipTrigger>
            <TooltipContent>{isMaximized() ? "还原" : "最大化"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger as={Button} variant="ghost" size="icon" class="h-9 w-9 rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={(e: MouseEvent) => {
              ;(e.currentTarget as HTMLElement).blur()
              closeWindow(e)
            }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            <span class="sr-only">关闭</span>
            </TooltipTrigger>
            <TooltipContent>关闭</TooltipContent>
          </Tooltip>
        </div>
      </Show>

      <Dialog open={showCloseDialog()} onOpenChange={setShowCloseDialog}>
        <DialogContent class="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>关闭</DialogTitle>
          </DialogHeader>
          <div class="space-y-4 py-4">
            <RadioGroup
              value={closeAction()}
              onChange={(value: string) => setCloseAction(value as "hide" | "quit")}
            >
              <RadioGroupItem value="hide">
                <RadioGroupItemLabel>隐藏到托盘</RadioGroupItemLabel>
              </RadioGroupItem>
              <RadioGroupItem value="quit">
                <RadioGroupItemLabel>退出应用</RadioGroupItemLabel>
              </RadioGroupItem>
            </RadioGroup>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex gap-2">
              <Checkbox
                id="window-close-remember"
                checked={rememberChoice()}
                onChange={setRememberChoice}
              />
              <Label for="window-close-remember-input">记住我的选择</Label>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" onClick={handleCloseCancel}>
                取消
              </Button>
              <Button variant="default" onClick={handleCloseConfirm}>
                确定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
