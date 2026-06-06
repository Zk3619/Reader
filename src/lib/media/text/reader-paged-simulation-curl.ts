/**
 * 仿真翻页：Legado SimulationPageDelegate 的贝塞尔卷曲几何移植 + DOM 渲染。
 *
 * 与 Legado 一致：以拖拽点 (touchX,touchY) 与页脚 corner 实时计算两条贝塞尔曲线，
 * 得到「翻起页脚印 path0」「下层页可见区 path1」「翻起背面区 backArea」三块区域，
 * 背面用反射矩阵镜像贴回，叠加折痕/投影渐变阴影。Canvas 位图在此用 DOM clone +
 * clip-path: path() 还原（webview 为 Chromium，支持 path() 与 evenodd），效果等价。
 *
 * 坐标系：卷曲盒（满视口页面板宽 × 视口高，与 slide/覆盖 turn-layer 同层），原点左上，x→右，y→下。
 */

import { simulationDragZoneBoundaryPx } from '@/lib/media/text/reader-ui-config';
import { captureElementToDataUrl } from '@/lib/media/text/reader-paged-turn-snapshot';
import { resolveOpaquePageBackground } from '@/lib/media/text/reader-paged-turn-curtain';

export type SimulationCurlDirection = 'next' | 'prev';

export interface CurlPoint {
  x: number;
  y: number;
}

export interface SimulationCurlInput {
  touchX: number;
  touchY: number;
  cornerX: number;
  cornerY: number;
  width: number;
  height: number;
}

export interface SimulationCurlGeometry {
  touch: CurlPoint;
  corner: CurlPoint;
  control1: CurlPoint;
  control2: CurlPoint;
  start1: CurlPoint;
  start2: CurlPoint;
  end1: CurlPoint;
  end2: CurlPoint;
  vertex1: CurlPoint;
  vertex2: CurlPoint;
  isRtOrLb: boolean;
  degrees: number;
  touchToCornerDis: number;
  /** clip-path: path(evenodd, ...) —— 当前页平铺区（整页挖去 path0） */
  pageMinusCurlPath: string;
  /** clip-path: path(...) —— path0 翻起页脚印 */
  curlFootprintPath: string;
  /** clip-path: path(...) —— 下层页可见区 path1 */
  nextAreaPath: string;
  /** clip-path: path(...) —— 翻起页背面区 */
  backAreaPath: string;
  /** 背面镜像 CSS 矩阵 [a,b,c,d,e,f]（transform-origin:0 0） */
  backMatrix: [number, number, number, number, number, number];
}

function r(v: number): number {
  return Math.round(v * 100) / 100;
}

function pt(p: CurlPoint): string {
  return `${r(p.x)} ${r(p.y)}`;
}

/** 直线 P1P2 与 P3P4 的交点（Legado getCross 等价，含竖直线兜底） */
export function lineCross(P1: CurlPoint, P2: CurlPoint, P3: CurlPoint, P4: CurlPoint): CurlPoint {
  const dx12 = P2.x - P1.x;
  const dx34 = P4.x - P3.x;
  // 退化：竖直线用参数式求交，避免除零
  if (Math.abs(dx12) < 1e-6 || Math.abs(dx34) < 1e-6) {
    const a1 = Math.abs(dx12) < 1e-6 ? null : (P2.y - P1.y) / dx12;
    const a2 = Math.abs(dx34) < 1e-6 ? null : (P4.y - P3.y) / dx34;
    if (a1 == null && a2 == null) return { x: P1.x, y: P1.y };
    if (a1 == null) {
      const b2 = P3.y - a2! * P3.x;
      return { x: P1.x, y: a2! * P1.x + b2 };
    }
    const b1 = P1.y - a1 * P1.x;
    return { x: P3.x, y: a1 * P3.x + b1 };
  }
  const a1 = (P2.y - P1.y) / dx12;
  const b1 = (P1.x * P2.y - P2.x * P1.y) / (P1.x - P2.x);
  const a2 = (P4.y - P3.y) / dx34;
  const b2 = (P3.x * P4.y - P4.x * P3.y) / (P3.x - P4.x);
  if (Math.abs(a1 - a2) < 1e-6) return { x: P1.x, y: P1.y };
  const x = (b2 - b1) / (a1 - a2);
  return { x, y: a1 * x + b1 };
}

