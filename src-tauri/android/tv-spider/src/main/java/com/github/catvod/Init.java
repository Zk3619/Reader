package com.github.catvod;

import android.app.Application;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 对齐 FongMi host {@code com.github.catvod.Init}。
 * 加固 JAR（DexNative / OkHttp 包装）会调 {@code context}/{@code execute}/{@code classLoader}。
 */
public final class Init {
  private WeakReference<Context> context = new WeakReference<>(null);
  private final ExecutorService executor = Executors.newCachedThreadPool();
  private volatile Handler handler;
  private volatile ClassLoader jarClassLoader;

  private static Init getInstance() {
    return Holder.INSTANCE;
  }

  public static void set(Context context) {
    getInstance().context = new WeakReference<>(context);
  }

  public static void setClassLoader(ClassLoader loader) {
    getInstance().jarClassLoader = loader;
  }

  public static Context context() {
    return getInstance().context.get();
  }

  public static Application application() {
    Context c = context();
    if (c instanceof Application) return (Application) c;
    if (c != null) {
      Context app = c.getApplicationContext();
      if (app instanceof Application) return (Application) app;
    }
    return null;
  }

  public static ClassLoader classLoader() {
    ClassLoader jar = getInstance().jarClassLoader;
    if (jar != null) return jar;
    Context c = context();
    return c != null ? c.getClassLoader() : Init.class.getClassLoader();
  }

  public static void execute(Runnable runnable) {
    if (runnable == null) return;
    try {
      getInstance().executor.execute(runnable);
    } catch (Throwable ignored) {
      new Thread(runnable, "tv-init-exec").start();
    }
  }

  public static void execute(Runnable runnable, long delayMs) {
    run(() -> execute(runnable), delayMs);
  }

  public static void run(Runnable runnable) {
    run(runnable, 0);
  }

  public static void run(Runnable runnable, long delayMs) {
    if (runnable == null) return;
    Handler h = getInstance().mainHandler();
    if (h == null) {
      runnable.run();
      return;
    }
    if (delayMs <= 0) h.post(runnable);
    else h.postDelayed(runnable, delayMs);
  }

  public static Handler handler() {
    return getInstance().mainHandler();
  }

  /** 部分源会反射调用；宿主侧无运行时权限弹窗。 */
  public static void checkPermission() {}

  private Handler mainHandler() {
    Handler h = handler;
    if (h != null) return h;
    try {
      h = new Handler(Looper.getMainLooper());
      handler = h;
    } catch (Throwable ignored) {
      return null;
    }
    return h;
  }

  private static final class Holder {
    static final Init INSTANCE = new Init();
  }
}
