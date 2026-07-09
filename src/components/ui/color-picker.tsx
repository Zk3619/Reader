import type { Accessor, Component, ComponentProps, JSX, ParentProps, ValidComponent } from "solid-js"
import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  mergeProps,
  onCleanup,
  splitProps,
  useContext,
} from "solid-js"
import { Portal } from "solid-js/web"

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { cva } from "class-variance-authority"
import type { VariantProps } from "class-variance-authority"
import { Pipette } from "lucide-solid"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { TextField, TextFieldInput } from "@/components/ui/text-field"
import {
  DEFAULT_COLOR_SWATCHES,
  type ColorFormat,
  type ColorSwatchPreset,
  type RGBA,
  COLOR_SWATCH_PRESETS,
  formatColor,
  formatSupportsAlpha,
  getDefaultFormat,
  getHueColor,
  getReadableTextColor,
  getSwatchesForPreset,
  hsvToRgb,
  hslToRgb,
  hwbToRgb,
  parseColor,
  rgbToHsl,
  rgbToHsv,
  rgbToHwb,
  rgbaEqual,
  rgbaToCss,
} from "@/lib/color-utils"
import { cn } from "@/lib/utils"

export type ColorPickerVariant =
  | "default"
  | "inline"
  | "compact"
  | "swatch"
  | "twitter"
  | "chrome"
  | "github"
  | "sketch"
  | "material"
  | "minimal"

export type ColorPickerSize = "sm" | "default" | "lg"

export type ColorPickerTriggerVariant = "default" | "outline" | "ghost" | "secondary" | "icon"

export type { ColorFormat, ColorSwatchPreset, RGBA }

/** axe 要求 ARIA 属性值为字符串字面量 */
function ariaBool(value: boolean): "true" | "false" {
  return value ? "true" : "false"
}

function ariaNum(value: number): string {
  return String(Math.round(value))
}

type AriaExpandedButtonProps = ComponentProps<typeof Button> & {
  expanded: boolean
}

/** 静态分析器要求 aria-expanded 为字面量 */
const AriaExpandedButton: Component<AriaExpandedButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ["expanded", "children", "class"])
  return (
    <Show
      when={local.expanded}
      fallback={
        <Button class={local.class} aria-expanded="false" {...rest}>
          {local.children}
        </Button>
      }
    >
      <Button class={local.class} aria-expanded="true" {...rest}>
        {local.children}
      </Button>
    </Show>
  )
}

type AriaPressedButtonProps = ComponentProps<typeof Button> & {
  pressed: boolean
}

/** 静态分析器要求 aria-pressed 为字面量 */
const AriaPressedButton: Component<AriaPressedButtonProps> = (props) => {
  const [local, rest] = splitProps(props, ["pressed", "children", "class"])
  return (
    <Show
      when={local.pressed}
      fallback={
        <Button class={local.class} aria-pressed="false" {...rest}>
          {local.children}
        </Button>
      }
    >
      <Button class={local.class} aria-pressed="true" {...rest}>
        {local.children}
      </Button>
    </Show>
  )
}

/** 静态分析器要求 aria-disabled 为字面量，不能用动态表达式绑定 */
type AriaDisabledDivProps = JSX.HTMLAttributes<HTMLDivElement> & {
  disabled: boolean
}

const AriaDisabledDiv: Component<AriaDisabledDivProps> = (props) => {
  const [local, rest] = splitProps(props, ["disabled", "children", "class"])
  return (
    <Show
      when={local.disabled}
      fallback={
        <div class={local.class} aria-disabled="false" {...rest}>
          {local.children}
        </div>
      }
    >
      <div class={local.class} aria-disabled="true" {...rest}>
        {local.children}
      </div>
    </Show>
  )
}

const FORMAT_OPTIONS: { value: ColorFormat; label: string }[] = [
  { value: "hex", label: "HEX" },
  { value: "hex8", label: "HEX8" },
  { value: "rgb", label: "RGB" },
  { value: "rgba", label: "RGBA" },
  { value: "hsl", label: "HSL" },
  { value: "hsla", label: "HSLA" },
  { value: "hwb", label: "HWB" },
  { value: "hwba", label: "HWBA" },
]

const OPAQUE_FORMAT_OPTIONS = FORMAT_OPTIONS.filter((option) => !formatSupportsAlpha(option.value))

const CHECKERBOARD_STYLE = {
  "background-image":
    "linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)",
  "background-size": "10px 10px",
  "background-position": "0 0, 0 5px, 5px -5px, -5px 0",
}

