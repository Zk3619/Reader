import { createSignal, onCleanup, onMount } from "solid-js";
import logoLight from "@/assets/icon-l-512x512.png";
import logoDark from "@/assets/icon-d-512x512.png";
import { cn } from "@/lib/utils";
import { getEffectiveDark } from "@/lib/theme";
import {
  ensureMainWindowVisible,
  isDevSplashDone,
  markDevSplashDone,
} from "@/lib/dev/splash-session";

interface SplashScreenProps {
  onComplete?: () => void;
}

const ANIMATION_MS = 1500;
const FADE_OUT_MS = 300;

export function SplashScreen(props: SplashScreenProps) {
  const skipForHmr = isDevSplashDone();
  /** 控制 opacity；淡出期间组件仍挂载，避免硬切 */
  const [opaque, setOpaque] = createSignal(!skipForHmr);
  const [isDark, setIsDark] = createSignal(
    typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark") || getEffectiveDark()),
  );

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    markDevSplashDone();
    props.onComplete?.();
  };

  onMount(() => {
    let cancelled = false;
    const timers: number[] = [];
    let observer: MutationObserver | null = null;

    const startFadeOut = () => {
      if (cancelled || finished) return;
      setOpaque(false);
      // transitionend 兜底：部分 WebView 可能不派发
      timers.push(
        window.setTimeout(() => {
          finish();
        }, FADE_OUT_MS + 50),
      );
    };

    void (async () => {
      // 开发环境 HMR：立即结束，避免白底遮罩盖住主界面
      if (skipForHmr) {
        await ensureMainWindowVisible();
        finish();
        return;
      }

      // 限时 show 窗口：避免被影视 JAR 等 IPC 堵住后永远不启动淡出定时器
      await Promise.race([
        ensureMainWindowVisible(),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000);
        }),
      ]);
      if (cancelled) return;

      const checkTheme = () => {
        const root = document.documentElement;
        const isDarkClass = root.classList.contains("dark");
        const kbTheme = root.getAttribute("data-kb-theme");
        setIsDark(isDarkClass || kbTheme === "dark");
      };
      checkTheme();

      observer = new MutationObserver(checkTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-kb-theme"],
      });

      // 入场播完后再淡出；onComplete 在淡出结束后触发
      timers.push(
        window.setTimeout(() => {
          startFadeOut();
        }, ANIMATION_MS - FADE_OUT_MS),
      );
    })();

    onCleanup(() => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      observer?.disconnect();
    });
  });

  return (
    <div
      class={cn(
        "fixed inset-0 z-100 flex items-center justify-center",
        "bg-background transition-opacity ease-out",
        opaque() ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ "transition-duration": `${FADE_OUT_MS}ms` }}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.propertyName !== "opacity") return;
        if (opaque()) return;
        finish();
      }}
    >
      {/* 背景装饰：勿 overflow-hidden，以免裁切 box-shadow 光斑 */}
      <div class="pointer-events-none absolute inset-0">
        <div
          class={cn(
            "absolute inset-0 transition-opacity duration-500",
            isDark() ? "opacity-0" : "opacity-100",
          )}
        >
          <div class="splash-glow-blob splash-glow-blob--primary-light top-1/4 left-1/4 animate-pulse" />
          <div
            class="splash-glow-blob splash-glow-blob--accent-light right-1/4 bottom-1/4 animate-pulse"
            style={{ "animation-delay": "0.5s" }}
          />
        </div>
        <div
          class={cn(
            "absolute inset-0 transition-opacity duration-500",
            isDark() ? "opacity-100" : "opacity-0",
          )}
        >
          <div class="splash-glow-blob splash-glow-blob--primary-dark top-1/4 left-1/4 animate-pulse" />
          <div
            class="splash-glow-blob splash-glow-blob--accent-dark right-1/4 bottom-1/4 animate-pulse"
            style={{ "animation-delay": "0.5s" }}
          />
        </div>
      </div>

      <div class="relative z-10 flex flex-col items-center gap-6">
        <div class={cn("relative transition-all duration-700", "animate-in fade-in zoom-in-95")}>
          {/* logo 为纯白（浅色模式）/纯黑（深色模式）图标，容器使用实心 foreground 底色保证对比度 */}
          <div
            class={cn(
              "splash-logo-glow relative flex h-24 w-24 items-center justify-center rounded-2xl",
              "bg-foreground shadow-lg",
              "transition-all duration-700",
              "opacity-0 animate-[fadeInZoom_0.7s_ease-out_0.4s_forwards]",
            )}
          >
            <img
              src={isDark() ? logoDark : logoLight}
              alt="阅读"
              class="h-14 w-14 transition-opacity duration-500"
            />
          </div>
        </div>

        <div
          class={cn(
            "flex flex-col items-center gap-2 transition-all duration-700",
            "opacity-0 translate-y-4 animate-[fadeInUp_0.7s_ease-out_0.6s_forwards]",
          )}
        >
          <h1
            class={cn(
              "text-3xl font-bold tracking-tight",
              "bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent",
              "transition-all duration-500",
            )}
          >
            阅读
          </h1>
          <p class={cn("text-sm text-muted-foreground", "transition-colors duration-500")}>
            让阅读更简单
          </p>
        </div>

        <div
          class={cn(
            "mt-4 flex items-center gap-2 transition-all duration-700",
            "opacity-0 animate-[fadeIn_0.5s_ease-out_0.8s_forwards]",
          )}
        >
          <div class="flex gap-1.5">
            <div
              class="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ "animation-delay": "0s" }}
            />
            <div
              class="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ "animation-delay": "0.2s" }}
            />
            <div
              class="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ "animation-delay": "0.4s" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
