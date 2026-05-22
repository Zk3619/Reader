import { createSignal, Show, onMount } from "solid-js";
import logoLight from "@/assets/logo-l-512x512.png";
import logoDark from "@/assets/logo-d-512x512.png";
import { cn } from "@/lib/utils";
import {
  ensureMainWindowVisible,
  isDevSplashDone,
  markDevSplashDone,
} from "@/lib/dev/splash-session";

interface SplashScreenProps {
  onComplete?: () => void;
}

export function SplashScreen(props: SplashScreenProps) {
  const skipForHmr = isDevSplashDone();
  const [isVisible, setIsVisible] = createSignal(!skipForHmr);
  const [isDark, setIsDark] = createSignal(false);

  onMount(async () => {
    // 开发环境 HMR：立即结束，避免白底遮罩盖住主界面
    if (skipForHmr) {
      await ensureMainWindowVisible();
      markDevSplashDone();
      props.onComplete?.();
      return;
    }

    await ensureMainWindowVisible();

    // 检测当前主题（支持 class=\"dark\" 和 data-kb-theme=\"dark\" 两种方式）
    const checkTheme = () => {
      const root = document.documentElement;
      const isDarkClass = root.classList.contains("dark");
      const kbTheme = root.getAttribute("data-kb-theme");
      setIsDark(isDarkClass || kbTheme === "dark");
    };
    checkTheme();

    // 监听主题变化
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      // 同时监听 class 和 data-kb-theme 变化，确保开屏动画能及时切换明暗 Logo
      attributeFilter: ["class", "data-kb-theme"],
    });

    // 动画持续时间（毫秒）
    const animationDuration = 1500;
    const fadeOutDelay = animationDuration - 300; // 在动画结束前300ms开始淡出

    const fadeTimer = window.setTimeout(() => {
      setIsVisible(false);
    }, fadeOutDelay);

    const completeTimer = window.setTimeout(() => {
      props.onComplete?.();
    }, animationDuration);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
      observer.disconnect();
    };
  });

  return (
    <Show when={isVisible()}>
      <div
        class={cn(
          "fixed inset-0 z-100 flex items-center justify-center transition-opacity duration-300",
          "bg-background",
          !isVisible() && "opacity-0 pointer-events-none"
        )}
      >
        {/* 背景装饰 */}
        <div class="absolute inset-0 overflow-hidden">
          {/* 浅色模式背景 */}
          <div
            class={cn(
              "absolute inset-0 transition-opacity duration-500",
              isDark() ? "opacity-0" : "opacity-100"
            )}
          >
            <div class="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse" />
            <div class="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/15 blur-3xl animate-pulse" style={{ "animation-delay": "0.5s" }} />
          </div>
          {/* 深色模式背景 */}
          <div
            class={cn(
              "absolute inset-0 transition-opacity duration-500",
              isDark() ? "opacity-100" : "opacity-0"
            )}
          >
            <div class="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse" />
            <div class="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-accent/25 blur-3xl animate-pulse delay-500" />
          </div>
        </div>

        {/* 主要内容 */}
        <div class="relative z-10 flex flex-col items-center gap-6">
          {/* Logo 容器 */}
          <div
            class={cn(
              "relative transition-all duration-700",
              "animate-in fade-in zoom-in-95"
            )}
          >
            {/* Logo 背景光晕 */}
            <div
              class={cn(
                "absolute inset-0 rounded-2xl blur-2xl transition-opacity duration-500",
                isDark() ? "bg-primary/30" : "bg-primary/20"
              )}
              style={{
                transform: "scale(1.5)",
              }}
            />
            
            {/* Logo 图片 */}
            <div
              class={cn(
                "relative flex h-24 w-24 items-center justify-center rounded-2xl",
                "bg-linear-to-br from-primary/10 to-accent/10",
                "dark:from-primary/20 dark:to-accent/20",
                "shadow-2xl ring-2 ring-primary/20 dark:ring-primary/30",
                "transition-all duration-700",
                "opacity-0 animate-[fadeInZoom_0.7s_ease-out_0.4s_forwards]"
              )}
            >
              <img
                src={isDark() ? logoDark : logoLight}
                alt="阅读"
                class="h-16 w-16 transition-opacity duration-500"
              />
            </div>
          </div>

          {/* 应用名称 */}
          <div
            class={cn(
              "flex flex-col items-center gap-2 transition-all duration-700",
              "opacity-0 translate-y-4 animate-[fadeInUp_0.7s_ease-out_0.6s_forwards]"
            )}
          >
            <h1
              class={cn(
                "text-3xl font-bold tracking-tight",
                "bg-linear-to-r from-foreground to-foreground/70 bg-clip-text text-transparent",
                "transition-all duration-500"
              )}
            >
              阅读
            </h1>
            <p
              class={cn(
                "text-sm text-muted-foreground",
                "transition-colors duration-500"
              )}
            >
              让阅读更简单
            </p>
          </div>

          {/* 加载指示器 */}
          <div
            class={cn(
              "mt-4 flex items-center gap-2 transition-all duration-700",
              "opacity-0 animate-[fadeIn_0.5s_ease-out_0.8s_forwards]"
            )}
          >
            <div class="flex gap-1.5">
              <div
                class={cn(
                  "h-2 w-2 rounded-full",
                  "bg-primary",
                  "animate-pulse"
                )}
                style={{ "animation-delay": "0s" }}
              />
              <div
                class={cn(
                  "h-2 w-2 rounded-full",
                  "bg-primary",
                  "animate-pulse"
                )}
                style={{ "animation-delay": "0.2s" }}
              />
              <div
                class={cn(
                  "h-2 w-2 rounded-full",
                  "bg-primary",
                  "animate-pulse"
                )}
                style={{ "animation-delay": "0.4s" }}
              />
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