const colorPickerTriggerVariants = cva("", {
  variants: {
    variant: {
      default: "px-3",
      inline: "px-3",
      compact: "px-2",
      swatch: "px-2",
      twitter: "px-2",
      chrome: "px-3",
      github: "px-2",
      sketch: "px-3",
      material: "px-2",
      minimal: "px-1.5",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function resolveTriggerButtonVariant(
  triggerVariant: ColorPickerTriggerVariant
): "outline" | "ghost" | "secondary" {
  switch (triggerVariant) {
    case "ghost":
      return "ghost"
    case "secondary":
      return "secondary"
    default:
      return "outline"
  }
}

function resolveTriggerButtonSize(
  triggerVariant: ColorPickerTriggerVariant,
  size: ColorPickerSize
): "sm" | "default" | "lg" | "icon" | undefined {
  if (triggerVariant === "icon") return undefined
  return size
}

const HSV_HUE_EPSILON = 0.001

function hasDefinedHue(hsv: ReturnType<typeof rgbToHsv>): boolean {
  return hsv.s > HSV_HUE_EPSILON && hsv.v > HSV_HUE_EPSILON
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360
}

const colorPickerPanelVariants = cva(
  "rounded-lg border bg-popover text-popover-foreground shadow-md outline-none",
  {
    variants: {
      variant: {
        default: "w-[280px] p-3",
        inline: "w-full max-w-[320px] p-3",
        compact: "w-[240px] p-2.5",
        swatch: "w-[260px] p-3",
        twitter: "w-[252px] p-3",
        chrome: "w-[272px] p-3",
        github: "w-[268px] p-3",
        sketch: "w-[300px] p-3",
        material: "w-[280px] p-3",
        minimal: "w-[280px] p-3",
      },
      size: {
        sm: "text-xs",
        default: "text-sm",
        lg: "text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const VARIANT_SWATCH_PRESET: Partial<Record<ColorPickerVariant, ColorSwatchPreset>> = {
  twitter: "twitter",
  github: "github",
  chrome: "chrome",
  material: "material",
}

interface ColorPickerStore {
  rgba: Accessor<RGBA>
  format: Accessor<ColorFormat>
  showAlpha: Accessor<boolean>
  disabled: Accessor<boolean>
  variant: Accessor<ColorPickerVariant>
  triggerVariant: Accessor<ColorPickerTriggerVariant>
  size: Accessor<ColorPickerSize>
  open: Accessor<boolean>
  swatches: Accessor<readonly string[]>
  swatchShape: Accessor<"square" | "circle">
  showCustomPicker: Accessor<boolean>
  eyeDropperActive: Accessor<boolean>
  labelId: Accessor<string | undefined>
  descriptionId: Accessor<string | undefined>
  liveRegionId: Accessor<string>
  setRgba: (rgba: RGBA) => void
  setHue: (hue: number) => void
  setFormat: (format: ColorFormat) => void
  setOpen: (open: boolean) => void
  setShowCustomPicker: (show: boolean) => void
  setEyeDropperActive: (active: boolean) => void
  formattedValue: Accessor<string>
  hue: Accessor<number>
}

const ColorPickerContext = createContext<ColorPickerStore>()

function useColorPickerContext(component: string) {
  const context = useContext(ColorPickerContext)
  if (!context) {
    throw new Error(`${component} must be used within <ColorPicker>`)
  }
  return context
}

const COLOR_PICKER_PORTAL_ATTR = "data-color-picker-portal"

function isColorPickerOverlayTarget(
  target: Node,
  panel: HTMLElement | undefined,
  trigger: HTMLElement | undefined
): boolean {
  if (!(target instanceof Element)) return false
  if (panel?.contains(target)) return true
  if (trigger?.contains(target)) return true
  if (target.closest(`[${COLOR_PICKER_PORTAL_ATTR}]`)) return true
  return false
}

function scheduleColorPickerPosition(
  panel: HTMLElement | undefined,
  trigger: HTMLElement | undefined,
  setPosition: (position: { top: number; left: number }) => void,
  onPositioned: () => void
) {
  const run = () => {
    if (!panel || !trigger) return
    const rect = trigger.getBoundingClientRect()
    const panelWidth = panel.offsetWidth || 280
    const panelHeight = panel.offsetHeight || 360
    const margin = 8

    let left = rect.left
    let top = rect.bottom + margin

    if (left + panelWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - panelWidth - margin)
    }
    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - panelHeight - margin)
    }

    setPosition({ top, left })
    onPositioned()
  }

  requestAnimationFrame(() => {
    run()
    requestAnimationFrame(run)
  })
}

let activePointerDragCleanup: (() => void) | null = null

function releaseStuckPointerInteractions() {
  activePointerDragCleanup?.()
  activePointerDragCleanup = null
  const active = document.activeElement
  if (active instanceof HTMLElement) {
    active.blur()
  }
}

function usePointerDrag(options: {
  disabled?: Accessor<boolean>
  onPointerDown?: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp?: (event: PointerEvent) => void
}) {
  const handlePointerDown = (event: PointerEvent) => {
    if (options.disabled?.()) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    options.onPointerDown?.(event)
    options.onPointerMove(event)

    let cleaned = false
    const cleanup = (upEvent?: PointerEvent) => {
      if (cleaned) return
      cleaned = true
      if (activePointerDragCleanup === cleanupDrag) {
        activePointerDragCleanup = null
      }
      try {
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId)
        }
      } catch {
        // pointer 可能已被浏览器接管（如吸管取色）
      }
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      if (upEvent) options.onPointerUp?.(upEvent)
    }

    const cleanupDrag = () => cleanup()
    activePointerDragCleanup = cleanupDrag

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      options.onPointerMove(moveEvent)
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== event.pointerId) return
      cleanup(upEvent)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
  }

  return handlePointerDown
}

function getRelativePosition(event: PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
  return {
    x,
    y,
    width: rect.width,
    height: rect.height,
    ratioX: rect.width === 0 ? 0 : x / rect.width,
    ratioY: rect.height === 0 ? 0 : y / rect.height,
  }
}

function ColorSwatchPreview(props: {
  rgba: RGBA
  class?: string
  title?: string
}) {
  return (
    <span
      class={cn("relative overflow-hidden rounded-md border border-border/80", props.class)}
      style={CHECKERBOARD_STYLE}
      title={props.title}
      aria-hidden="true"
    >
      <span class="absolute inset-0" style={{ "background-color": rgbaToCss(props.rgba) }} />
    </span>
  )
}

function ColorPickerArea() {
  const ctx = useColorPickerContext("ColorPickerArea")
  let areaRef: HTMLDivElement | undefined

  const hue = () => ctx.hue()
  const hsv = createMemo(() => rgbToHsv(ctx.rgba().r, ctx.rgba().g, ctx.rgba().b))

  const updateFromPointer = (event: PointerEvent) => {
    if (!areaRef || ctx.disabled()) return
    const { ratioX, ratioY } = getRelativePosition(event, areaRef)
    const next = hsvToRgb(hue(), ratioX, 1 - ratioY)
    ctx.setRgba({ ...next, a: ctx.rgba().a })
  }

  const onPointerDown = usePointerDrag({
    disabled: ctx.disabled,
    onPointerMove: updateFromPointer,
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (ctx.disabled()) return
    const step = event.shiftKey ? 0.1 : 0.02
    const current = hsv()
    let saturation = current.s
    let value = current.v

    switch (event.key) {
      case "ArrowLeft":
        saturation = Math.max(0, saturation - step)
        break
      case "ArrowRight":
        saturation = Math.min(1, saturation + step)
        break
      case "ArrowUp":
        value = Math.min(1, value + step)
        break
      case "ArrowDown":
        value = Math.max(0, value - step)
        break
      case "Home":
        saturation = 0
        break
      case "End":
        saturation = 1
        break
      case "PageUp":
        value = 1
        break
      case "PageDown":
        value = 0
        break
      default:
        return
    }

    event.preventDefault()
    const next = hsvToRgb(hue(), saturation, value)
    ctx.setRgba({ ...next, a: ctx.rgba().a })
  }

  return (
    <AriaDisabledDiv
      ref={areaRef}
      disabled={ctx.disabled()}
      role="group"
      tabIndex={ctx.disabled() ? -1 : 0}
      aria-label="饱和度与明度"
      aria-describedby={ctx.descriptionId()}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End PageUp PageDown"
      class={cn(
        "relative h-36 w-full cursor-crosshair touch-none overflow-hidden rounded-md border border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ctx.disabled() && "pointer-events-none opacity-50"
      )}
      style={{ "background-color": getHueColor(hue()) }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div class="absolute inset-0 bg-linear-to-r from-white to-transparent" />
      <div class="absolute inset-0 bg-linear-to-t from-black to-transparent" />
      <div
        class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{
          left: `${hsv().s * 100}%`,
          top: `${(1 - hsv().v) * 100}%`,
          "background-color": rgbaToCss(ctx.rgba()),
        }}
      />
    </AriaDisabledDiv>
  )
}

function ColorPickerHueSlider() {
  const ctx = useColorPickerContext("ColorPickerHueSlider")
  let trackRef: HTMLDivElement | undefined

  const hue = () => ctx.hue()

  const updateFromPointer = (event: PointerEvent) => {
    if (!trackRef || ctx.disabled()) return
    const { ratioX } = getRelativePosition(event, trackRef)
    ctx.setHue(ratioX * 360)
  }

  const onPointerDown = usePointerDrag({
    disabled: ctx.disabled,
    onPointerMove: updateFromPointer,
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (ctx.disabled()) return
    const step = event.shiftKey ? 15 : 1
    let nextHue = hue()

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextHue -= step
        break
      case "ArrowRight":
      case "ArrowUp":
        nextHue += step
        break
      case "Home":
        nextHue = 0
        break
      case "End":
        nextHue = 360
        break
      default:
        return
    }

    event.preventDefault()
    ctx.setHue(nextHue)
  }

  return (
    <AriaDisabledDiv
      ref={trackRef}
      disabled={ctx.disabled()}
      role="slider"
      tabIndex={ctx.disabled() ? -1 : 0}
      aria-label="色相"
      aria-orientation="horizontal"
      aria-valuemin="0"
      aria-valuemax="360"
      aria-valuenow={ariaNum(hue())}
      aria-valuetext={`色相 ${ariaNum(hue())} 度`}
      class={cn(
        "relative h-3 w-full cursor-pointer touch-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ctx.disabled() && "pointer-events-none opacity-50"
      )}
      style={{
        background:
          "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
      }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{
          left: `${(hue() / 360) * 100}%`,
          "background-color": getHueColor(hue()),
        }}
      />
    </AriaDisabledDiv>
  )
}

function ColorPickerAlphaControl() {
  const ctx = useColorPickerContext("ColorPickerAlphaControl")
  let trackRef: HTMLDivElement | undefined

  const alphaPercent = () => Math.round(ctx.rgba().a * 100)
  const solid = createMemo(() => {
    const color = ctx.rgba()
    return rgbaToCss({ ...color, a: 1 })
  })

  const setAlphaPercent = (percent: number) => {
    const next = Math.min(100, Math.max(0, percent))
    ctx.setRgba({ ...ctx.rgba(), a: next / 100 })
  }

  const updateFromPointer = (event: PointerEvent) => {
    if (!trackRef || ctx.disabled()) return
    const { ratioX } = getRelativePosition(event, trackRef)
    setAlphaPercent(Math.round(ratioX * 100))
  }

  const onPointerDown = usePointerDrag({
    disabled: ctx.disabled,
    onPointerMove: updateFromPointer,
  })

  const onKeyDown = (event: KeyboardEvent) => {
    if (ctx.disabled()) return
    const step = event.shiftKey ? 10 : 1
    let nextAlpha = alphaPercent()

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextAlpha -= step
        break
      case "ArrowRight":
      case "ArrowUp":
        nextAlpha += step
        break
      case "Home":
        nextAlpha = 0
        break
      case "End":
        nextAlpha = 100
        break
      default:
        return
    }

    event.preventDefault()
    setAlphaPercent(nextAlpha)
  }

  return (
    <Show when={ctx.showAlpha()}>
      <div class="space-y-1.5" role="group" aria-label="透明度调整">
        <div class="flex items-center justify-between gap-2">
          <Label class="text-xs text-muted-foreground">透明度</Label>
          <TextField class="w-18">
            <TextFieldInput
              type="number"
              min={0}
              max={100}
              value={String(alphaPercent())}
              disabled={ctx.disabled()}
              class="h-7 px-2 text-center font-mono text-xs"
              aria-label="透明度百分比"
              onInput={(event) => setAlphaPercent(Number(event.currentTarget.value))}
            />
          </TextField>
        </div>
        <AriaDisabledDiv
          ref={trackRef}
          disabled={ctx.disabled()}
          role="slider"
          tabIndex={ctx.disabled() ? -1 : 0}
          aria-label="透明度滑块"
          aria-orientation="horizontal"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={ariaNum(alphaPercent())}
          aria-valuetext={`透明度 ${ariaNum(alphaPercent())}%`}
          class={cn(
            "relative h-3 w-full cursor-pointer touch-none overflow-hidden rounded-full border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            ctx.disabled() && "pointer-events-none opacity-50"
          )}
          style={CHECKERBOARD_STYLE}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
        >
          <div
            class="absolute inset-0"
            style={{
              background: `linear-gradient(to right, transparent, ${solid()})`,
            }}
          />
          <div
            class="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{
              left: `${ctx.rgba().a * 100}%`,
              "background-color": rgbaToCss(ctx.rgba()),
            }}
          />
        </AriaDisabledDiv>
      </div>
    </Show>
  )
}

