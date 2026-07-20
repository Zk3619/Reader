# 修补 lib/json-*.jar 内 org.json.JSONObject.getString：数字/布尔自动 toString
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Lib = Join-Path $Root "lib"
$JsonJar = Get-ChildItem $Lib -Filter "json-*.jar" | Select-Object -First 1
if (-not $JsonJar) {
  Write-Host "skip patch-json: no json jar in lib (run fetch-host-libs.ps1)"
  exit 0
}

$Work = Join-Path $Root "build/patch-json"
Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Work | Out-Null

$SrcJar = $JsonJar.FullName
$OutJar = Join-Path $Work "json-patched.jar"
Copy-Item $SrcJar $OutJar

$ClassDir = Join-Path $Work "classes"
New-Item -ItemType Directory -Force -Path $ClassDir | Out-Null
Push-Location $Work
& jar xf $OutJar org/json/JSONObject.class
Pop-Location

$PatchMain = @'
import org.objectweb.asm.*;

import java.io.*;
import java.nio.file.*;
import java.util.jar.*;

public class PatchJsonGetString {
  public static void main(String[] args) throws Exception {
    Path classFile = Paths.get(args[0]);
    Path outJar = Paths.get(args[1]);
    byte[] patched = patch(Files.readAllBytes(classFile));
    Files.write(classFile, patched);
    Path tmp = outJar.resolveSibling(outJar.getFileName() + ".tmp");
    try (JarFile jar = new JarFile(outJar.toFile());
         JarOutputStream jos = new JarOutputStream(new FileOutputStream(tmp.toFile()))) {
      jar.stream().forEach(entry -> {
        try {
          jos.putNextEntry(new JarEntry(entry.getName()));
          if ("org/json/JSONObject.class".equals(entry.getName())) {
            jos.write(patched);
          } else {
            try (InputStream in = jar.getInputStream(entry)) {
              in.transferTo(jos);
            }
          }
          jos.closeEntry();
        } catch (IOException e) {
          throw new RuntimeException(e);
        }
      });
    }
    Files.move(tmp, outJar, StandardCopyOption.REPLACE_EXISTING);
    System.out.println("patched JSONObject.getString in " + outJar);
  }

