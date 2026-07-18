package android.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;

/** Desktop stub of android.app.Application — Init.context() 常返回此类型。 */
public class Application extends Context {
  private static Application INSTANCE = new Application();

  public static Application getDesktop() {
    return INSTANCE;
  }

  @Override
  public Context getApplicationContext() {
    return this;
  }

  @Override
  public File getCacheDir() {
    return super.getCacheDir();
  }

  @Override
  public File getFilesDir() {
    return super.getFilesDir();
  }

  @Override
  public SharedPreferences getSharedPreferences(String name, int mode) {
    return super.getSharedPreferences(name, mode);
  }
}
