package com.reader.tvjarhost;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 最小 JVM class 文件生成（空类 / 空接口），供 Android stub ClassLoader 使用。 */
final class StubBytecode {
  private StubBytecode() {}

  static byte[] dump(String binaryName, boolean isInterface, String superInternal) {
    String thisInternal = binaryName.replace('.', '/');
    try {
      ConstPool cp = new ConstPool();
      int thisClass = cp.classRef(thisInternal);
      int superClass = cp.classRef(superInternal);
      int codeAttr = cp.utf8("Code");
      int initName = cp.utf8("<init>");
      int initDesc = cp.utf8("()V");
      int objectInit = cp.methodRef(superInternal.equals("java/lang/Object") ? "java/lang/Object" : superInternal, "<init>", "()V");

      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      DataOutputStream out = new DataOutputStream(buf);
      out.writeInt(0xCAFEBABE);
      out.writeShort(0); // minor
      out.writeShort(52); // major Java 8
      out.writeShort(cp.size());
      cp.write(out);

      int access = isInterface
          ? 0x0001 | 0x0200 | 0x0400 // public interface abstract
          : 0x0001; // public
      out.writeShort(access);
      out.writeShort(thisClass);
      out.writeShort(superClass);
      out.writeShort(0); // interfaces

      out.writeShort(0); // fields

      if (isInterface) {
        out.writeShort(0); // methods
      } else {
        out.writeShort(1); // <init>
        out.writeShort(0x0001); // public
        out.writeShort(initName);
        out.writeShort(initDesc);
        out.writeShort(1); // one attribute: Code
        out.writeShort(codeAttr);
        byte[] code = buildInitCode(objectInit);
        out.writeInt(code.length);
        out.write(code);
      }

      out.writeShort(0); // attributes
      out.flush();
      return buf.toByteArray();
    } catch (IOException e) {
      throw new IllegalStateException("stub bytecode " + binaryName, e);
    }
  }

  private static byte[] buildInitCode(int objectInitRef) throws IOException {
    ByteArrayOutputStream body = new ByteArrayOutputStream();
    DataOutputStream out = new DataOutputStream(body);
    out.writeShort(1); // max_stack
    out.writeShort(1); // max_locals
    byte[] ops = new byte[] {
        (byte) 0x2a, // aload_0
        (byte) 0xb7, // invokespecial
        (byte) ((objectInitRef >> 8) & 0xff),
        (byte) (objectInitRef & 0xff),
        (byte) 0xb1, // return
    };
    out.writeInt(ops.length);
    out.write(ops);
    out.writeShort(0); // exception table
    out.writeShort(0); // attributes
    out.flush();
    return body.toByteArray();
  }

  private static final class ConstPool {
    private final List<byte[]> entries = new ArrayList<>();
    private final Map<String, Integer> utf8 = new LinkedHashMap<>();
    private final Map<String, Integer> classes = new LinkedHashMap<>();
    private final Map<String, Integer> nat = new LinkedHashMap<>();
    private final Map<String, Integer> methods = new LinkedHashMap<>();

    int size() {
      return entries.size() + 1;
    }

    int utf8(String s) {
      Integer hit = utf8.get(s);
      if (hit != null) return hit;
      byte[] str = s.getBytes(StandardCharsets.UTF_8);
      ByteArrayOutputStream b = new ByteArrayOutputStream();
      try {
        b.write(1);
        b.write((str.length >> 8) & 0xff);
        b.write(str.length & 0xff);
        b.write(str);
      } catch (IOException e) {
        throw new IllegalStateException(e);
      }
      entries.add(b.toByteArray());
      int idx = entries.size();
      utf8.put(s, idx);
      return idx;
    }

    int classRef(String internal) {
      Integer hit = classes.get(internal);
      if (hit != null) return hit;
      int u = utf8(internal);
      entries.add(new byte[] {7, (byte) ((u >> 8) & 0xff), (byte) (u & 0xff)});
      int idx = entries.size();
      classes.put(internal, idx);
      return idx;
    }

    int nameAndType(String name, String desc) {
      String key = name + ":" + desc;
      Integer hit = nat.get(key);
      if (hit != null) return hit;
      int n = utf8(name);
      int d = utf8(desc);
      entries.add(
          new byte[] {
            12,
            (byte) ((n >> 8) & 0xff),
            (byte) (n & 0xff),
            (byte) ((d >> 8) & 0xff),
            (byte) (d & 0xff)
          });
      int idx = entries.size();
      nat.put(key, idx);
      return idx;
    }

    int methodRef(String ownerInternal, String name, String desc) {
      String key = ownerInternal + "#" + name + desc;
      Integer hit = methods.get(key);
      if (hit != null) return hit;
      int c = classRef(ownerInternal);
      int nt = nameAndType(name, desc);
      entries.add(
          new byte[] {
            10,
            (byte) ((c >> 8) & 0xff),
            (byte) (c & 0xff),
            (byte) ((nt >> 8) & 0xff),
            (byte) (nt & 0xff)
          });
      int idx = entries.size();
      methods.put(key, idx);
      return idx;
    }

    void write(DataOutputStream out) throws IOException {
      for (byte[] e : entries) out.write(e);
    }
  }
}