  static byte[] patch(byte[] in) {
    ClassReader cr = new ClassReader(in);
    ClassWriter cw = new ClassWriter(0);
    cr.accept(new ClassVisitor(Opcodes.ASM9, cw) {
      @Override
      public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
        MethodVisitor mv = super.visitMethod(access, name, descriptor, signature, exceptions);
        if (!"getString".equals(name) || !"(Ljava/lang/String;)Ljava/lang/String;".equals(descriptor)) {
          return mv;
        }
        return new MethodVisitor(Opcodes.ASM9, mv) {
          private boolean replaced;

          @Override
          public void visitCode() {
            replaced = true;
            Label notString = new Label();
            Label notNumber = new Label();
            Label throwEx = new Label();
            super.visitCode();
            super.visitVarInsn(Opcodes.ALOAD, 0);
            super.visitVarInsn(Opcodes.ALOAD, 1);
            super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "org/json/JSONObject", "get", "(Ljava/lang/String;)Ljava/lang/Object;", false);
            super.visitVarInsn(Opcodes.ASTORE, 2);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitTypeInsn(Opcodes.INSTANCEOF, "java/lang/String");
            super.visitJumpInsn(Opcodes.IFEQ, notString);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitTypeInsn(Opcodes.CHECKCAST, "java/lang/String");
            super.visitInsn(Opcodes.ARETURN);
            super.visitLabel(notString);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitTypeInsn(Opcodes.INSTANCEOF, "java/lang/Number");
            super.visitJumpInsn(Opcodes.IFEQ, notNumber);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/String", "valueOf", "(Ljava/lang/Object;)Ljava/lang/String;", false);
            super.visitInsn(Opcodes.ARETURN);
            super.visitLabel(notNumber);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitTypeInsn(Opcodes.INSTANCEOF, "java/lang/Boolean");
            super.visitJumpInsn(Opcodes.IFEQ, throwEx);
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/String", "valueOf", "(Ljava/lang/Object;)Ljava/lang/String;", false);
            super.visitInsn(Opcodes.ARETURN);
            super.visitLabel(throwEx);
            super.visitVarInsn(Opcodes.ALOAD, 0);
            super.visitVarInsn(Opcodes.ALOAD, 1);
            super.visitLdcInsn("string");
            super.visitVarInsn(Opcodes.ALOAD, 2);
            super.visitInsn(Opcodes.ACONST_NULL);
            super.visitMethodInsn(Opcodes.INVOKEVIRTUAL, "org/json/JSONObject", "wrongValueFormatException", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;Ljava/lang/Throwable;)Lorg/json/JSONException;", false);
            super.visitInsn(Opcodes.ATHROW);
            super.visitMaxs(5, 3);
          }

          private void skipOriginal() {
            /* replaced body */
          }

          @Override
          public void visitInsn(int opcode) {
            if (!replaced) super.visitInsn(opcode);
          }

          @Override
          public void visitIntInsn(int opcode, int operand) {
            if (!replaced) super.visitIntInsn(opcode, operand);
          }

          @Override
          public void visitVarInsn(int opcode, int var) {
            if (!replaced) super.visitVarInsn(opcode, var);
          }

          @Override
          public void visitTypeInsn(int opcode, String type) {
            if (!replaced) super.visitTypeInsn(opcode, type);
          }

          @Override
          public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
            if (!replaced) super.visitFieldInsn(opcode, owner, name, descriptor);
          }

          @Override
          public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) {
            if (!replaced) super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
          }

          @Override
          public void visitJumpInsn(int opcode, Label label) {
            if (!replaced) super.visitJumpInsn(opcode, label);
          }

          @Override
          public void visitLabel(Label label) {
            if (!replaced) super.visitLabel(label);
          }

          @Override
          public void visitLdcInsn(Object value) {
            if (!replaced) super.visitLdcInsn(value);
          }

          @Override
          public void visitIincInsn(int var, int increment) {
            if (!replaced) super.visitIincInsn(var, increment);
          }

          @Override
          public void visitMaxs(int maxStack, int maxLocals) {
            if (!replaced) super.visitMaxs(maxStack, maxLocals);
          }
        };
      }
    }, 0);
    return cw.toByteArray();
  }
}
'@

$PatchDir = Join-Path $Work "asm"
New-Item -ItemType Directory -Force -Path $PatchDir | Out-Null
$patchJava = Join-Path $PatchDir "PatchJsonGetString.java"
[System.IO.File]::WriteAllText($patchJava, $PatchMain, (New-Object System.Text.UTF8Encoding $false))

$AsmJar = Get-ChildItem $Lib -Filter "asm-*.jar" | Select-Object -First 1
if (-not $AsmJar) {
  $AsmVer = "9.7.1"
  $AsmJarPath = Join-Path $Lib "asm-$AsmVer.jar"
  Write-Host "Downloading asm $AsmVer"
  Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/org/ow2/asm/asm/$AsmVer/asm-$AsmVer.jar" -OutFile $AsmJarPath -UseBasicParsing
  $AsmJar = Get-Item $AsmJarPath
}

& javac -encoding UTF-8 -cp $AsmJar.FullName -d $PatchDir $patchJava
$classFile = Join-Path $Work "org/json/JSONObject.class"
if ($LASTEXITCODE -ne 0) { throw "PatchJsonGetString javac failed" }
& java -cp "$PatchDir;$($AsmJar.FullName)" PatchJsonGetString $classFile $OutJar
if ($LASTEXITCODE -ne 0) { throw "PatchJsonGetString java failed" }

Copy-Item $OutJar $SrcJar -Force
Write-Host "OK patched $($JsonJar.Name)"