function ColorPickerFormatSelect() {
  const ctx = useColorPickerContext("ColorPickerFormatSelect")
  const formatOptions = () => (ctx.showAlpha() ? FORMAT_OPTIONS : OPAQUE_FORMAT_OPTIONS)

  return (
    <Select<ColorFormat>
      value={ctx.format()}
      onChange={(value) => {
        if (value) ctx.setFormat(value)
      }}
      disabled={ctx.disabled()}
      options={formatOptions().map((option) => option.value)}
      itemComponent={(itemProps) => (
        <SelectItem item={itemProps.item}>
          {formatOptions().find((option) => option.value === itemProps.item.rawValue)?.label ??
            itemProps.item.rawValue}
        </SelectItem>
      )}
    >
      <SelectTrigger class="h-9 w-[92px] shrink-0 px-2 text-xs" aria-label="颜色格式">
        <SelectValue<ColorFormat>>
          {(state) =>
            formatOptions().find((option) => option.value === state.selectedOption())?.label ??
            state.selectedOption()
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent data-color-picker-portal="" />
    </Select>
  )
}

function ColorPickerInput() {
  const ctx = useColorPickerContext("ColorPickerInput")
  const [draft, setDraft] = createSignal(ctx.formattedValue())
  const [invalid, setInvalid] = createSignal(false)

  createEffect(() => {
    setDraft(ctx.formattedValue())
    setInvalid(false)
  })

  const commitDraft = () => {
    const parsed = parseColor(draft())
    if (!parsed) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    ctx.setRgba(parsed)
  }

  return (
    <TextField class="min-w-0 flex-1">
      <TextFieldInput
        value={draft()}
        disabled={ctx.disabled()}
        aria-label="颜色值"
        aria-invalid={ariaBool(invalid())}
        aria-describedby={ctx.descriptionId()}
        class={cn("h-9 font-mono text-xs", invalid() && "border-destructive text-destructive")}
        onInput={(event) => {
          setDraft(event.currentTarget.value)
          setInvalid(false)
        }}
        onBlur={commitDraft}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commitDraft()
          }
        }}
      />
    </TextField>
  )
}

