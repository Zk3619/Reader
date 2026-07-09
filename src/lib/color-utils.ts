/**
 * 颜色解析与格式化工具（HEX / RGB / HSL / HWB，含透明度）
 */

export type ColorFormat = "hex" | "hex8" | "rgb" | "rgba" | "hsl" | "hsla" | "hwb" | "hwba"

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export interface HSV {
  h: number
  s: number
  v: number
}

export interface HSL {
  h: number
  s: number
  l: number
}

export interface HWB {
  h: number
  w: number
  b: number
}

export const DEFAULT_COLOR_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#ffffff",
  "#f3f4f6",
  "#d1d5db",
  "#6b7280",
  "#374151",
  "#111827",
  "#000000",
  "transparent",
] as const

/** Twitter 风格预设（参考 solid-color） */
export const TWITTER_COLOR_SWATCHES = [
  "#FF6900",
  "#FCB900",
  "#7BDCB5",
  "#00D084",
  "#8ED1FC",
  "#0693E3",
  "#ABB8C3",
  "#EB144C",
  "#F78DA7",
  "#9900EF",
  "#ffffff",
  "#000000",
  "transparent",
] as const

/** GitHub 风格预设 */
export const GITHUB_COLOR_SWATCHES = [
  "#B60205",
  "#D93F0B",
  "#FBCA04",
  "#0E8A16",
  "#006B75",
  "#1D76DB",
  "#0052CC",
  "#5319E7",
  "#E99695",
  "#F9D0C4",
  "#FEF2C0",
  "#C2E0C6",
  "#BFDADC",
  "#C5DEF5",
  "#BFD4F2",
  "#D4C5F9",
  "#ffffff",
  "#000000",
] as const

/** Chrome 开发者工具风格预设 */
export const CHROME_COLOR_SWATCHES = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#b7b7b7",
  "#cccccc",
  "#d9d9d9",
  "#efefef",
  "#f3f3f3",
  "#ffffff",
  "#980000",
  "#ff0000",
  "#ff9900",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#4a86e8",
  "#0000ff",
  "#9900ff",
  "#ff00ff",
] as const

/** Material Design 风格预设 */
export const MATERIAL_COLOR_SWATCHES = [
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#673AB7",
  "#3F51B5",
  "#2196F3",
  "#03A9F4",
  "#00BCD4",
  "#009688",
  "#4CAF50",
  "#8BC34A",
  "#CDDC39",
  "#FFEB3B",
  "#FFC107",
  "#FF9800",
  "#FF5722",
  "#795548",
  "#9E9E9E",
  "#607D8B",
  "#000000",
] as const

export type ColorSwatchPreset = "default" | "twitter" | "github" | "chrome" | "material"

export const COLOR_SWATCH_PRESETS: Record<ColorSwatchPreset, readonly string[]> = {
  default: DEFAULT_COLOR_SWATCHES,
  twitter: TWITTER_COLOR_SWATCHES,
  github: GITHUB_COLOR_SWATCHES,
  chrome: CHROME_COLOR_SWATCHES,
  material: MATERIAL_COLOR_SWATCHES,
}

