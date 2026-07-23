package com.zkingz.reader.video

import android.content.Context
import android.util.AttributeSet
import android.util.Log
import `is`.xyz.mpv.BaseMPVView
import `is`.xyz.mpv.MPVLib

/**
 * 有 mpvlib.aar 时编译进包的一等公民 VO（对齐小喵 CustomMPVView.initOptions 子集）。
 * 无 AAR 时本文件不参与编译（见 build.gradle.kts sourceSets）。
 */
class ReaderMpvView(context: Context, attrs: AttributeSet?) : BaseMPVView(context, attrs) {
  override fun initOptions() {
    Log.d(TAG, "ReaderMpvView.initOptions")
    MPVLib.setOptionString("profile", "default")
    MPVLib.setOptionString("vo", "gpu")
    MPVLib.setOptionString("gpu-context", "android")
    MPVLib.setOptionString("hwdec", "mediacodec,mediacodec-copy,no")
    MPVLib.setOptionString("hwdec-codecs", "all")
    MPVLib.setOptionString("ao", "audiotrack,opensles")
    MPVLib.setOptionString("target-colorspace-hint", "yes")
    MPVLib.setOptionString("target-prim", "auto")
    MPVLib.setOptionString("target-trc", "auto")
    MPVLib.setOptionString("inverse-tone-mapping", "yes")
    MPVLib.setOptionString("tone-mapping", "mobius")
    MPVLib.setOptionString("hdr-compute-peak", "yes")
    MPVLib.setOptionString("hdr-reference-white", "203")
    MPVLib.setOptionString("volume-max", "300")
    MPVLib.setOptionString("softvol", "yes")
    MPVLib.setOptionString("keep-open", "yes")
    MPVLib.setOptionString("keepaspect", "yes")
    MPVLib.setOptionString("sub-auto", "fuzzy")
    MPVLib.setOptionString("sub-codepage", "auto")
    MPVLib.setOptionString("slang", "zh,chi,zho,chs,cht,zh-CN,zh-TW,en,eng")
  }

  companion object {
    private const val TAG = "ReaderMpvView"
  }
}