function ColorPickerSwatches(props?: { columns?: number; onSelect?: () => void }) {
  const ctx = useColorPickerContext("ColorPickerSwatches")
  const columns = () => props?.columns ?? (ctx.variant() === "material" ? 5 : ctx.variant() === "twitter" ? 6 : 10)
  const isCircle = () => ctx.swatchShape() === "circle"

  return (
    <div
      role="group"
      aria-label="预设颜色"
      class="grid gap-1.5"
      style={{ "grid-template-columns": `repeat(${columns()}, minmax(0, 1fr))` }}
    >
      <For each={[...ctx.swatches()]}>
        {(swatch) => {
          const parsed = createMemo(() => parseColor(swatch) ?? { r: 0, g: 0, b: 0, a: 1 })
          const selected = createMemo(() => rgbaEqual(parsed(), ctx.rgba()))

          return (
            <AriaPressedButton
              type="button"
              variant="ghost"
              pressed={selected()}
              aria-label={`选择颜色 ${swatch}`}
              disabled={ctx.disabled()}
              class={cn(
                "relative h-auto w-auto min-h-0 overflow-hidden border p-0 transition-transform hover:scale-105 hover:bg-transparent!",
                isCircle() ? "size-7 rounded-full" : "size-6 rounded-md",
                selected()
                  ? "border-ring ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : "border-border/70"
              )}
              onClick={() => {
                ctx.setRgba(parsed())
                props?.onSelect?.()
              }}
            >
              <ColorSwatchPreview
                rgba={parsed()}
                class={cn("size-full border-0", isCircle() ? "rounded-full" : "rounded-none")}
              />
            </AriaPressedButton>
          )
        }}
      </For>
    </div>
  )
}