/**
 * 仿真拖拽意图：左区仅 prev（向右拖），右区仅 next（向左拖）。
 * @param zonePercent 左区占视口宽度百分比（25/50/75）
 */
export function simulationDragIntentFromOffset(
  offset: number,
  startLocalX: number,
  viewportWidth: number,
  deadzonePx: number,
  zonePercent: number = 50,
): SimulationCurlDirection | 'neutral' {
  let intent: SimulationCurlDirection | 'neutral' = 'neutral';
  if (offset < -deadzonePx) intent = 'next';
  else if (offset > deadzonePx) intent = 'prev';
  else return 'neutral';
  if (viewportWidth <= 0) return intent;
  const boundary = simulationDragZoneBoundaryPx(viewportWidth, zonePercent);
  if (startLocalX <= boundary) {
    return intent === 'next' ? 'neutral' : intent;
  }
  return intent === 'prev' ? 'neutral' : intent;
}

/** 仿真模式是否允许按当前 offset 提交翻页 */
export function simulationDragCommitAllowed(
  offset: number,
  startLocalX: number,
  viewportWidth: number,
  zonePercent: number = 50,
): boolean {
  if (viewportWidth <= 0) return true;
  const boundary = simulationDragZoneBoundaryPx(viewportWidth, zonePercent);
  if (startLocalX <= boundary) return offset > 0;
  return offset < 0;
}

/** Legado calcCornerXY：由触点相对中心定对角页脚 */
function calcCornerXY(x: number, y: number, width: number, height: number): CurlPoint {
  return {
    x: x <= width / 2 ? 0 : width,
    y: y <= height / 2 ? 0 : height,
  };
}

/**
 * 由按下起点与方向定页脚（对齐 Legado SimulationPageDelegate.setDirection）。
 * next：起点在左半屏时镜像 x；prev：始终按底边页脚重算。
 */
export function computeCurlCorner(
  startX: number,
  startY: number,
  width: number,
  height: number,
  direction: SimulationCurlDirection,
): CurlPoint {
  if (direction === 'prev') {
    if (startX > width / 2) return calcCornerXY(startX, height, width, height);
    return calcCornerXY(width - startX, height, width, height);
  }
  if (startX < width / 2) return calcCornerXY(width - startX, startY, width, height);
  return calcCornerXY(startX, startY, width, height);
}

/** 将折痕与底/顶边的交点钳在页内，避免越界后 Legado 硬回推 touch 造成折痕瞬移 */
function clampCurlEdgeStart1(start1: CurlPoint, width: number): CurlPoint {
  return {
    x: Math.max(0, Math.min(width, start1.x)),
    y: start1.y,
  };
}

/**
 * Legado SimulationPageDelegate.onTouch MOVE：中段水平拖拽时固定 touchY。
 * 底边/下半屏起手时允许纵向跟手，避免折痕贴底时无法上提。
 */
export function legadoSimulationTouchY(
  startY: number,
  touchY: number,
  height: number,
  direction: SimulationCurlDirection,
): number {
  const H = Math.max(1, height);
  const clampY = (y: number) => Math.max(1, Math.min(H, y));

  if (direction === 'next') {
    if (startY > H / 2) return clampY(touchY);
    if (startY > H / 3 && startY < H / 2) return 1;
    if (startY > H / 3 && startY < (2 * H) / 3) return H;
    return clampY(touchY);
  }

  if (startY > (2 * H) / 3) return clampY(touchY);
  if (startY > H / 3 && startY < (2 * H) / 3) return H;
  return clampY(touchY);
}

/**
 * 点击翻页动画起点（对齐 Legado HorizontalPageDelegate.prevPageByAnim / nextPageByAnim）。
 * prev：左下角；next：右侧近边缘。
 */
export function simulationAnimStartPoint(
  direction: SimulationCurlDirection,
  width: number,
  height: number,
): CurlPoint {
  if (direction === 'prev') {
    return { x: 0, y: height };
  }
  return { x: width * 0.9, y: 1 };
}

