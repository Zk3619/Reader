# tv-jar-host

桌面端 CatVod JAR 侧车：下载/校验 jar →（可选）捆绑 dex2jar → `URLClassLoader` → 反射 `csp_*` Spider。

## 一次性准备

```powershell
# 建议：确保 JAVA_HOME 指向完整 JDK（含 bin\jar.exe），例如：
#   $env:JAVA_HOME = "D:\Java\jdk-17.0.11"

# 1) 拉取 dex2jar 到 tools/dex2jar
powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/fetch-dex2jar.ps1

# 2) 拉取 org.json / okhttp / gson 等到 tools/tv-jar-host/lib
powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/fetch-host-libs.ps1

# 3) 编译 host（内含 CatVod Spider / Android 桌面 stub）
powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/build.ps1
```

`build.ps1` / `patch-json-getstring.ps1` 会通过 `JAVA_HOME\bin` 解析 `java`/`javac`/`jar`（不依赖 PATH 里是否有 `jar`）。

Android 上 `com.github.catvod.crawler.Spider` 由 App 提供；桌面已打进 `tv-jar-host.jar`。`org.json` / `okhttp` / `gson` 放在 `tools/tv-jar-host/lib`（或发布时 exe 旁 `lib/`）。

Host 启动后会在数据目录旁的 `tv-android-files/config.json` 写入 `{}`（豆瓣等源会读取该文件；缺失会导致 `JSONException`）。

## 构建（仅 host）

```powershell
powershell -ExecutionPolicy Bypass -File tools/tv-jar-host/build.ps1
```

## 运行

```powershell
java -noverify -cp "build/libs/tv-jar-host.jar;lib/*" com.reader.tvjarhost.Main --port 19880
```

Rust 拉起 host 时使用 `-cp host.jar + lib/*.jar`（不能只用 `-jar`，否则 `Spider.safeDns` 找不到 okhttp），并自动加 `-noverify`。

Rust `tv_jar_host` 在调用 `csp_*` 时按需拉起该进程，并注入 `READER_DEX2JAR_HOME`（若找到 `tools/dex2jar` 或 exe 旁 `dex2jar/`）。

JSON-RPC：

- `callSpider` — home/detail/play 等
- `jsonExt` — 解析器 JsonBasic/Parallel/Vip
- `proxy` — `com.github.catvod.spider.Proxy.proxy`

## 发布布局

与 Reader `.exe` 同级：

```
Reader.exe
tv-jar-host.jar
dex2jar/          # fetch-dex2jar.ps1 产出的整目录
  d2j-dex2jar.bat
  lib/
  ...
AppData/
  tv-jar-cache/   # Spider jar / dex2jar 产物（与 audio-cache、book-cache 同级）
  config.json
  ...
```

Rust 启动 host 时注入 `READER_TV_JAR_CACHE`（或 `--cache`），默认落在 `exe/AppData/tv-jar-cache`（尊重 `config.dataDir` / `reader.json`）。旧版 `~/.reader/tv-jar-cache` 会在目标为空时自动迁移。

含 JNI/`.so` 的源在桌面会返回明确错误。纯 `.class` 的 jar 无需 dex2jar。