function ColorPickerPreview() {
  const ctx = useColorPickerContext("ColorPickerPreview")
  const textColor = createMemo(() => getReadableTextColor(ctx.rgba()))

  return (
    <div
      class="relative overflow-hidden rounded-lg border border-border/70"
      style={CHECKERBOARD_STYLE}
      aria-hidden="true"
    >
      <div
        class="flex h-20 items-center justify-center font-mono text-sm font-medium"
        style={{
          "background-color": rgbaToCss(ctx.rgba()),
          color: textColor(),
        }}
      >
        {ctx.formattedValue()}
      </div>
    </div>
  )
}

function ColorPickerChannels() {
  const ctx = useColorPickerContext("ColorPickerChannels")
  const format = () => ctx.format()
  const isHsl = () => format().startsWith("hsl")
  const isHwb = () => format().startsWith("hwb")

  const channels = createMemo(() => {
    const color = ctx.rgba()
    let base: { key: string; label: string; value: number; max: number }[]

    if (isHsl()) {
      const hsl = rgbToHsl(color.r, color.g, color.b)
      base = [
        { key: "h", label: "H", value: Math.round(hsl.h), max: 360 },
        { key: "s", label: "S", value: Math.round(hsl.s), max: 100 },
        { key: "l", label: "L", value: Math.round(hsl.l), max: 100 },
      ]
    } else if (isHwb()) {
      const hwb = rgbToHwb(color.r, color.g, color.b)
      base = [
        { key: "h", label: "H", value: Math.round(hwb.h), max: 360 },
        { key: "w", label: "W", value: Math.round(hwb.w), max: 100 },
        { key: "b", label: "B", value: Math.round(hwb.b), max: 100 },
      ]
    } else {
      base = [
        { key: "r", label: "R", value: color.r, max: 255 },
        { key: "g", label: "G", value: color.g, max: 255 },
        { key: "b", label: "B", value: color.b, max: 255 },
      ]
    }

    if (ctx.showAlpha()) {
      base.push({ key: "a", label: "A", value: Math.round(color.a * 100), max: 100 })
    }

    return base
  })

  const updateChannel = (key: string, raw: string) => {
    const value = Number(raw)
    if (Number.isNaN(value)) return
    const color = ctx.rgba()

    if (key === "a") {
      ctx.setRgba({ ...color, a: Math.min(100, Math.max(0, value)) / 100 })
      return
    }

    if (isHsl()) {
      const hsl = rgbToHsl(color.r, color.g, color.b)
      const next = {
        h: hsl.h,
        s: hsl.s,
        l: hsl.l,
        [key]: value,
      }
      const rgb = hslToRgb(next.h, next.s, next.l)
      ctx.setRgba({ ...rgb, a: color.a })
      return
    }

    if (isHwb()) {
      const hwb = rgbToHwb(color.r, color.g, color.b)
      const next = {
        h: hwb.h,
        w: hwb.w,
        b: hwb.b,
        [key]: value,
      }
      const rgb = hwbToRgb(next.h, next.w, next.b)
      ctx.setRgba({ ...rgb, a: color.a })
      return
    }

    ctx.setRgba({
      ...color,
      [key]: Math.min(255, Math.max(0, value)),
    })
  }

  return (
    <div
      class={cn("grid gap-2", channels().length > 3 ? "grid-cols-4" : "grid-cols-3")}
      role="group"
      aria-label="颜色通道"
    >
      <For each={channels()}>
        {(channel) => (
          <div class="space-y-1">
            <Label class="text-[11px] text-muted-foreground">{channel.label}</Label>
            <TextField>
              <TextFieldInput
                type="number"
                min={0}
                max={channel.max}
                value={String(channel.value)}
                disabled={ctx.disabled()}
                class="h-8 px-2 text-center font-mono text-xs"
                aria-label={`${channel.label} 通道`}
                onInput={(event) => updateChannel(channel.key, event.currentTarget.value)}
              />
            </TextField>
          </div>
        )}
      </For>
    </div>
  )
}

function ColorPickerEyeDropper() {
  const ctx = useColorPickerContext("ColorPickerEyeDropper")
  const supported = () => typeof window !== "undefined" && "EyeDropper" in window

  const pickColor = async () => {
    if (ctx.disabled() || !supported()) return
    ctx.setEyeDropperActive(true)
    releaseStuckPointerInteractions()
    try {
      type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }
      const EyeDropperApi = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper
      const eyeDropper = new EyeDropperApi()
      const result = await eyeDropper.open()
      const parsed = parseColor(result.sRGBHex)
      if (parsed) ctx.setRgba(parsed)
    } catch {
      // 用户取消取色时不处理
    } finally {
      ctx.setEyeDropperActive(false)
      releaseStuckPointerInteractions()
    }
  }

  return (
    <Show when={supported()}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        class="size-9 shrink-0"
        disabled={ctx.disabled()}
        aria-label="屏幕取色"
        onClick={pickColor}
      >
        <Pipette class="size-4" />
      </Button>
    </Show>
  )
}

function ColorPickerSliders(props?: { compact?: boolean }) {
  return (
    <div class={cn("space-y-3", props?.compact && "space-y-2")}>
      <ColorPickerArea />
      <ColorPickerHueSlider />
      <ColorPickerAlphaControl />
    </div>
  )
}

