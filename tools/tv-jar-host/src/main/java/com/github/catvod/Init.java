package com.github.catvod;

import android.app.Application;
import android.content.Context;

import java.lang.ref.WeakReference;

/** Desktop stub aligning FongMi com.github.catvod.Init */
public class Init {
  private WeakReference<Context> context = new WeakReference<>(Application.getDesktop());

  private static Init getInstance() {
    return Loader.INSTANCE;
  }

  public static void set(Context context) {
    getInstance().context = new WeakReference<>(context != null ? context : Application.getDesktop());
  }

  public static Context context() {
    Context c = getInstance().context.get();
    return c != null ? c : Application.getDesktop();
  }

  private static class Loader {
    static volatile Init INSTANCE = new Init();
  }
}
