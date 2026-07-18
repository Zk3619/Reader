package com.reader.tvjarhost;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 为缺失的 android.* 类按需生成空 stub；host 内真实 stub（Context/Application/Init）优先。
 */
final class AndroidStubClassLoader extends ClassLoader {
  private final Map<String, Class<?>> defined = new ConcurrentHashMap<>();

  AndroidStubClassLoader(ClassLoader parent) {
    super(parent);
  }

  @Override
  protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
    if (!isAndroidFamily(name)) {
      try {
        return finish(super.loadClass(name, false), resolve);
      } catch (ClassNotFoundException e) {
        throw e;
      } catch (ClassFormatError e) {
        if ("com.github.catvod.spider.Init".equals(name)) {
          return finish(super.loadClass(name, false), resolve);
        }
        throw e;
      }
    }
    synchronized (getClassLoadingLock(name)) {
      Class<?> loaded = findLoadedClass(name);
      if (loaded != null) return finish(loaded, resolve);
      Class<?> cached = defined.get(name);
      if (cached != null) return finish(cached, resolve);
      try {
        return finish(super.loadClass(name, false), resolve);
      } catch (ClassNotFoundException ignored) {
        Class<?> stub = defineStub(name);
        defined.put(name, stub);
        return finish(stub, resolve);
      }
    }
  }

  private Class<?> finish(Class<?> c, boolean resolve) {
    if (resolve) resolveClass(c);
    return c;
  }

  private static boolean isAndroidFamily(String name) {
    return name.startsWith("android.")
        || name.startsWith("dalvik.")
        || name.startsWith("com.android.");
  }

  private Class<?> defineStub(String name) {
    boolean iface = looksLikeInterface(name);
    String superName = pickSuper(name, iface);
    byte[] bytes = StubBytecode.dump(name, iface, superName);
    return defineClass(name, bytes, 0, bytes.length);
  }

  private static boolean looksLikeInterface(String name) {
    if (name.endsWith("Listener")
        || name.endsWith("Callback")
        || name.endsWith("Observer")
        || name.endsWith("Factory")) {
      return true;
    }
    return switch (name) {
      case "android.content.DialogInterface",
          "android.content.pm.PackageManager",
          "android.view.Menu",
          "android.view.MenuItem",
          "android.text.Editable",
          "android.graphics.drawable.Drawable",
          "android.os.Parcelable",
          "android.os.IBinder" -> true;
      default -> false;
    };
  }

  private static String pickSuper(String name, boolean iface) {
    if (iface) return "java/lang/Object";
    return switch (name) {
      case "android.app.Activity",
          "android.app.Service",
          "android.content.ContextWrapper" -> "android/content/Context";
      case "android.app.AlertDialog",
          "android.app.ProgressDialog" -> "android/app/Dialog";
      case "android.widget.TextView",
          "android.widget.EditText",
          "android.widget.Button",
          "android.widget.ImageView",
          "android.widget.ListView",
          "android.widget.LinearLayout",
          "android.widget.FrameLayout" -> "android/view/View";
      case "android.view.ViewGroup" -> "android/view/View";
      case "android.graphics.drawable.ColorDrawable" -> "android/graphics/drawable/Drawable";
      default -> "java/lang/Object";
    };
  }
}