function ColorPickerControls() {
  const ctx = useColorPickerContext("ColorPickerControls")
  const isCompact = () => ctx.variant() === "compact"

  return (
    <Show
      when={!isCompact()}
      fallback={
        <div class="mt-3 flex items-center gap-2">
          <ColorPickerInput />
          <ColorPickerEyeDropper />
        </div>
      }
    >
      <div class="mt-3 flex items-center gap-2">
        <ColorPickerFormatSelect />
        <ColorPickerInput />
        <ColorPickerEyeDropper />
      </div>
    </Show>
  )
}

function ColorPickerPanel(props: { class?: string }) {
  const ctx = useColorPickerContext("ColorPickerPanel")
  const variant = () => ctx.variant()
  const closeOnSwatch = () => variant() === "twitter"

  const handleSwatchSelect = () => {
    if (closeOnSwatch()) {
      ctx.setOpen(false)
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={ctx.labelId()}
      aria-describedby={ctx.descriptionId()}
      class={cn(colorPickerPanelVariants({ variant: variant(), size: ctx.size() }), props.class)}
    >
      <Show when={variant() === "sketch"}>
        <div class="space-y-3">
          <ColorPickerPreview />
          <ColorPickerSliders />
          <ColorPickerChannels />
          <ColorPickerControls />
        </div>
      </Show>

      <Show when={variant() === "twitter"}>
        <ColorPickerSwatches columns={6} onSelect={handleSwatchSelect} />
        <Show
          when={ctx.showCustomPicker()}
          fallback={
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="mt-3 w-full"
              disabled={ctx.disabled()}
              onClick={() => ctx.setShowCustomPicker(true)}
            >
              自定义颜色
            </Button>
          }
        >
          <Separator class="my-3" />
          <ColorPickerSliders compact />
          <ColorPickerControls />
        </Show>
      </Show>

      <Show when={variant() === "github"}>
        <ColorPickerSwatches columns={6} onSelect={handleSwatchSelect} />
        <Separator class="my-3" />
        <ColorPickerSliders compact />
        <ColorPickerControls />
      </Show>

      <Show when={variant() === "material"}>
        <ColorPickerSwatches columns={5} onSelect={handleSwatchSelect} />
        <Separator class="my-3" />
        <ColorPickerSliders compact />
        <ColorPickerControls />
      </Show>

      <Show when={variant() === "chrome"}>
        <ColorPickerSliders />
        <ColorPickerControls />
        <div class="mt-3 space-y-2">
          <p class="text-xs font-medium text-muted-foreground">Chrome 预设</p>
          <ColorPickerSwatches columns={10} />
        </div>
      </Show>

      <Show when={variant() === "swatch"}>
        <ColorPickerSwatches onSelect={handleSwatchSelect} />
        <Separator class="my-3" />
        <ColorPickerSliders />
        <ColorPickerControls />
      </Show>

      <Show when={variant() === "compact" || variant() === "minimal"}>
        <ColorPickerSliders compact />
        <ColorPickerControls />
      </Show>

      <Show when={variant() === "default" || variant() === "inline"}>
        <ColorPickerSliders />
        <Show when={ctx.showAlpha()}>
          <div class="mt-3">
            <ColorPickerChannels />
          </div>
        </Show>
        <ColorPickerControls />
        <div class="mt-3 space-y-2">
          <p class="text-xs font-medium text-muted-foreground">预设</p>
          <ColorPickerSwatches />
        </div>
      </Show>

      <div
        id={ctx.liveRegionId()}
        class="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        当前颜色 {ctx.formattedValue()}
      </div>
    </div>
  )
}

type ColorPickerTriggerProps<T extends ValidComponent = "button"> = {
  class?: string
  children?: JSX.Element
  as?: T
}

function ColorPickerTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ColorPickerTriggerProps<T>>
) {
  const ctx = useColorPickerContext("ColorPickerTrigger")
  const [local, others] = splitProps(props as ColorPickerTriggerProps, ["class", "children"])
  const hideValue = () =>
    ctx.triggerVariant() === "icon" ||
    ctx.variant() === "minimal" ||
    local.class?.includes("hide-value")

  return (
    <AriaExpandedButton
      type="button"
      id={ctx.labelId()}
      expanded={ctx.open()}
      variant={resolveTriggerButtonVariant(ctx.triggerVariant())}
      size={resolveTriggerButtonSize(ctx.triggerVariant(), ctx.size())}
      class={cn(
        colorPickerTriggerVariants({ variant: ctx.variant() }),
        ctx.triggerVariant() === "icon" &&
          cn(
            "aspect-square gap-0 p-0.5",
            ctx.size() === "sm" && "size-7 min-w-7",
            ctx.size() === "lg" && "size-10 min-w-10",
            ctx.size() === "default" && "size-8 min-w-8"
          ),
        ctx.triggerVariant() === "outline" && "bg-transparent shadow-sm",
        local.class
      )}
      disabled={ctx.disabled()}
      aria-haspopup="dialog"
      aria-controls={ctx.open() ? `${ctx.liveRegionId()}-panel` : undefined}
      aria-describedby={ctx.descriptionId()}
      onClick={() => ctx.setOpen(!ctx.open())}
      {...others}
    >
      <ColorSwatchPreview
        rgba={ctx.rgba()}
        class={cn(
          "shrink-0",
          ctx.triggerVariant() === "icon"
            ? "size-full rounded-[calc(var(--radius)-2px)]"
            : ctx.size() === "sm"
              ? "size-4"
              : "size-5"
        )}
      />
      <Show when={!hideValue()}>
        <span class="min-w-0 truncate font-mono text-xs">{ctx.formattedValue()}</span>
      </Show>
      {local.children}
    </AriaExpandedButton>
  )
}

