/**
 * 原生依赖构建环境探测。
 *
 * - lite（默认）：不注入原生工具链环境
 * - full（tls-impersonate）：MSVC + Ninja + NASM≥2.16.03 + libclang（BoringSSL/btls）
 * - Android btls：仅 full 时由调用方注入 androidNativeBuildEnv
 *
 * 详见 docs/HTTP_CLIENT.md。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MIN_NASM = [2, 16, 3];

function log(msg) {
  console.log(`[native-env] ${msg}`);
}

function parseVersion(text) {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text || '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

function gte(a, b) {
  for (let i = 0; i < b.length; i += 1) {
    const x = a[i] ?? 0;
    if (x !== b[i]) return x > b[i];
  }
  return true;
}

function tryExec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
}

function vswhereCandidates() {
  const programFiles =
    process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
  if (!programFiles) return [];
  const vswhere = path.join(
    programFiles,
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe',
  );
  if (!fs.existsSync(vswhere)) return [];
  const out = tryExec(
    `"${vswhere}" -prerelease -latest -products * ` +
      `-requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 ` +
      `-property installationPath`,
  );
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function findVcvars() {
  const roots = vswhereCandidates();
  for (const root of roots) {
    const bat = path.join(root, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat');
    if (fs.existsSync(bat)) return bat;
  }
  return null;
}

/** 用 vcvars64 派生出的完整环境（vcvars 继承当前环境，因此结果是超集）。 */
function msvcEnv(vcvars) {
  const out = tryExec(`"${vcvars}" >nul 2>nul && set`);
  if (!out) return null;
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    if (!/^[A-Za-z_][A-Za-z0-9_()]*$/.test(key)) continue;
    env[key] = line.slice(eq + 1);
  }
  return env.INCLUDE && env.LIB ? env : null;
}

/**
 * bindgen 需要 libclang.dll。优先 VS 自带 LLVM，其次独立 LLVM，最后 Android NDK
 * （NDK 里的是 Windows 原生 DLL，用于 host 解析头文件同样有效）。
 */
function findLibclangDir(env) {
  const dirs = [];
  if (env.VCINSTALLDIR) {
    dirs.push(path.join(env.VCINSTALLDIR, 'Tools', 'Llvm', 'x64', 'bin'));
    dirs.push(path.join(env.VCINSTALLDIR, 'Tools', 'Llvm', 'bin'));
  }
  for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
    if (pf) dirs.push(path.join(pf, 'LLVM', 'bin'));
  }

  for (const ndk of discoverNdkHomes(env)) {
    dirs.push(
      path.join(ndk, 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin'),
    );
  }

  return (
    dirs.find((dir) =>
      ['libclang.dll', 'clang.dll'].some((dll) =>
        fs.existsSync(path.join(dir, dll)),
      ),
    ) || null
  );
}