/**
 * 仿真翻页动画终点：prev 向右卷尽（dx = viewWidth - touchX），next 向左卷尽。
 * 须按翻页方向而非仅页脚位置计算，否则 prev 在右下页脚时会误指向左侧。
 */
export function simulationAnimEndTouch(
  corner: CurlPoint,
  width: number,
  height: number,
  direction: SimulationCurlDirection,
): CurlPoint {
  const y = corner.y === 0 ? height * 0.05 : height * 0.95;
  if (direction === 'prev') {
    return { x: width * 1.5, y };
  }
  const x = corner.x >= width / 2 ? -width * 0.5 : width * 1.5;
  return { x, y };
}

export function computeSimulationCurl(input: SimulationCurlInput): SimulationCurlGeometry {
  const W = Math.max(1, input.width);
  const H = Math.max(1, input.height);
  const cornerX = input.cornerX;
  const cornerY = input.cornerY;
  let touchX = input.touchX;
  let touchY = input.touchY;

  const isRtOrLb =
    (cornerX === 0 && cornerY === H) || (cornerY === 0 && cornerX === W);

  const calc = () => {
    const middleX = (touchX + cornerX) / 2;
    const middleY = (touchY + cornerY) / 2;
    const control1: CurlPoint = {
      x: middleX - (cornerY - middleY) ** 2 / (cornerX - middleX || 0.1),
      y: cornerY,
    };
    const f4 = cornerY - middleY;
    const control2: CurlPoint = {
      x: cornerX,
      y: middleY - (cornerX - middleX) ** 2 / (f4 === 0 ? 0.1 : f4),
    };
    const start1: CurlPoint = {
      x: control1.x - (cornerX - control1.x) / 2,
      y: cornerY,
    };
    return { middleX, middleY, control1, control2, start1 };
  };

  let { control1, control2, start1 } = calc();

  const start2: CurlPoint = {
    x: cornerX,
    y: control2.y - (cornerY - control2.y) / 2,
  };

  // 不修改 touch（保持跟手）；仅钳制折痕锚点在页内，平滑过渡底边→左边折痕
  start1 = clampCurlEdgeStart1(start1, W);

  const touch: CurlPoint = { x: touchX, y: touchY };
  const touchToCornerDis = Math.hypot(touchX - cornerX, touchY - cornerY);

  const end1 = lineCross(touch, control1, start1, start2);
  const end2 = lineCross(touch, control2, start1, start2);

  const vertex1: CurlPoint = {
    x: (start1.x + 2 * control1.x + end1.x) / 4,
    y: (2 * control1.y + start1.y + end1.y) / 4,
  };
  const vertex2: CurlPoint = {
    x: (start2.x + 2 * control2.x + end2.x) / 4,
    y: (2 * control2.y + start2.y + end2.y) / 4,
  };

  const degrees =
    (Math.atan2(control1.x - cornerX, control2.y - cornerY) * 180) / Math.PI;

  // 背面反射矩阵：沿折线镜像当前页（Legado drawCurrentBackArea mMatrixArray）
  const dis = Math.hypot(cornerX - control1.x, control2.y - cornerY) || 0.1;
  const f8 = (cornerX - control1.x) / dis;
  const f9 = (control2.y - cornerY) / dis;
  const a = 1 - 2 * f9 * f9;
  const skew = 2 * f8 * f9;
  const d = 1 - 2 * f8 * f8;
  // net = postTranslate(c1) · L · preTranslate(-c1)
  const tx = control1.x - (a * control1.x + skew * control1.y);
  const ty = control1.y - (skew * control1.x + d * control1.y);
  const backMatrix: [number, number, number, number, number, number] = [
    a,
    skew,
    skew,
    d,
    tx,
    ty,
  ];

  const curlFootprintPath =
    `M ${pt(start1)} Q ${pt(control1)} ${pt(end1)} L ${pt(touch)} ` +
    `L ${pt(end2)} Q ${pt(control2)} ${pt(start2)} L ${pt(corner(cornerX, cornerY))} Z`;
  const pageMinusCurlPath =
    `M0 0 L${r(W)} 0 L${r(W)} ${r(H)} L0 ${r(H)} Z ${curlFootprintPath}`;
  const nextAreaPath =
    `M ${pt(start1)} L ${pt(vertex1)} L ${pt(vertex2)} L ${pt(start2)} ` +
    `L ${pt(corner(cornerX, cornerY))} Z`;
  const backAreaPath =
    `M ${pt(vertex2)} L ${pt(vertex1)} L ${pt(end1)} L ${pt(touch)} L ${pt(end2)} Z`;

  return {
    touch,
    corner: { x: cornerX, y: cornerY },
    control1,
    control2,
    start1,
    start2,
    end1,
    end2,
    vertex1,
    vertex2,
    isRtOrLb,
    degrees,
    touchToCornerDis,
    pageMinusCurlPath,
    curlFootprintPath,
    nextAreaPath,
    backAreaPath,
    backMatrix,
  };
}