function ColorPickerContent(props: { class?: string; mount?: HTMLElement }) {
  const ctx = useColorPickerContext("ColorPickerContent")
  let contentRef: HTMLDivElement | undefined
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  const [positioned, setPositioned] = createSignal(false)

  const syncPosition = () => {
    const trigger = document.getElementById(ctx.labelId() ?? "") ?? undefined
    scheduleColorPickerPosition(contentRef, trigger, setPosition, () => setPositioned(true))
  }

  const assignContentRef = (el: HTMLDivElement | undefined) => {
    contentRef = el
    if (el && ctx.open()) {
      setPositioned(false)
      syncPosition()
    }
  }

  createEffect(() => {
    if (!ctx.open()) {
      setPositioned(false)
      return
    }

    syncPosition()

    const handlePointerDown = (event: PointerEvent) => {
      if (ctx.eyeDropperActive()) return
      const target = event.target as Node
      const trigger = document.getElementById(ctx.labelId() ?? "") ?? undefined
      if (isColorPickerOverlayTarget(target, contentRef, trigger)) return
      ctx.setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        ctx.setOpen(false)
        document.getElementById(ctx.labelId() ?? "")?.focus()
      }
    }

    const handleReposition = () => syncPosition()

    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)

    onCleanup(() => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    })
  })

  return (
    <Show when={ctx.open()}>
      <Portal mount={props.mount}>
        <div
          ref={assignContentRef}
          id={`${ctx.liveRegionId()}-panel`}
          role="dialog"
          aria-modal="false"
          aria-label="颜色选择器"
          class={cn("fixed z-50", props.class)}
          style={{
            top: `${position().top}px`,
            left: `${position().left}px`,
            visibility: positioned() ? "visible" : "hidden",
            "pointer-events": positioned() && !ctx.eyeDropperActive() ? "auto" : "none",
          }}
        >
          <ColorPickerPanel />
        </div>
      </Portal>
    </Show>
  )
}

type ColorPickerRootProps = ParentProps & {
  value?: string
  defaultValue?: string
  onChange?: (value: string, rgba: RGBA) => void
  /** 受控显示/输出格式；设置后格式下拉不可用 */
  format?: ColorFormat
  /** 非受控时的初始显示格式 */
  defaultFormat?: ColorFormat
  /** 回调输出格式（可与面板显示格式不同，例如面板用 hsl 展示、回调仍输出 hex） */
  outputFormat?: ColorFormat
  onFormatChange?: (format: ColorFormat) => void
  variant?: ColorPickerVariant
  triggerVariant?: ColorPickerTriggerVariant
  size?: ColorPickerSize
  disabled?: boolean
  showAlpha?: boolean
  swatches?: readonly string[]
  swatchPreset?: ColorSwatchPreset
  class?: string
  id?: string
  label?: string
  description?: string
  "aria-label"?: string
}

function resolveSwatches(
  variant: ColorPickerVariant,
  swatches: readonly string[] | undefined,
  swatchPreset: ColorSwatchPreset | undefined
): readonly string[] {
  if (swatches) return swatches
  if (swatchPreset) return getSwatchesForPreset(swatchPreset)
  const preset = VARIANT_SWATCH_PRESET[variant]
  if (preset) return getSwatchesForPreset(preset)
  return DEFAULT_COLOR_SWATCHES
}

function resolveSwatchShape(variant: ColorPickerVariant): "square" | "circle" {
  return variant === "github" ? "circle" : "square"
}