/** ANDROID_NDK_HOME / ANDROID_NDK_ROOT / 默认 SDK 下最新 NDK。 */
function discoverNdkHomes(env) {
  const found = [];
  for (const key of ['ANDROID_NDK_HOME', 'ANDROID_NDK_ROOT', 'NDK_HOME']) {
    const v = env[key] || process.env[key];
    if (v && fs.existsSync(v)) found.push(v);
  }
  const sdkRoots = [
    env.ANDROID_HOME || process.env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT || process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
      : null,
  ].filter(Boolean);
  for (const sdk of sdkRoots) {
    const ndkRoot = path.join(sdk, 'ndk');
    if (!fs.existsSync(ndkRoot)) continue;
    try {
      const versions = fs
        .readdirSync(ndkRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();
      for (const ver of versions) found.push(path.join(ndkRoot, ver));
    } catch {
      /* ignore */
    }
  }
  return [...new Set(found)];
}

function nasmVersion(exe) {
  const out = tryExec(`"${exe}" -v`);
  return out ? parseVersion(out) : null;
}

/** 优先工程内自带的 NASM；否则用 PATH 上版本达标的那个。 */
function findNasmDir(repoRoot) {
  const bundled = path.join(
    repoRoot,
    'src-tauri',
    'tools',
    'nasm',
    'bin',
    'nasm.exe',
  );
  if (fs.existsSync(bundled)) {
    const v = nasmVersion(bundled);
    if (v && gte(v, MIN_NASM)) return path.dirname(bundled);
  }
  const found = tryExec('where nasm');
  for (const exe of (found || '').split(/\r?\n/).map((l) => l.trim())) {
    if (!exe) continue;
    const v = nasmVersion(exe);
    if (v && gte(v, MIN_NASM)) return path.dirname(exe);
  }
  return null;
}

/** 前插目录；basePath 为补丁未含 PATH 时的兜底（避免把 PATH 清空）。 */
function prependPath(patch, dirs, basePath) {
  const extra = dirs.filter(Boolean);
  if (!extra.length) return;
  const current = patch.PATH ?? basePath ?? '';
  patch.PATH = [...extra, current].filter(Boolean).join(path.delimiter);
}

/**
 * Windows：返回给 cargo/tauri 子进程的环境补丁（不改动 process.env）。
 *
 * @param {string} repoRoot
 * @param {{ full?: boolean }} [opts]
 *   - full=false（默认）：lite，不探测、不注入
 *   - full=true：tls-impersonate / BoringSSL 完整工具链
 */
export function windowsNativeBuildEnv(repoRoot, opts = {}) {
  if (process.platform !== 'win32') return {};

  const full = opts.full === true;

  if (!full) {
    return {};
  }

  const patch = {};

  // 已在 Developer Prompt 里则复用，否则从 vcvars64 派生
  if (process.env.INCLUDE && process.env.LIB) {
    log('复用当前 MSVC 开发环境');
  } else {
    const vcvars = findVcvars();
    const env = vcvars ? msvcEnv(vcvars) : null;
    if (env) {
      Object.assign(patch, env);
      log(`已加载 MSVC 环境：${vcvars}`);
    } else {
      log(
        '未能加载 MSVC 环境（vcvars64.bat 未找到）；' +
          '若 BoringSSL 构建失败，请在 Developer PowerShell 中运行',
      );
    }
  }

  // cmake-rs 会猜到过新的 VS generator，旧 CMake 不认；统一 Ninja
  if (!process.env.CMAKE_GENERATOR) {
    patch.CMAKE_GENERATOR = 'Ninja';
  }

  const nasmDir = findNasmDir(repoRoot);
  if (nasmDir) {
    prependPath(patch, [nasmDir], process.env.PATH);
  } else {
    log(
      `未找到 NASM ≥ ${MIN_NASM.join('.')}；` +
        'BoringSSL 仍需安装 NASM（见 docs/HTTP_CLIENT.md）',
    );
  }

  if (!process.env.LIBCLANG_PATH) {
    const libclangDir = findLibclangDir({ ...process.env, ...patch });
    if (libclangDir) {
      patch.LIBCLANG_PATH = libclangDir;
    } else {
      log(
        '未找到 libclang.dll；btls-sys 的 bindgen 会失败。' +
          '请安装 LLVM 或 VS 的 Clang 组件，或设置 LIBCLANG_PATH',
      );
    }
  }

  // NDK / mingw 版 libclang 默认 target 是 *-windows-gnu，会去 mingw 的
  // include 里找头文件（mm_malloc.h 缺失）。强制按 MSVC target 解析。
  const bindgenTargetVar = 'BINDGEN_EXTRA_CLANG_ARGS_x86_64-pc-windows-msvc';
  if (!process.env[bindgenTargetVar] && !process.env.BINDGEN_EXTRA_CLANG_ARGS) {
    patch[bindgenTargetVar] = '--target=x86_64-pc-windows-msvc';
  }

  return patch;
}

/**
 * Android：btls-sys 默认按 API 21 配置 CMake，但 NDK 26+ 已无 API 21 的 CRT；
 * 它还会把 cargo-mobile2 注入的 TARGET_CC（.cmd 包装器）写进 CMAKE_C_COMPILER，
 * 与 android.toolchain.cmake 抢编译器，第二次 configure 时按 Windows 方式链接而崩。
 *
 * 解法是给每个 Android target 指定 src-tauri/cmake 下自带 ABI/API 的 toolchain 文件，
 * btls-sys 见到 CMAKE_TOOLCHAIN_FILE 就整体跳过上述分支。
 * **不要**设置全局 CC/CXX，否则污染 host 构建脚本。
 *
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {string} [repoRoot] 仓库根；用于定位 src-tauri/cmake 下的 toolchain 文件
 */
export function androidNativeBuildEnv(baseEnv = process.env, repoRoot = null) {
  const ndks = discoverNdkHomes(baseEnv);
  const ndk = ndks[0];
  if (!ndk) {
    log('未找到 Android NDK，跳过 Android 原生环境补齐');
    return {};
  }

  const api = process.env.ANDROID_NATIVE_API_LEVEL || '24';
  const patch = {
    ANDROID_NDK_HOME: ndk,
    ANDROID_NDK_ROOT: ndk,
    ANDROID_PLATFORM: process.env.ANDROID_PLATFORM || `android-${api}`,
    ANDROID_NATIVE_API_LEVEL: api,
  };

  if (repoRoot) {
    const cmakeDir = path.join(repoRoot, 'src-tauri', 'cmake');
    const abiByTriple = {
      'aarch64-linux-android': 'arm64-v8a',
      'armv7-linux-androideabi': 'armeabi-v7a',
      'i686-linux-android': 'x86',
      'x86_64-linux-android': 'x86_64',
    };
    for (const [triple, abi] of Object.entries(abiByTriple)) {
      const file = path.join(cmakeDir, `android-${abi}.toolchain.cmake`);
      if (!fs.existsSync(file)) continue;
      // cmake-rs / btls 都优先查带 triple 后缀的变量，因此不会影响 host 构建。
      for (const key of [
        `CMAKE_TOOLCHAIN_FILE_${triple}`,
        `CMAKE_TOOLCHAIN_FILE_${triple.replace(/-/g, '_')}`,
      ]) {
        if (!process.env[key]) patch[key] = file;
      }
    }
  }

  const pathFront = [];

  const host =
    process.platform === 'win32'
      ? 'windows-x86_64'
      : process.platform === 'darwin'
        ? process.arch === 'arm64'
          ? 'darwin-arm64'
          : 'darwin-x86_64'
        : process.arch === 'arm64'
          ? 'linux-aarch64'
          : 'linux-x86_64';

  const llvmBin = path.join(ndk, 'toolchains', 'llvm', 'prebuilt', host, 'bin');
  if (fs.existsSync(llvmBin)) {
    pathFront.push(llvmBin);
    const clangName =
      process.platform === 'win32'
        ? `aarch64-linux-android${api}-clang.cmd`
        : `aarch64-linux-android${api}-clang`;
    const linker = path.join(llvmBin, clangName);
    if (
      fs.existsSync(linker) &&
      !process.env.CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER
    ) {
      patch.CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = linker;
    }
  }

  if (pathFront.length) {
    prependPath(patch, pathFront, baseEnv.PATH);
  }
  return patch;
}
