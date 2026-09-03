# DexClassLoader 加载的影视 JAR 按名字引用宿主 CatVod 类，release R8 不得裁剪/改名。
-keep class com.github.catvod.Init { *; }
-keep class com.github.catvod.Proxy { *; }
-keep class com.github.catvod.crawler.** { *; }
-keep class * extends com.github.catvod.crawler.Spider { *; }
-keep class com.zkingz.reader.tv.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