function ColorPickerRoot(props: ColorPickerRootProps) {
  const merged = mergeProps(
    {
      defaultValue: "#3b82f6",
      variant: "default" as ColorPickerVariant,
      triggerVariant: "default" as ColorPickerTriggerVariant,
      size: "default" as ColorPickerSize,
      disabled: false,
      showAlpha: true,
    },
    props
  )

  const resolvedSwatches = resolveSwatches(
    merged.variant,
    merged.swatches,
    merged.swatchPreset
  )

  const parsedDefault = parseColor(merged.defaultValue) ?? { r: 59, g: 130, b: 246, a: 1 }
  const parsedDefaultHsv = rgbToHsv(parsedDefault.r, parsedDefault.g, parsedDefault.b)
  const [internalRgba, setInternalRgba] = createSignal<RGBA>(parsedDefault)
  const [storedHue, setStoredHue] = createSignal(
    hasDefinedHue(parsedDefaultHsv) ? parsedDefaultHsv.h : 0
  )
  const [panelFormat, setPanelFormat] = createSignal<ColorFormat>(
    merged.format ?? merged.defaultFormat ?? getDefaultFormat(merged.showAlpha)
  )
  const [open, setOpen] = createSignal(false)
  const [showCustomPicker, setShowCustomPicker] = createSignal(false)
  const [eyeDropperActive, setEyeDropperActive] = createSignal(false)
  const generatedId = `color-picker-${Math.random().toString(36).slice(2, 9)}`
  const fieldId = () => merged.id ?? generatedId
  const descriptionId = () => (merged.description ? `${fieldId()}-description` : undefined)
  const liveRegionId = () => `${fieldId()}-live`

  const rgba = createMemo(() => {
    if (merged.value !== undefined) {
      return parseColor(merged.value) ?? internalRgba()
    }
    return internalRgba()
  })

  const format = createMemo(() => {
    if (merged.format !== undefined) return merged.format
    return panelFormat()
  })

  const outputFormat = createMemo(() => merged.outputFormat ?? format())

  const resolvedFormat = createMemo(() => {
    const current = format()
    if (!merged.showAlpha) return current
    if (rgba().a < 0.999 && !formatSupportsAlpha(current)) {
      return getDefaultFormat(true)
    }
    return current
  })

  createEffect(() => {
    if (merged.format !== undefined) {
      setPanelFormat(merged.format)
    }
  })

  createEffect(() => {
    const color = rgba()
    const hsv = rgbToHsv(color.r, color.g, color.b)
    if (hasDefinedHue(hsv)) {
      setStoredHue(hsv.h)
    }
  })

  const formattedValue = createMemo(() => formatColor(rgba(), resolvedFormat()))

  const commitRgba = (normalized: RGBA) => {
    if (merged.value === undefined) {
      setInternalRgba(normalized)
    }
    merged.onChange?.(formatColor(normalized, outputFormat()), normalized)
  }

  const setRgba = (next: RGBA) => {
    const normalized = {
      r: next.r,
      g: next.g,
      b: next.b,
      a: merged.showAlpha ? next.a : 1,
    }
    commitRgba(normalized)
  }

  const setHue = (nextHue: number) => {
    const normalizedHue = normalizeHue(nextHue)
    setStoredHue(normalizedHue)
    const color = rgba()
    const hsv = rgbToHsv(color.r, color.g, color.b)
    const rgb = hsvToRgb(normalizedHue, hsv.s, hsv.v)
    commitRgba({
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: merged.showAlpha ? color.a : 1,
    })
  }

  const setFormat = (nextFormat: ColorFormat) => {
    if (merged.format !== undefined) return
    setPanelFormat(nextFormat)
    merged.onFormatChange?.(nextFormat)
  }

  const store: ColorPickerStore = {
    rgba,
    format,
    showAlpha: () => merged.showAlpha,
    disabled: () => merged.disabled,
    variant: () => merged.variant,
    triggerVariant: () => merged.triggerVariant,
    size: () => merged.size,
    open,
    swatches: () => resolvedSwatches,
    swatchShape: () => resolveSwatchShape(merged.variant),
    showCustomPicker,
    eyeDropperActive,
    labelId: () => fieldId(),
    descriptionId,
    liveRegionId,
    setRgba,
    setHue,
    setFormat,
    setOpen: (nextOpen) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        setShowCustomPicker(false)
        setEyeDropperActive(false)
        releaseStuckPointerInteractions()
      }
    },
    setShowCustomPicker,
    setEyeDropperActive,
    formattedValue,
    hue: storedHue,
  }

  return (
    <ColorPickerContext.Provider value={store}>
      <div
        class={cn("inline-flex flex-col gap-1.5", merged.class)}
        data-variant={merged.variant}
        data-size={merged.size}
      >
        <Show when={merged.label}>
          <Label id={`${fieldId()}-label`} for={fieldId()}>
            {merged.label}
          </Label>
        </Show>
        <Show when={merged.description}>
          <p id={descriptionId()} class="text-xs text-muted-foreground">
            {merged.description}
          </p>
        </Show>
        {merged.children}
      </div>
    </ColorPickerContext.Provider>
  )
}

export type ColorPickerProps = ColorPickerRootProps &
  VariantProps<typeof colorPickerTriggerVariants> & {
    class?: string
    contentClass?: string
    mount?: HTMLElement
    hideTriggerValue?: boolean
  }

function ColorPicker(props: ColorPickerProps) {
  const [local, others] = splitProps(props, [
    "class",
    "contentClass",
    "mount",
    "hideTriggerValue",
    "children",
  ])
  const isInline = () => (others.variant ?? "default") === "inline"
  const defaultTriggerVariant = () => {
    if (others.triggerVariant) return others.triggerVariant
    if (others.variant === "minimal") return "icon" as const
    return "default" as const
  }

  return (
    <ColorPickerRoot {...others} triggerVariant={defaultTriggerVariant()} class={local.class}>
      <Show
        when={!isInline()}
        fallback={
          <ColorPickerPanel class={local.contentClass} />
        }
      >
        <div class="inline-flex items-start gap-2">
          <ColorPickerTrigger
            aria-label={others["aria-label"] ?? others.label ?? "打开颜色选择器"}
            class={local.hideTriggerValue ? "hide-value" : undefined}
          />
          <ColorPickerContent class={local.contentClass} mount={local.mount} />
        </div>
      </Show>
      {local.children}
    </ColorPickerRoot>
  )
}

export {
  ColorPicker,
  ColorPickerRoot,
  ColorPickerTrigger,
  ColorPickerContent,
  ColorPickerPanel,
  ColorPickerArea,
  ColorPickerHueSlider,
  ColorPickerAlphaControl,
  ColorPickerFormatSelect,
  ColorPickerInput,
  ColorPickerSwatches,
  ColorPickerEyeDropper,
  ColorPickerPreview,
  ColorPickerChannels,
  ColorPickerSliders,
  ColorPickerControls,
  ColorSwatchPreview,
  colorPickerTriggerVariants,
  colorPickerPanelVariants,
  COLOR_SWATCH_PRESETS,
}