function corner(x: number, y: number): CurlPoint {
  return { x, y };
}

/* -------------------------------------------------------------------------- */
/* DOM 渲染                                                                    */
/* -------------------------------------------------------------------------- */

const FRONT_SLIDE_CLASS = 'reader-paged-turn-slide';
const BACK_CLASS = 'reader-paged-sim-back';
const BACK_INNER_CLASS = 'reader-paged-sim-back-inner';
const FOLD_SHADOW_CLASS = 'reader-paged-sim-fold-shadow';
const CREASE_SHADOW_CLASS = 'reader-paged-sim-crease-shadow';

function fmtMatrix(m: [number, number, number, number, number, number]): string {
  return m.map((v) => (Number.isFinite(v) ? v.toFixed(4) : '0')).join(',');
}

/** 下层页折痕渐变（Legado mBackShadowDrawable 简化；透明底 + multiply） */
function nextAreaShadowGradient(degrees: number, isRtOrLb: boolean): string {
  const deg = r(isRtOrLb ? degrees + 90 : degrees - 90);
  return (
    `linear-gradient(${deg}deg, ` +
    `rgba(17,17,17,0.38) 0%, rgba(17,17,17,0.14) 28%, rgba(17,17,17,0) 62%)`
  );
}

/** 镜像折痕渐变（Legado mFolderShadowDrawable 简化） */
function folderCreaseShadowGradient(degrees: number, isRtOrLb: boolean): string {
  const deg = r(isRtOrLb ? degrees : degrees + 180);
  return (
    `linear-gradient(${deg}deg, ` +
    `rgba(51,51,51,0.45) 0%, rgba(51,51,51,0.16) 34%, rgba(51,51,51,0) 68%)`
  );
}

let backSnapshotGeneration = 0;

function createDomBackInner(front: HTMLElement, pageBg: string): HTMLElement {
  const inner = front.cloneNode(true) as HTMLElement;
  inner.classList.remove(FRONT_SLIDE_CLASS);
  inner.classList.add(BACK_INNER_CLASS);
  inner.style.clipPath = '';
  inner.style.transformOrigin = '0 0';
  inner.style.backgroundColor = pageBg;
  inner.style.willChange = 'transform';
  inner.style.backfaceVisibility = 'hidden';
  return inner;
}

function scheduleBitmapBackInner(
  front: HTMLElement,
  back: HTMLElement,
  width: number,
  height: number,
  pageBg: string,
): void {
  const gen = ++backSnapshotGeneration;
  void captureElementToDataUrl(front, width, height).then((url) => {
    if (!url || gen !== backSnapshotGeneration || !back.isConnected) return;
    const inner = back.querySelector<HTMLElement>(`.${BACK_INNER_CLASS}`);
    if (!inner) return;
    inner.replaceChildren();
    inner.style.backgroundColor = pageBg;
    const img = document.createElement('img');
    img.src = url;
    img.draggable = false;
    img.decoding = 'sync';
    img.className = 'reader-paged-sim-back-img block h-full w-full pointer-events-none';
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    inner.appendChild(img);
  });
}

/**
 * 应用/更新仿真卷曲。front 幕帘（当前页 clone）须已挂载。首次克隆背面，后续仅更新。
 *
 * 背面镜像采用「外层裁剪（目标坐标）包裹内层反射 clone（局部坐标）」结构：
 * CSS clip-path 在 transform 之前的局部坐标生效，故外层不变换、按 backArea 目标区裁剪，
 * 内层施加反射矩阵呈现镜像页，二者叠加即得「目标区内可见的镜像背面」。
 */
