/**
 * 仿真翻页：Legado SimulationPageDelegate 的贝塞尔卷曲几何移植 + DOM 渲染。
 *
 * 与 Legado 一致：以拖拽点 (touchX,touchY) 与页脚 corner 实时计算两条贝塞尔曲线，
 * 得到「翻起页脚印 path0」「下层页可见区 path1」「翻起背面区 backArea」三块区域，
 * 背面用反射矩阵镜像贴回，叠加折痕/投影渐变阴影。Canvas 位图在此用 DOM clone +
 * clip-path: path() 还原（webview 为 Chromium，支持 path() 与 evenodd），效果等价。
 *
 * 坐标系：卷曲盒（content-slot 内宽 × 正文高），原点左上，x→右，y→下。
 */

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

/**
 * Legado SimulationPageDelegate.onTouch MOVE：中段水平拖拽时固定 touchY，
 * 使卷曲跟手更稳定（尤其 prev 与 next 中上段）。
 */
export function legadoSimulationTouchY(
  startY: number,
  touchY: number,
  height: number,
  direction: SimulationCurlDirection,
): number {
  const H = Math.max(1, height);
  let y = touchY;
  // 两段 if 顺序与 Legado 一致；第二段可覆盖第一段（next 上中段 → touchY=1）
  if ((startY > H / 3 && startY < (2 * H) / 3) || direction === 'prev') y = H;
  if (startY > H / 3 && startY < H / 2 && direction === 'next') y = 1;
  return y;
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

  // 固定左右边界：start1.x 越界时回推 touch，避免卷曲超出页面（Legado calcPoints 同款）
  if (touchX > 0 && touchX < W && (start1.x < 0 || start1.x > W)) {
    if (start1.x < 0) start1.x = W - start1.x;
    const f1 = Math.abs(cornerX - touchX);
    const f2 = (W * f1) / start1.x;
    touchX = Math.abs(cornerX - f2);
    const f3 = (Math.abs(cornerX - touchX) * Math.abs(cornerY - touchY)) / f1;
    touchY = Math.abs(cornerY - f3);
    ({ control1, control2, start1 } = calc());
  }

  const start2: CurlPoint = {
    x: cornerX,
    y: control2.y - (cornerY - control2.y) / 2,
  };

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
    r(a),
    r(skew),
    r(skew),
    r(d),
    r(tx),
    r(ty),
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
const BACK_SHADE_CLASS = 'reader-paged-sim-back-shade';
const FOLD_SHADOW_CLASS = 'reader-paged-sim-fold-shadow';

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
}): void {
  const { slideMount, geometry: g } = params;
  if (!slideMount) return;
  const front = slideMount.querySelector<HTMLElement>(`.${FRONT_SLIDE_CLASS}`);
  if (!front) return;

  front.style.clipPath = `path(evenodd, '${g.pageMinusCurlPath}')`;
  front.style.willChange = 'clip-path';

  // 镜像背面（懒克隆）
  let back = slideMount.querySelector<HTMLElement>(`.${BACK_CLASS}`);
  if (!back) {
    back = document.createElement('div');
    back.className = `${BACK_CLASS} pointer-events-none absolute inset-x-0 top-0`;
    back.setAttribute('aria-hidden', 'true');
    back.style.height = front.style.height || '100%';
    back.style.overflow = 'visible';

    const inner = front.cloneNode(true) as HTMLElement;
    inner.classList.remove(FRONT_SLIDE_CLASS);
    inner.classList.add(BACK_INNER_CLASS);
    inner.style.clipPath = '';
    inner.style.transformOrigin = '0 0';
    inner.style.filter = 'brightness(0.93)';
    inner.style.willChange = 'transform';
    back.appendChild(inner);

    // 背面压暗渐变（折痕侧更暗）
    const shade = document.createElement('div');
    shade.className = `${BACK_SHADE_CLASS} pointer-events-none absolute inset-0`;
    back.appendChild(shade);

    slideMount.appendChild(back);
  }
  back.style.clipPath = `path('${g.backAreaPath}')`;
  const inner = back.querySelector<HTMLElement>(`.${BACK_INNER_CLASS}`);
  if (inner) inner.style.transform = `matrix(${g.backMatrix.join(',')})`;
  const shade = back.querySelector<HTMLElement>(`.${BACK_SHADE_CLASS}`);
  if (shade) {
    shade.style.background =
      `linear-gradient(${r(g.degrees + 90)}deg, ` +
      `rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0) 72%)`;
  }

  // 翻起页投影（落在下层页 path1 可见区靠折线一侧）
  let foldShadow = slideMount.querySelector<HTMLElement>(`.${FOLD_SHADOW_CLASS}`);
  if (!foldShadow) {
    foldShadow = document.createElement('div');
    foldShadow.className = `${FOLD_SHADOW_CLASS} pointer-events-none absolute inset-x-0 top-0`;
    foldShadow.style.height = front.style.height || '100%';
    slideMount.insertBefore(foldShadow, back);
  }
  foldShadow.style.clipPath = `path('${g.nextAreaPath}')`;
  foldShadow.style.background =
    `linear-gradient(${r(g.degrees + 90)}deg, ` +
    `rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.12) 22%, rgba(0,0,0,0) 55%)`;
}

export function clearSimulationCurl(slideMount: HTMLElement | undefined): void {
  if (!slideMount) return;
  const front = slideMount.querySelector<HTMLElement>(`.${FRONT_SLIDE_CLASS}`);
  if (front) {
    front.style.clipPath = '';
    front.style.willChange = '';
  }
  slideMount.querySelector(`.${BACK_CLASS}`)?.remove();
  slideMount.querySelector(`.${FOLD_SHADOW_CLASS}`)?.remove();
}
