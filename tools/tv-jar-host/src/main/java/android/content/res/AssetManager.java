package android.content.res;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

/** Desktop stub of AssetManager. */
public class AssetManager {
  public InputStream open(String fileName) {
    return new ByteArrayInputStream(new byte[0]);
  }
}
