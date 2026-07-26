plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zkingz.reader.video"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

// 默认轻量：不编 Media3 / 不编 mpv AAR；仅 READER_VIDEO_ENHANCED=1 时增强
val videoEnhanced = System.getenv("READER_VIDEO_ENHANCED") == "1"

val mpvlibCandidates = listOf(
    file("../libmpv/mpv-android-lib-2026-07-18.aar"),
    file("libs/mpvlib.aar"),
)
val mpvlibAar =
    if (!videoEnhanced) {
        logger.lifecycle(
            "reader-video-player: mpvlib.aar: skipped (default lite; set READER_VIDEO_ENHANCED=1 for enhanced)",
        )
        null
    } else {
        mpvlibCandidates.firstOrNull { it.exists() }
    }
if (mpvlibAar != null) {
    logger.lifecycle(
        "reader-video-player: mpvlib.aar: present -> ${mpvlibAar.invariantSeparatorsPath} (${mpvlibAar.length()} bytes)",
    )
    android.sourceSets.getByName("main").java.srcDir("src/mpvAvailable/java")
} else if (videoEnhanced) {
    logger.lifecycle(
        "reader-video-player: mpvlib.aar: missing (tried ../libmpv/mpv-android-lib-2026-07-18.aar and libs/mpvlib.aar)",
    )
}

if (videoEnhanced) {
    logger.lifecycle("reader-video-player: Media3: enabled (enhanced)")
    android.sourceSets.getByName("main").java.srcDir("src/media3Available/java")
} else {
    logger.lifecycle("reader-video-player: Media3: skipped (default lite)")
    android.sourceSets.getByName("main").java.srcDir("src/media3Missing/java")
}

val flameAar = file("libs/DanmakuFlameMaster.aar")
if (flameAar.exists()) {
    logger.lifecycle(
        "reader-video-player: DanmakuFlameMaster.aar: present (${flameAar.length()} bytes)",
    )
    android.sourceSets.getByName("main").java.srcDir("src/flameAvailable/java")
} else {
    logger.lifecycle("reader-video-player: DanmakuFlameMaster.aar: missing")
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.appcompat:appcompat:1.6.0")
    if (videoEnhanced) {
        implementation("androidx.media3:media3-exoplayer:1.5.1")
        implementation("androidx.media3:media3-ui:1.5.1")
    }
    if (mpvlibAar != null) {
        implementation(files(mpvlibAar))
    }
    if (flameAar.exists()) {
        implementation(files(flameAar))
    }
    implementation(project(":tauri-android"))
}