export function updateSimulationCurl(params: {
  slideMount: HTMLElement | undefined;
  geometry: SimulationCurlGeometry;
  /** 页面底色；缺省从 front 向上解析 */
  pageBg?: string;
  /** 背面优先栅格化快照（对齐 Legado bitmap + 减轻 DOM 镜像发糊） */
  useBitmapBack?: boolean;
}): void {
  const { slideMount, geometry: g } = params;
  if (!slideMount) return;
  const front = slideMount.querySelector<HTMLElement>(`.${FRONT_SLIDE_CLASS}`);
  if (!front) return;

  const pageBg = params.pageBg ?? resolveOpaquePageBackground(front);
  const mountW = slideMount.clientWidth;
  const mountH = slideMount.clientHeight;

  front.style.clipPath = `path(evenodd, '${g.pageMinusCurlPath}')`;
  front.style.willChange = 'clip-path';

  let back = slideMount.querySelector<HTMLElement>(`.${BACK_CLASS}`);
  if (!back) {
    back = document.createElement('div');
    back.className = `${BACK_CLASS} pointer-events-none absolute inset-0`;
    back.setAttribute('aria-hidden', 'true');
    back.style.overflow = 'hidden';
    back.style.backgroundColor = pageBg;
    back.appendChild(createDomBackInner(front, pageBg));
    slideMount.appendChild(back);
    if (params.useBitmapBack && mountW > 0 && mountH > 0) {
      scheduleBitmapBackInner(front, back, mountW, mountH, pageBg);
    }
  }
  back.style.backgroundColor = pageBg;
  back.style.clipPath = `path('${g.backAreaPath}')`;
  const inner = back.querySelector<HTMLElement>(`.${BACK_INNER_CLASS}`);
  if (inner) {
    inner.style.backgroundColor = pageBg;
    inner.style.transform = `matrix(${fmtMatrix(g.backMatrix)}) translateZ(0)`;
  }

  // 下层页折痕阴影（path1 区；轻量 CSS 渐变，避免窄带+SVG 滤镜造成卡顿）
  let foldShadow = slideMount.querySelector<HTMLElement>(`.${FOLD_SHADOW_CLASS}`);
  if (!foldShadow) {
    foldShadow = document.createElement('div');
    foldShadow.className = `${FOLD_SHADOW_CLASS} pointer-events-none absolute inset-0`;
    foldShadow.style.pointerEvents = 'none';
    slideMount.insertBefore(foldShadow, back);
  }
  foldShadow.style.clipPath = `path('${g.nextAreaPath}')`;
  foldShadow.style.backgroundColor = 'transparent';
  foldShadow.style.backgroundImage = nextAreaShadowGradient(g.degrees, g.isRtOrLb);
  foldShadow.style.mixBlendMode = 'multiply';

  // 镜像折痕阴影（与下层同结构，尺寸/方向对齐折线）
  let creaseShadow = back.querySelector<HTMLElement>(`.${CREASE_SHADOW_CLASS}`);
  if (!creaseShadow) {
    creaseShadow = document.createElement('div');
    creaseShadow.className = `${CREASE_SHADOW_CLASS} pointer-events-none absolute inset-0`;
    back.appendChild(creaseShadow);
  }
  creaseShadow.style.backgroundColor = 'transparent';
  creaseShadow.style.backgroundImage = folderCreaseShadowGradient(g.degrees, g.isRtOrLb);
  creaseShadow.style.mixBlendMode = 'multiply';
}

export function clearSimulationCurl(slideMount: HTMLElement | undefined): void {
  if (!slideMount) return;
  backSnapshotGeneration += 1;
  const front = slideMount.querySelector<HTMLElement>(`.${FRONT_SLIDE_CLASS}`);
  if (front) {
    front.style.clipPath = '';
    front.style.willChange = '';
  }
  slideMount.querySelector(`.${BACK_CLASS}`)?.remove();
  slideMount.querySelector(`.${FOLD_SHADOW_CLASS}`)?.remove();
}