/** 常用 CSS 命名色 */
const NAMED_COLORS: Record<string, RGBA> = {
  aliceblue: { r: 240, g: 248, b: 255, a: 1 },
  antiquewhite: { r: 250, g: 235, b: 215, a: 1 },
  aqua: { r: 0, g: 255, b: 255, a: 1 },
  aquamarine: { r: 127, g: 255, b: 212, a: 1 },
  azure: { r: 240, g: 255, b: 255, a: 1 },
  beige: { r: 245, g: 245, b: 220, a: 1 },
  bisque: { r: 255, g: 228, b: 196, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  coral: { r: 255, g: 127, b: 80, a: 1 },
  crimson: { r: 220, g: 20, b: 60, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  darkblue: { r: 0, g: 0, b: 139, a: 1 },
  darkgray: { r: 169, g: 169, b: 169, a: 1 },
  darkgreen: { r: 0, g: 100, b: 0, a: 1 },
  darkorange: { r: 255, g: 140, b: 0, a: 1 },
  darkred: { r: 139, g: 0, b: 0, a: 1 },
  gold: { r: 255, g: 215, b: 0, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  indigo: { r: 75, g: 0, b: 130, a: 1 },
  ivory: { r: 255, g: 255, b: 240, a: 1 },
  khaki: { r: 240, g: 230, b: 140, a: 1 },
  lavender: { r: 230, g: 230, b: 250, a: 1 },
  lime: { r: 0, g: 255, b: 0, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  maroon: { r: 128, g: 0, b: 0, a: 1 },
  navy: { r: 0, g: 0, b: 128, a: 1 },
  olive: { r: 128, g: 128, b: 0, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  salmon: { r: 250, g: 128, b: 114, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  skyblue: { r: 135, g: 206, b: 235, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  turquoise: { r: 64, g: 224, b: 208, a: 1 },
  violet: { r: 238, g: 130, b: 238, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  rebeccapurple: { r: 102, g: 51, b: 153, a: 1 },
  currentcolor: { r: 0, g: 0, b: 0, a: 1 },
}

const clampByte = (value: number) => Math.min(255, Math.max(0, Math.round(value)))
const clampUnit = (value: number) => Math.min(1, Math.max(0, value))
const clampHue = (value: number) => ((value % 360) + 360) % 360
const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function rgbaToCss(rgba: RGBA): string {
  if (rgba.a >= 1) {
    return `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})`
  }
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${roundAlpha(rgba.a)})`
}

export function roundAlpha(alpha: number): number {
  return Math.round(alpha * 1000) / 1000
}

export function normalizeRgba(rgba: RGBA): RGBA {
  return {
    r: clampByte(rgba.r),
    g: clampByte(rgba.g),
    b: clampByte(rgba.b),
    a: clampUnit(rgba.a),
  }
}

export function rgbaEqual(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && roundAlpha(a.a) === roundAlpha(b.a)
}

export function parseHex(input: string): RGBA | null {
  const raw = input.trim().replace(/^#/, "")
  if (raw.length === 3 || raw.length === 4) {
    const expanded = raw
      .split("")
      .map((char) => char + char)
      .join("")
    return parseHex(`#${expanded}`)
  }
  if (raw.length !== 6 && raw.length !== 8) return null
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
  const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1
  if (Number.isNaN(a)) return null
  return normalizeRgba({ r, g, b, a })
}

function parseChannelList(input: string): number[] | null {
  const values = input
    .trim()
    .replace(/%/g, "")
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((value) => Number(value))
  if (values.some((value) => Number.isNaN(value))) return null
  return values
}

export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0

  if (delta !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
        break
      case gn:
        h = ((bn - rn) / delta + 2) * 60
        break
      default:
        h = ((rn - gn) / delta + 4) * 60
        break
    }
  }

  return {
    h: clampHue(h),
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

export function hsvToRgb(h: number, s: number, v: number): RGBA {
  const hue = clampHue(h)
  const saturation = clampUnit(s)
  const value = clampUnit(v)
  const c = value * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = value - c

  let rn = 0
  let gn = 0
  let bn = 0

  if (hue < 60) {
    rn = c
    gn = x
  } else if (hue < 120) {
    rn = x
    gn = c
  } else if (hue < 180) {
    gn = c
    bn = x
  } else if (hue < 240) {
    gn = x
    bn = c
  } else if (hue < 300) {
    rn = x
    bn = c
  } else {
    rn = c
    bn = x
  }

  return normalizeRgba({
    r: (rn + m) * 255,
    g: (gn + m) * 255,
    b: (bn + m) * 255,
    a: 1,
  })
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case rn:
        h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60
        break
      case gn:
        h = ((bn - rn) / delta + 2) * 60
        break
      default:
        h = ((rn - gn) / delta + 4) * 60
        break
    }
  }

  return { h: clampHue(h), s: s * 100, l: l * 100 }
}

export function hslToRgb(h: number, s: number, l: number): RGBA {
  const hue = clampHue(h)
  const saturation = clampPercent(s) / 100
  const lightness = clampPercent(l) / 100

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - c / 2

  let rn = 0
  let gn = 0
  let bn = 0

  if (hue < 60) {
    rn = c
    gn = x
  } else if (hue < 120) {
    rn = x
    gn = c
  } else if (hue < 180) {
    gn = c
    bn = x
  } else if (hue < 240) {
    gn = x
    bn = c
  } else if (hue < 300) {
    rn = x
    bn = c
  } else {
    rn = c
    bn = x
  }

  return normalizeRgba({
    r: (rn + m) * 255,
    g: (gn + m) * 255,
    b: (bn + m) * 255,
    a: 1,
  })
}

export function rgbToHwb(r: number, g: number, b: number): HWB {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const white = min
  const black = 1 - max
  const chroma = max - min
  let h = 0

  if (chroma !== 0) {
    if (max === rn) h = ((gn - bn) / chroma) % 6
    else if (max === gn) h = (bn - rn) / chroma + 2
    else h = (rn - gn) / chroma + 4
    h *= 60
  }

  return {
    h: clampHue(h),
    w: white * 100,
    b: black * 100,
  }
}

export function hwbToRgb(h: number, w: number, b: number): RGBA {
  const hue = clampHue(h)
  const white = clampPercent(w) / 100
  const black = clampPercent(b) / 100

  if (white + black >= 1) {
    const gray = white / (white + black)
    return normalizeRgba({ r: gray * 255, g: gray * 255, b: gray * 255, a: 1 })
  }

  const rgb = hsvToRgb(hue, 1, 1)
  const factor = 1 - white - black
  return normalizeRgba({
    r: rgb.r * factor + white * 255,
    g: rgb.g * factor + white * 255,
    b: rgb.b * factor + white * 255,
    a: 1,
  })
}

export function parseColor(input: string): RGBA | null {
  const value = input.trim().toLowerCase()
  if (!value) return null
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 }

  const named = NAMED_COLORS[value]
  if (named) return { ...named }

  if (value.startsWith("#")) return parseHex(value)

  const rgbMatch = value.match(/^rgba?\((.+)\)$/i)
  if (rgbMatch) {
    const channels = parseChannelList(rgbMatch[1] ?? "")
    if (!channels || channels.length < 3) return null
    const [r, g, b, a = 1] = channels
    return normalizeRgba({ r, g, b, a })
  }

  const hslMatch = value.match(/^hsla?\((.+)\)$/i)
  if (hslMatch) {
    const body = hslMatch[1] ?? ""
    const [main, alphaPart] = body.split("/").map((part) => part.trim())
    const channels = parseChannelList(main ?? "")
    if (!channels || channels.length < 3) return null
    const [h, s, l] = channels
    const rgb = hslToRgb(h, s, l)
    const alpha = alphaPart !== undefined ? Number(alphaPart) : 1
    if (alphaPart !== undefined && Number.isNaN(alpha)) return null
    return normalizeRgba({ ...rgb, a: alpha })
  }

  const hwbMatch = value.match(/^hwba?\((.+)\)$/i)
  if (hwbMatch) {
    const body = hwbMatch[1] ?? ""
    const [main, alphaPart] = body.split("/").map((part) => part.trim())
    const channels = parseChannelList(main ?? "")
    if (!channels || channels.length < 3) return null
    const [h, w, b] = channels
    const rgb = hwbToRgb(h, w, b)
    const alpha = alphaPart ? Number(alphaPart) : 1
    if (Number.isNaN(alpha)) return null
    return normalizeRgba({ ...rgb, a: alpha })
  }

  return null
}

export function getSwatchesForPreset(preset: ColorSwatchPreset): readonly string[] {
  return COLOR_SWATCH_PRESETS[preset]
}

export function formatHex(rgba: RGBA, includeAlpha = false): string {
  const color = normalizeRgba(rgba)
  const toHex = (channel: number) => clampByte(channel).toString(16).padStart(2, "0")
  const base = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`
  if (!includeAlpha) return base
  return `${base}${toHex(color.a * 255)}`
}

export function formatRgb(rgba: RGBA, includeAlpha = false): string {
  const color = normalizeRgba(rgba)
  if (!includeAlpha || color.a >= 1) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`
  }
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${roundAlpha(color.a)})`
}

export function formatHsl(rgba: RGBA, includeAlpha = false): string {
  const color = normalizeRgba(rgba)
  const hsl = rgbToHsl(color.r, color.g, color.b)
  const h = Math.round(hsl.h)
  const s = Math.round(hsl.s)
  const l = Math.round(hsl.l)
  if (!includeAlpha || color.a >= 1) {
    return `hsl(${h}, ${s}%, ${l}%)`
  }
  return `hsla(${h}, ${s}%, ${l}%, ${roundAlpha(color.a)})`
}

export function formatHwb(rgba: RGBA, includeAlpha = false): string {
  const color = normalizeRgba(rgba)
  const hwb = rgbToHwb(color.r, color.g, color.b)
  const h = Math.round(hwb.h)
  const w = Math.round(hwb.w)
  const b = Math.round(hwb.b)
  if (!includeAlpha || color.a >= 1) {
    return `hwb(${h} ${w}% ${b}%)`
  }
  return `hwb(${h} ${w}% ${b}% / ${roundAlpha(color.a)})`
}

export function formatColor(rgba: RGBA, format: ColorFormat): string {
  switch (format) {
    case "hex":
      return formatHex(rgba, false)
    case "hex8":
      return formatHex(rgba, true)
    case "rgb":
      return formatRgb(rgba, false)
    case "rgba":
      return formatRgb(rgba, true)
    case "hsl":
      return formatHsl(rgba, false)
    case "hsla":
      return formatHsl(rgba, true)
    case "hwb":
      return formatHwb(rgba, false)
    case "hwba":
      return formatHwb(rgba, true)
    default:
      return formatHex(rgba, false)
  }
}

export function formatSupportsAlpha(format: ColorFormat): boolean {
  return format === "hex8" || format === "rgba" || format === "hsla" || format === "hwba"
}

export function getDefaultFormat(showAlpha: boolean): ColorFormat {
  return showAlpha ? "rgba" : "hex"
}

export function getHueColor(hue: number): string {
  const rgb = hsvToRgb(hue, 1, 1)
  return rgbaToCss(rgb)
}

export function getReadableTextColor(rgba: RGBA): string {
  const luminance = (0.299 * rgba.r + 0.587 * rgba.g + 0.114 * rgba.b) / 255
  return luminance > 0.6 ? "#111827" : "#f9fafb"
}
