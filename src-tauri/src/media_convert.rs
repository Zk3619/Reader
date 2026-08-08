//! 媒体格式转换（导出用）：图片 `image`，音频 `ffmpeg-next`（桌面端启用时）

use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaConvertCapabilities {
    pub image_backend: String,
    pub audio_backend: String,
    pub video_backend: String,
    pub image_formats: Vec<String>,
    pub audio_formats: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertMediaResult {
    pub bytes: Vec<u8>,
    pub mime: String,
}

fn image_mime(target: &str) -> Option<&'static str> {
    match target {
        "jpeg" | "jpg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn normalize_image_target(target: &str) -> Result<&'static str, String> {
    match target.to_ascii_lowercase().as_str() {
        "jpeg" | "jpg" => Ok("jpeg"),
        "png" => Ok("png"),
        "webp" => Ok("webp"),
        other => Err(format!("不支持的图片目标格式: {other}")),
    }
}

fn convert_image_inner(bytes: &[u8], target: &str) -> Result<(Vec<u8>, String), String> {
    use image::codecs::jpeg::JpegEncoder;
    use image::codecs::png::PngEncoder;
    use image::codecs::webp::WebPEncoder;
    use image::ImageEncoder;

    let target = normalize_image_target(target)?;
    let img = image::load_from_memory(bytes).map_err(|e| format!("图片解码失败: {e}"))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let mut out = Vec::new();
    let mime = image_mime(target)
        .ok_or_else(|| format!("不支持的图片目标格式: {target}"))?
        .to_string();

    match target {
        "jpeg" => {
            let rgb = image::DynamicImage::ImageRgba8(rgba).into_rgb8();
            let mut cursor = Cursor::new(&mut out);
            JpegEncoder::new_with_quality(&mut cursor, 92)
                .write_image(
                    rgb.as_raw(),
                    w,
                    h,
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| format!("JPEG 编码失败: {e}"))?;
        }
        "png" => {
            let mut cursor = Cursor::new(&mut out);
            PngEncoder::new(&mut cursor)
                .write_image(
                    rgba.as_raw(),
                    w,
                    h,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| format!("PNG 编码失败: {e}"))?;
        }
        "webp" => {
            let mut cursor = Cursor::new(&mut out);
            WebPEncoder::new_lossless(&mut cursor)
                .write_image(
                    rgba.as_raw(),
                    w,
                    h,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| format!("WebP 编码失败: {e}"))?;
        }
        _ => return Err(format!("不支持的图片目标格式: {target}")),
    }

    Ok((out, mime))
}

#[cfg(feature = "media-ffmpeg")]
mod audio_ffmpeg {
    use super::ConvertMediaResult;
    use std::path::Path;

    fn audio_mime(target: &str) -> Option<&'static str> {
        match target {
            "mp3" => Some("audio/mpeg"),
            "m4a" => Some("audio/mp4"),
            _ => None,
        }
    }

    fn normalize_audio_target(target: &str) -> Result<&'static str, String> {
        match target.to_ascii_lowercase().as_str() {
            "mp3" => Ok("mp3"),
            "m4a" => Ok("m4a"),
            other => Err(format!("不支持的音频目标格式: {other}")),
        }
    }

    fn init_ffmpeg() -> Result<(), String> {
        ffmpeg_next::init().map_err(|e| format!("ffmpeg 初始化失败: {e:?}"))
    }

    /// 通过 ffmpeg-next 静态链接的 libav 执行转码（临时文件 I/O）
    fn transcode_audio_file(input: &Path, output: &Path, target: &str) -> Result<(), String> {
        init_ffmpeg()?;

        let codec_name = match target {
            "mp3" => "libmp3lame",
            "m4a" => "aac",
            _ => return Err(format!("不支持的音频目标格式: {target}")),
        };

        let input_s = input
            .to_str()
            .ok_or_else(|| "输入路径无效".to_string())?;
        let output_s = output
            .to_str()
            .ok_or_else(|| "输出路径无效".to_string())?;

        // ffmpeg-next 静态链接时，通过同进程调用 ffmpeg CLI（若不可用则回退 libav 管线）
        if let Ok(status) = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                input_s,
                "-vn",
                "-acodec",
                codec_name,
                output_s,
            ])
            .status()
        {
            if status.success() && output.exists() {
                return Ok(());
            }
        }

        transcode_audio_libav(input, output, target)
    }

    fn transcode_audio_libav(input: &Path, output: &Path, target: &str) -> Result<(), String> {
        use ffmpeg_next as ffmpeg;
        use ffmpeg_next::codec;
        use ffmpeg_next::format::{input, output, Pixel};
        use ffmpeg_next::media::Type;
        use ffmpeg_next::software::resampling::Context as Resampler;
        use ffmpeg_next::util::frame::Audio as AudioFrame;
        use ffmpeg_next::Packet;

        let mut ictx = input(input).map_err(|e| format!("打开输入失败: {e}"))?;
        let ist = ictx
            .streams()
            .best(Type::Audio)
            .ok_or_else(|| "未找到音频流".to_string())?;
        let ist_index = ist.index();
        let mut decoder = codec::context::Context::from_parameters(ist.parameters())
            .map_err(|e| format!("{e}"))?
            .decoder()
            .audio()
            .map_err(|e| format!("{e}"))?;

        let codec_id = match target {
            "mp3" => ffmpeg::codec::Id::MP3,
            "m4a" => ffmpeg::codec::Id::AAC,
            _ => return Err(format!("不支持的音频目标格式: {target}")),
        };
        let encoder_codec = ffmpeg::encoder::find(codec_id)
            .ok_or_else(|| format!("未找到编码器: {target}"))?;

        let mut octx = output(output).map_err(|e| format!("打开输出失败: {e}"))?;
        let mut ost = octx.add_stream(encoder_codec).map_err(|e| format!("{e}"))?;
        let mut encoder = codec::Context::new_with_codec(encoder_codec)
            .encoder()
            .audio()
            .map_err(|e| format!("{e}"))?;
        encoder.set_rate(decoder.rate() as i32);
        encoder.set_channel_layout(decoder.channel_layout());
        encoder.set_format(decoder.format());
        encoder.set_bit_rate(128_000);
        let encoder = encoder.open_as(encoder_codec).map_err(|e| format!("{e}"))?;
        ost.set_parameters(&encoder);
        octx.write_header().map_err(|e| format!("{e}"))?;

        let mut resampler = Resampler::get(
            decoder.format(),
            decoder.channel_layout(),
            decoder.rate() as u32,
            encoder.format(),
            encoder.channel_layout(),
            encoder.rate() as u32,
        )
        .map_err(|e| format!("{e}"))?;

        let mut frame = AudioFrame::empty();
        let mut resampled = AudioFrame::empty();
        let mut packet = Packet::empty();

        for (stream, pkt) in ictx.packets() {
            if stream.index() != ist_index {
                continue;
            }
            decoder.send_packet(&pkt).map_err(|e| format!("{e}"))?;
            while decoder.receive_frame(&mut frame).is_ok() {
                resampler
                    .run(&frame, &mut resampled)
                    .map_err(|e| format!("{e}"))?;
                resampled.set_pts(frame.pts());
                encoder.send_frame(&resampled).map_err(|e| format!("{e}"))?;
                while encoder.receive_packet(&mut packet).is_ok() {
                    packet.set_stream(0);
                    packet
                        .write_interleaved(&mut octx)
                        .map_err(|e| format!("{e}"))?;
                }
            }
        }

        decoder.send_eof().map_err(|e| format!("{e}"))?;
        while decoder.receive_frame(&mut frame).is_ok() {
            resampler
                .run(&frame, &mut resampled)
                .map_err(|e| format!("{e}"))?;
            encoder.send_frame(&resampled).map_err(|e| format!("{e}"))?;
            while encoder.receive_packet(&mut packet).is_ok() {
                packet.set_stream(0);
                packet
                    .write_interleaved(&mut octx)
                    .map_err(|e| format!("{e}"))?;
            }
        }

        encoder.send_eof().map_err(|e| format!("{e}"))?;
        while encoder.receive_packet(&mut packet).is_ok() {
            packet.set_stream(0);
            packet
                .write_interleaved(&mut octx)
                .map_err(|e| format!("{e}"))?;
        }

        octx.write_trailer().map_err(|e| format!("{e}"))?;
        let _ = Pixel::None;
        Ok(())
    }

    pub fn convert_audio(bytes: &[u8], target: &str) -> Result<ConvertMediaResult, String> {
        let target = normalize_audio_target(target)?;
        let mime = audio_mime(target)
            .ok_or_else(|| format!("不支持的音频目标格式: {target}"))?
            .to_string();

        let input = tempfile::Builder::new()
            .suffix(".in")
            .tempfile()
            .map_err(|e| e.to_string())?;
        std::fs::write(input.path(), bytes).map_err(|e| e.to_string())?;

        let output = tempfile::Builder::new()
            .suffix(match target {
                "mp3" => ".mp3",
                "m4a" => ".m4a",
                _ => ".out",
            })
            .tempfile()
            .map_err(|e| e.to_string())?;
        let out_path = output.path().to_path_buf();

        transcode_audio_file(input.path(), &out_path, target)?;
        let out_bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
        if out_bytes.is_empty() {
            return Err("音频转码结果为空".to_string());
        }
        Ok(ConvertMediaResult {
            bytes: out_bytes,
            mime,
        })
    }

    pub fn probe_audio() -> bool {
        init_ffmpeg().is_ok()
    }
}

#[cfg(not(feature = "media-ffmpeg"))]
mod audio_ffmpeg {
    use super::ConvertMediaResult;

    pub fn convert_audio(_bytes: &[u8], _target: &str) -> Result<ConvertMediaResult, String> {
        Err("当前平台未启用 ffmpeg 音频转码".to_string())
    }

    pub fn probe_audio() -> bool {
        false
    }
}

#[tauri::command]
pub fn media_convert_probe() -> MediaConvertCapabilities {
    let image_formats = vec!["jpeg".into(), "png".into(), "webp".into()];
    let audio_available = audio_ffmpeg::probe_audio();
    let audio_formats = if audio_available {
        vec!["mp3".into(), "m4a".into()]
    } else {
        vec![]
    };
    MediaConvertCapabilities {
        image_backend: "rust".into(),
        audio_backend: if audio_available {
            "rust".into()
        } else {
            "none".into()
        },
        video_backend: {
            let cli = std::process::Command::new("ffmpeg")
                .arg("-version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            #[cfg(feature = "media-ffmpeg")]
            {
                if cli {
                    "ffmpeg-cli+libav".into()
                } else {
                    "ffmpeg-next".into()
                }
            }
            #[cfg(not(feature = "media-ffmpeg"))]
            {
                if cli {
                    "ffmpeg-cli".into()
                } else {
                    "none".into()
                }
            }
        },
        image_formats,
        audio_formats,
    }
}

#[tauri::command]
pub fn convert_image_bytes(bytes: Vec<u8>, target: String) -> Result<ConvertMediaResult, String> {
    if bytes.is_empty() {
        return Err("输入为空".to_string());
    }
    let (out, mime) = convert_image_inner(&bytes, &target)?;
    Ok(ConvertMediaResult { bytes: out, mime })
}

#[tauri::command]
pub fn convert_audio_bytes(bytes: Vec<u8>, target: String) -> Result<ConvertMediaResult, String> {
    if bytes.is_empty() {
        return Err("输入为空".to_string());
    }
    audio_ffmpeg::convert_audio(&bytes, &target)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFilesResult {
    pub output_path: String,
}

/// 使用系统 ffmpeg 将本地音视频流合并（-c copy）。
/// 若启用 `media-ffmpeg` feature，优先走进程内 libav（ffmpeg-next）；失败再回退 CLI。
#[tauri::command]
pub async fn media_convert_merge_files(
    inputs: Vec<String>,
    output_path: String,
    container: Option<String>,
) -> Result<MergeFilesResult, String> {
    if inputs.len() < 2 {
        return Err("合并至少需要两个本地输入文件".into());
    }
    for p in &inputs {
        if !std::path::Path::new(p).is_file() {
            return Err(format!("输入文件不存在: {p}"));
        }
    }
    let out = output_path.trim().to_string();
    if out.is_empty() {
        return Err("输出路径为空".into());
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    let _ = container;

    #[cfg(feature = "media-ffmpeg")]
    {
        let inputs2 = inputs.clone();
        let out2 = out.clone();
        match tauri::async_runtime::spawn_blocking(move || merge_with_ffmpeg_next(&inputs2, &out2))
            .await
            .map_err(|e| format!("合并任务失败: {e}"))?
        {
            Ok(r) => {
                log::info!("media_convert_merge_files: libav ok");
                return Ok(r);
            }
            Err(e) => {
                log::warn!("media_convert_merge_files: libav failed, cli-fallback: {e}");
            }
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut args: Vec<String> = Vec::new();
        for p in &inputs {
            args.push("-i".into());
            args.push(p.clone());
        }
        for i in 0..inputs.len() {
            args.push("-map".into());
            args.push(format!("{i}"));
        }
        args.extend(["-c".into(), "copy".into(), "-y".into(), out.clone()]);
        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .status()
            .map_err(|e| format!("无法启动 ffmpeg（请安装并加入 PATH，或启用 media-ffmpeg）: {e}"))?;
        if !status.success() {
            return Err(format!("ffmpeg 合并失败，exit={status}"));
        }
        if !std::path::Path::new(&out).is_file() {
            return Err("ffmpeg 未生成输出文件".into());
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("合并任务失败: {e}"))?
}

/// 进程内 libav stream-copy（多输入合并 / 单文件 remux / 写 metadata）。
/// 对齐外置 `ffmpeg -i … -map … -c copy`；失败由调用方回退 CLI。
#[cfg(feature = "media-ffmpeg")]
fn stream_copy_with_ffmpeg_next(
    inputs: &[String],
    out: &str,
    metadata: Option<&std::collections::HashMap<String, String>>,
) -> Result<MergeFilesResult, String> {
    use ffmpeg_next as ffmpeg;
    use ffmpeg_next::{codec, encoder, format, media, Rational};

    ffmpeg::init().map_err(|e| format!("ffmpeg-next init: {e:?}"))?;

    let mut inputs_ctx: Vec<format::context::Input> = Vec::with_capacity(inputs.len());
    for p in inputs {
        let ictx = format::input(std::path::Path::new(p))
            .map_err(|e| format!("打开输入失败 {p}: {e:?}"))?;
        inputs_ctx.push(ictx);
    }

    let mut octx = format::output(std::path::Path::new(out))
        .map_err(|e| format!("打开输出失败 {out}: {e:?}"))?;

    // 先继承首路输入 metadata，再覆盖调用方写入的字段
    if let Some(first) = inputs_ctx.first() {
        octx.set_metadata(first.metadata().to_owned());
    }
    if let Some(meta) = metadata {
        let mut dict = octx.metadata().to_owned();
        for (k, v) in meta {
            if v.trim().is_empty() {
                continue;
            }
            dict.set(k, v);
        }
        octx.set_metadata(dict);
    }

    #[derive(Clone, Copy)]
    struct StreamMap {
        input_idx: usize,
        ist_index: usize,
        ost_index: i32,
        ist_time_base: Rational,
    }

    let mut maps: Vec<StreamMap> = Vec::new();
    let mut next_ost: i32 = 0;

    for (input_idx, ictx) in inputs_ctx.iter().enumerate() {
        for (ist_index, ist) in ictx.streams().enumerate() {
            let medium = ist.parameters().medium();
            if medium != media::Type::Audio
                && medium != media::Type::Video
                && medium != media::Type::Subtitle
            {
                continue;
            }
            let mut ost = octx
                .add_stream(encoder::find(codec::Id::None))
                .map_err(|e| format!("add_stream: {e:?}"))?;
            ost.set_parameters(ist.parameters());
            // 避免容器切换时 codec_tag 不兼容
            unsafe {
                (*ost.parameters().as_mut_ptr()).codec_tag = 0;
            }
            maps.push(StreamMap {
                input_idx,
                ist_index,
                ost_index: next_ost,
                ist_time_base: ist.time_base(),
            });
            next_ost += 1;
        }
    }

    if maps.is_empty() {
        return Err("输入中没有可复制的音视频流".into());
    }

    octx.write_header()
        .map_err(|e| format!("write_header: {e:?}"))?;

    // 按输入顺序 stream-copy（对齐 ffmpeg -i a -i b -map 0 -map 1 -c copy）
    for (input_idx, ictx) in inputs_ctx.iter_mut().enumerate() {
        let n = ictx.nb_streams() as usize;
        let mut stream_mapping = vec![-1i32; n];
        let mut ist_time_bases = vec![Rational(0, 1); n];
        for m in maps.iter().filter(|m| m.input_idx == input_idx) {
            if m.ist_index < n {
                stream_mapping[m.ist_index] = m.ost_index;
                ist_time_bases[m.ist_index] = m.ist_time_base;
            }
        }

        for (stream, mut packet) in ictx.packets() {
            let ist_index = stream.index();
            if ist_index >= stream_mapping.len() {
                continue;
            }
            let ost_index = stream_mapping[ist_index];
            if ost_index < 0 {
                continue;
            }
            let ost_tb = octx
                .stream(ost_index as _)
                .map(|s| s.time_base())
                .ok_or_else(|| format!("missing output stream {ost_index}"))?;
            packet.rescale_ts(ist_time_bases[ist_index], ost_tb);
            packet.set_position(-1);
            packet.set_stream(ost_index as _);
            packet
                .write_interleaved(&mut octx)
                .map_err(|e| format!("write_interleaved: {e:?}"))?;
        }
    }

    octx.write_trailer()
        .map_err(|e| format!("write_trailer: {e:?}"))?;

    if !std::path::Path::new(out).is_file() {
        return Err("libav remux 未生成输出文件".into());
    }
    Ok(MergeFilesResult {
        output_path: out.to_string(),
    })
}

#[cfg(feature = "media-ffmpeg")]
fn merge_with_ffmpeg_next(inputs: &[String], out: &str) -> Result<MergeFilesResult, String> {
    stream_copy_with_ffmpeg_next(inputs, out, None)
}

/// 外部 ffmpeg CLI 兜底：单文件 `-c copy`（可选 metadata / genpts）。
fn remux_copy_with_ffmpeg_cli(
    input: &str,
    out: &str,
    metadata: Option<&std::collections::HashMap<String, String>>,
    reset_timestamps: bool,
) -> Result<MergeFilesResult, String> {
    let mut args: Vec<String> = vec!["-y".into(), "-hide_banner".into()];
    if reset_timestamps {
        args.extend([
            "-fflags".into(),
            "+genpts".into(),
            "-avoid_negative_ts".into(),
            "make_zero".into(),
        ]);
    }
    args.extend(["-i".into(), input.to_string(), "-c".into(), "copy".into()]);
    if let Some(meta) = metadata {
        for (k, v) in meta {
            if v.trim().is_empty() {
                continue;
            }
            args.push("-metadata".into());
            args.push(format!("{k}={v}"));
        }
    }
    args.push(out.to_string());
    let status = std::process::Command::new("ffmpeg")
        .args(&args)
        .status()
        .map_err(|e| format!("无法启动外部 ffmpeg（兜底）: {e}"))?;
    if !status.success() {
        return Err(format!("外部 ffmpeg remux 失败，exit={status}"));
    }
    if !std::path::Path::new(out).is_file() {
        return Err("外部 ffmpeg 未生成输出文件".into());
    }
    Ok(MergeFilesResult {
        output_path: out.to_string(),
    })
}

/// 使用系统 ffmpeg 拉取 HLS/m3u8 到本地文件。
/// `live_seconds`: 直播录制时长上限（秒）；`validate_segments`: 启用 -err_detect explode。
#[tauri::command]
pub async fn media_convert_fetch_hls(
    url: String,
    output_path: String,
    headers: Option<std::collections::HashMap<String, String>>,
    live_seconds: Option<u64>,
    validate_segments: Option<bool>,
) -> Result<MergeFilesResult, String> {
    let url = url.trim().to_string();
    let out = output_path.trim().to_string();
    if url.is_empty() || out.is_empty() {
        return Err("url/output_path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut args: Vec<String> = vec!["-y".into()];
        if validate_segments.unwrap_or(true) {
            args.extend(["-err_detect".into(), "explode".into()]);
        }
        if let Some(secs) = live_seconds {
            if secs > 0 {
                // Live / sliding-window playlists: bound capture duration
                args.extend(["-t".into(), secs.to_string()]);
            }
        }
        args.extend(["-i".into(), url.clone(), "-c".into(), "copy".into()]);
        if let Some(hdrs) = headers {
            let mut lines = String::new();
            for (k, v) in hdrs {
                lines.push_str(&format!("{k}: {v}\r\n"));
            }
            if !lines.is_empty() {
                // headers must precede -i
                let insert_at = args.iter().position(|a| a == "-i").unwrap_or(0);
                args.splice(insert_at..insert_at, ["-headers".into(), lines]);
            }
        }
        args.push(out.clone());
        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
        if !status.success() {
            return Err(format!("ffmpeg HLS 拉取失败，exit={status}"));
        }
        // 分片校验：输出必须存在且非空
        let meta = std::fs::metadata(&out).map_err(|e| format!("HLS 输出不可读: {e}"))?;
        if meta.len() == 0 {
            return Err("HLS 输出为空（可能直播窗口无分片或分片校验失败）".into());
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("HLS 任务失败: {e}"))?
}

/// 使用系统 ffmpeg 拉取 DASH/MPD（含 multi-period 尽力复制）。
#[tauri::command]
pub async fn media_convert_fetch_dash(
    url: String,
    output_path: String,
    headers: Option<std::collections::HashMap<String, String>>,
    validate_segments: Option<bool>,
) -> Result<MergeFilesResult, String> {
    let url = url.trim().to_string();
    let out = output_path.trim().to_string();
    if url.is_empty() || out.is_empty() {
        return Err("url/output_path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut args: Vec<String> = vec!["-y".into()];
        if validate_segments.unwrap_or(true) {
            args.extend(["-err_detect".into(), "explode".into()]);
        }
        // Prefer all periods when ffmpeg understands the MPD
        args.extend([
            "-i".into(),
            url.clone(),
            "-c".into(),
            "copy".into(),
            "-map".into(),
            "0".into(),
        ]);
        if let Some(hdrs) = headers {
            let mut lines = String::new();
            for (k, v) in hdrs {
                lines.push_str(&format!("{k}: {v}\r\n"));
            }
            if !lines.is_empty() {
                let insert_at = args.iter().position(|a| a == "-i").unwrap_or(0);
                args.splice(insert_at..insert_at, ["-headers".into(), lines]);
            }
        }
        args.push(out.clone());
        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
        if !status.success() {
            return Err(format!("ffmpeg DASH 拉取失败，exit={status}"));
        }
        let meta = std::fs::metadata(&out).map_err(|e| format!("DASH 输出不可读: {e}"))?;
        if meta.len() == 0 {
            return Err("DASH 输出为空（multi-period/分片可能失败）".into());
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("DASH 任务失败: {e}"))?
}

/// 使用系统 ffmpeg 拉取任意可读 URL（含 rtmp://），`-c copy` 落盘。
#[tauri::command]
pub async fn media_convert_fetch_url(
    url: String,
    output_path: String,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<MergeFilesResult, String> {
    let url = url.trim().to_string();
    let out = output_path.trim().to_string();
    if url.is_empty() || out.is_empty() {
        return Err("url/output_path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut args: Vec<String> = vec!["-y".into(), "-i".into(), url.clone(), "-c".into(), "copy".into()];
        if let Some(hdrs) = headers {
            let mut lines = String::new();
            for (k, v) in hdrs {
                lines.push_str(&format!("{k}: {v}\r\n"));
            }
            if !lines.is_empty() {
                let insert_at = args.iter().position(|a| a == "-i").unwrap_or(0);
                args.splice(insert_at..insert_at, ["-headers".into(), lines]);
            }
        }
        args.push(out.clone());
        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
        if !status.success() {
            return Err(format!("ffmpeg URL 拉取失败，exit={status}"));
        }
        let meta = std::fs::metadata(&out).map_err(|e| format!("输出不可读: {e}"))?;
        if meta.len() == 0 {
            return Err("输出为空".into());
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("URL 拉取任务失败: {e}"))?
}

/// 分片级下载并顺序拼接（ISM/DASH/HLS-BYTERANGE fragments）——纯 HTTP 门面，不依赖 ffmpeg。
/// `continuedl` 默认 true：已存在且非空的 `{out}.ytdl/frag-NNNNN.part` 会跳过重下。
/// `byte_ranges`：与 `urls` 对齐的可选半开区间 [start, end)，对齐 yt-dlp FragmentFD Range。
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FragmentByteRangeArg {
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FragmentProgressPayload {
    pub output_path: String,
    pub done: u64,
    pub total: u64,
    pub downloaded_bytes: u64,
}

pub const FRAGMENT_PROGRESS_EVENT: &str = "media-convert-fragment-progress";

#[tauri::command]
pub async fn media_convert_fetch_fragments(
    app: tauri::AppHandle,
    urls: Vec<String>,
    output_path: String,
    headers: Option<std::collections::HashMap<String, String>>,
    concurrency: Option<usize>,
    continuedl: Option<bool>,
    byte_ranges: Option<Vec<Option<FragmentByteRangeArg>>>,
) -> Result<MergeFilesResult, String> {
    use tauri::Emitter;

    let out = output_path.trim().to_string();
    if urls.is_empty() || out.is_empty() {
        return Err("urls/output_path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    let conc = concurrency.unwrap_or(4).clamp(1, 8);
    let continue_dl = continuedl.unwrap_or(true);
    let hdrs = headers.unwrap_or_default();
    let ranges = byte_ranges.unwrap_or_default();
    let part_dir = format!("{out}.ytdl");
    std::fs::create_dir_all(&part_dir).map_err(|e| format!("创建分片目录失败: {e}"))?;

    let client = crate::http_client::build_client(&crate::http_client::ClientOpts {
        timeout: std::time::Duration::from_secs(60),
        user_agent: Some(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                .into(),
        ),
        ..crate::http_client::ClientOpts::default()
    })?;

    let n = urls.len();
    let part_path = |i: usize| format!("{part_dir}/frag-{i:05}.part");

    let mut pending: Vec<(usize, String, Option<FragmentByteRangeArg>)> = Vec::new();
    let mut done_count: u64 = 0;
    let mut downloaded_bytes: u64 = 0;
    for (i, url) in urls.into_iter().enumerate() {
        let path = part_path(i);
        if continue_dl {
            if let Ok(meta) = std::fs::metadata(&path) {
                if meta.is_file() && meta.len() > 0 {
                    done_count += 1;
                    downloaded_bytes += meta.len();
                    continue;
                }
            }
        }
        let range = ranges.get(i).and_then(|r| r.clone());
        pending.push((i, url, range));
    }

    let emit_progress = |done: u64, bytes: u64| {
        let _ = app.emit(
            FRAGMENT_PROGRESS_EVENT,
            FragmentProgressPayload {
                output_path: out.clone(),
                done,
                total: n as u64,
                downloaded_bytes: bytes,
            },
        );
    };
    emit_progress(done_count, downloaded_bytes);

    let mut next = 0usize;
    while next < pending.len() {
        let end = (next + conc).min(pending.len());
        let batch: Vec<(usize, String, Option<FragmentByteRangeArg>)> = pending[next..end].to_vec();
        next = end;
        let mut handles = Vec::new();
        for (idx, url, range) in batch {
            let client = client.clone();
            let hdrs = hdrs.clone();
            let path = part_path(idx);
            handles.push(tauri::async_runtime::spawn(async move {
                let mut req = client.get(&url);
                for (k, v) in &hdrs {
                    // 分片 Range 由 byte_ranges 注入，避免被通用 headers 覆盖
                    if k.eq_ignore_ascii_case("range") && range.is_some() {
                        continue;
                    }
                    req = req.header(k.as_str(), v.as_str());
                }
                if let Some(br) = &range {
                    if br.end > br.start {
                        req = req.header(
                            "Range",
                            format!("bytes={}-{}", br.start, br.end.saturating_sub(1)),
                        );
                    }
                }
                let resp = req.send().await.map_err(|e| format!("分片请求失败 [{idx}]: {e}"))?;
                if !resp.status().is_success() {
                    return Err(format!("分片 HTTP {} [{}]", resp.status(), idx));
                }
                let body = resp
                    .bytes()
                    .await
                    .map_err(|e| format!("分片读取失败 [{idx}]: {e}"))?
                    .to_vec();
                if body.is_empty() {
                    return Err(format!("分片 {idx} 为空"));
                }
                let len = body.len() as u64;
                std::fs::write(&path, &body).map_err(|e| format!("写入分片失败 [{idx}]: {e}"))?;
                Ok((idx, len))
            }));
        }
        for h in handles {
            let (_idx, len) = h.await.map_err(|e| format!("分片任务失败: {e}"))??;
            done_count += 1;
            downloaded_bytes += len;
            emit_progress(done_count, downloaded_bytes);
        }
    }

    use std::io::{Read, Write};
    let mut file = std::fs::File::create(&out).map_err(|e| format!("创建输出失败: {e}"))?;
    let mut total: u64 = 0;
    let mut buf = Vec::new();
    for i in 0..n {
        let path = part_path(i);
        let mut part = std::fs::File::open(&path)
            .map_err(|e| format!("打开分片 {i} 失败: {e}"))?;
        buf.clear();
        part.read_to_end(&mut buf)
            .map_err(|e| format!("读取分片 {i} 失败: {e}"))?;
        if buf.is_empty() {
            return Err(format!("分片 {i} 缺失或为空"));
        }
        total += buf.len() as u64;
        file.write_all(&buf).map_err(|e| format!("写入分片失败: {e}"))?;
    }
    if total == 0 {
        return Err("分片拼接结果为空".into());
    }
    let _ = std::fs::remove_dir_all(&part_dir);
    emit_progress(n as u64, total);
    Ok(MergeFilesResult { output_path: out })
}

/// WebSocket 分片协议（对齐上游 WebSocketFragmentFD）：WS 二进制帧 → ffmpeg stdin `-c copy`。
#[tauri::command]
pub async fn media_convert_fetch_websocket_frag(
    url: String,
    output_path: String,
    headers: Option<std::collections::HashMap<String, String>>,
) -> Result<MergeFilesResult, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::Message;

    let url = url.trim().to_string();
    let out = output_path.trim().to_string();
    if url.is_empty() || out.is_empty() {
        return Err("url/output_path 不能为空".into());
    }
    if !url.starts_with("ws://") && !url.starts_with("wss://") {
        return Err(format!("websocket_frag 需要 ws(s):// URL，收到: {url}"));
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }

    let mut request = url
        .into_client_request()
        .map_err(|e| format!("构建 WebSocket 请求失败: {e}"))?;
    if let Some(hdrs) = headers {
        let headers_mut = request.headers_mut();
        for (k, v) in hdrs {
            let name = http::header::HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("非法 header 名 {k}: {e}"))?;
            let value = http::header::HeaderValue::from_str(&v)
                .map_err(|e| format!("非法 header 值 {k}: {e}"))?;
            headers_mut.insert(name, value);
        }
    }

    let (ws, _) = tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {e}"))?;
    let (_, mut read) = ws.split();

    let mut child = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-i", "pipe:0", "-c", "copy", &out])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "ffmpeg stdin 不可用".to_string())?;

    let mut wrote = 0u64;
    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                // 对端关闭或网络错误：结束泵入
                let _ = e;
                break;
            }
        };
        match msg {
            Message::Binary(bin) => {
                if stdin.write_all(&bin).await.is_err() {
                    break;
                }
                wrote += bin.len() as u64;
            }
            Message::Text(text) => {
                let bytes = text.as_bytes();
                if stdin.write_all(bytes).await.is_err() {
                    break;
                }
                wrote += bytes.len() as u64;
            }
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => {}
        }
    }
    drop(stdin);

    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待 ffmpeg 失败: {e}"))?;
    if !status.success() && wrote == 0 {
        return Err(format!("websocket_frag 无数据且 ffmpeg 失败，exit={status}"));
    }
    let meta = std::fs::metadata(&out).map_err(|e| format!("输出不可读: {e}"))?;
    if meta.len() == 0 {
        return Err("websocket_frag 输出为空".into());
    }
    Ok(MergeFilesResult { output_path: out })
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CutTimeRange {
    pub start: f64,
    pub end: f64,
}

fn quote_ffconcat_path(path: &str) -> String {
    // ffconcat file directive: single quotes, escape ' as '\''
    let escaped = path.replace('\'', "'\\''");
    format!("'{escaped}'")
}

fn remove_ranges_to_keep(remove: &[CutTimeRange], duration: f64) -> Vec<CutTimeRange> {
    let mut cuts: Vec<(f64, f64)> = remove
        .iter()
        .filter(|r| r.end > r.start)
        .map(|r| (r.start.max(0.0), r.end.min(duration)))
        .filter(|(a, b)| b > a)
        .collect();
    cuts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut merged: Vec<(f64, f64)> = Vec::new();
    for (s, e) in cuts {
        if let Some(last) = merged.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        merged.push((s, e));
    }
    let mut keep = Vec::new();
    let mut cursor = 0.0;
    for (s, e) in merged {
        if s > cursor {
            keep.push(CutTimeRange {
                start: cursor,
                end: s,
            });
        }
        cursor = e.max(cursor);
    }
    if duration > cursor {
        keep.push(CutTimeRange {
            start: cursor,
            end: duration,
        });
    }
    keep
}

/// 按 keep / remove 时间段物理裁剪（ffmpeg concat demuxer + `-c copy`，无 force_keyframes）。
#[tauri::command]
pub async fn media_convert_cut_by_ranges(
    input_path: String,
    output_path: String,
    keep_ranges: Option<Vec<CutTimeRange>>,
    remove_ranges: Option<Vec<CutTimeRange>>,
    duration: Option<f64>,
) -> Result<MergeFilesResult, String> {
    let input = input_path.trim().to_string();
    let out = output_path.trim().to_string();
    if input.is_empty() || out.is_empty() {
        return Err("input_path/output_path 不能为空".into());
    }
    if !std::path::Path::new(&input).is_file() {
        return Err(format!("输入文件不存在: {input}"));
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }

    let keeps = if let Some(k) = keep_ranges.filter(|v| !v.is_empty()) {
        k
    } else if let Some(remove) = remove_ranges.filter(|v| !v.is_empty()) {
        let dur = duration.ok_or_else(|| {
            "remove_ranges 需要 duration（秒）以计算保留区间".to_string()
        })?;
        if dur <= 0.0 {
            return Err("duration 必须 > 0".into());
        }
        remove_ranges_to_keep(&remove, dur)
    } else {
        return Err("需要 keep_ranges 或 remove_ranges".into());
    };

    let keeps: Vec<CutTimeRange> = keeps
        .into_iter()
        .filter(|r| r.end > r.start + 0.01)
        .collect();
    if keeps.is_empty() {
        return Err("裁剪后无保留区间".into());
    }

    let concat_path = format!("{out}.ffconcat");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&concat_path)
            .map_err(|e| format!("创建 ffconcat 失败: {e}"))?;
        writeln!(f, "ffconcat version 1.0").map_err(|e| e.to_string())?;
        let quoted = quote_ffconcat_path(&input);
        for r in &keeps {
            writeln!(f, "file {quoted}").map_err(|e| e.to_string())?;
            writeln!(f, "inpoint {:.6}", r.start).map_err(|e| e.to_string())?;
            writeln!(f, "outpoint {:.6}", r.end).map_err(|e| e.to_string())?;
        }
    }

    let concat_for_cmd = concat_path.clone();
    let out_for_cmd = out.clone();
    let status = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                &concat_for_cmd,
                "-c",
                "copy",
                &out_for_cmd,
            ])
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))
    })
    .await
    .map_err(|e| format!("裁剪任务失败: {e}"))??;

    let _ = std::fs::remove_file(&concat_path);
    if !status.success() {
        return Err(format!("ffmpeg 裁剪失败，exit={status}"));
    }
    let meta = std::fs::metadata(&out).map_err(|e| format!("输出不可读: {e}"))?;
    if meta.len() == 0 {
        return Err("裁剪输出为空".into());
    }
    Ok(MergeFilesResult { output_path: out })
}

/// 将内存字节写入本地文件（HLS AES 解密后落盘等）。
#[tauri::command]
pub async fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    std::fs::write(&path, &data).map_err(|e| format!("写入失败: {e}"))
}

/// 追加文本到文件（download_archive 等）。
#[tauri::command]
pub async fn append_text_file(path: String, text: String) -> Result<(), String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("path 不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    use std::io::Write;
    tauri::async_runtime::spawn_blocking(move || {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("打开归档文件失败: {e}"))?;
        file.write_all(text.as_bytes())
            .map_err(|e| format!("写入归档失败: {e}"))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("append_text_file 任务失败: {e}"))?
}

/// 写入文件 xattr（Unix）；其他平台返回 available=false。
#[tauri::command]
pub async fn write_file_xattrs(
    path: String,
    entries: std::collections::HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("path 不能为空".into());
    }
    if !std::path::Path::new(&path).is_file() {
        return Err(format!("文件不存在: {path}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(unix)]
        {
            let mut warnings: Vec<String> = Vec::new();
            for (name, value) in entries {
                match xattr::set(&path, &name, value.as_bytes()) {
                    Ok(()) => {}
                    Err(e) => warnings.push(format!("{name}: {e}")),
                }
            }
            Ok(serde_json::json!({
                "available": true,
                "warnings": warnings,
            }))
        }
        #[cfg(not(unix))]
        {
            let _ = entries;
            Ok(serde_json::json!({
                "available": false,
                "warnings": ["xattr not supported on this platform"],
            }))
        }
    })
    .await
    .map_err(|e| format!("write_file_xattrs 任务失败: {e}"))?
}

/// Exec 后处理器：桌面侧执行 shell 命令（仅显式启用 exec PP 时调用）。
#[tauri::command]
pub async fn run_shell_pp(
    command: String,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let command = command.trim().to_string();
    if command.is_empty() {
        return Err("command 不能为空".into());
    }
    let timeout = timeout_ms.unwrap_or(120_000);
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let mut cmd = std::process::Command::new("cmd");
        #[cfg(windows)]
        cmd.args(["/C", &command]);
        #[cfg(not(windows))]
        let mut cmd = std::process::Command::new("sh");
        #[cfg(not(windows))]
        cmd.args(["-c", &command]);
        cmd.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("启动命令失败: {e}"))?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Ok(serde_json::json!({
                        "code": status.code().unwrap_or(1),
                        "stderr": "",
                    }));
                }
                Ok(None) => {
                    if std::time::Instant::now() >= deadline {
                        let _ = child.kill();
                        return Err("exec 命令超时".into());
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(e) => return Err(format!("等待命令失败: {e}")),
            }
        }
    })
    .await
    .map_err(|e| format!("run_shell_pp 任务失败: {e}"))?
}

/// 可选 curl-impersonate JA3：PATH 上有 curl-impersonate-chrome / curl_chrome* 时走子进程；否则 available=false。
#[tauri::command]
pub async fn http_fetch_impersonate(
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
    profile: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<serde_json::Value, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("url 不能为空".into());
    }
    let bin = find_curl_impersonate(profile.as_deref().unwrap_or("chrome"));
    if bin.is_none() {
        return Ok(serde_json::json!({
            "available": false,
            "status": 0,
            "body": "",
            "headers": {},
        }));
    }
    let bin = bin.unwrap();
    let method = method.unwrap_or_else(|| "GET".into()).to_uppercase();
    let timeout = timeout_ms.unwrap_or(60_000);
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&bin);
        cmd.arg("-sS")
            .arg("-L")
            .arg("--max-time")
            .arg(format!("{}", (timeout / 1000).max(1)))
            .arg("-X")
            .arg(&method)
            .arg("-w")
            .arg("\n__YTDLP_HTTP_STATUS__:%{http_code}")
            .arg(&url);
        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                cmd.arg("-H").arg(format!("{k}: {v}"));
            }
        }
        if let Some(b) = body {
            if !b.is_empty() {
                cmd.arg("--data-binary").arg(b);
            }
        }
        let out = cmd.output().map_err(|e| format!("启动 {bin} 失败: {e}"))?;
        if !out.status.success() && out.stdout.is_empty() {
            return Err(format!(
                "curl-impersonate 失败: {}",
                String::from_utf8_lossy(&out.stderr)
            ));
        }
        let raw = String::from_utf8_lossy(&out.stdout);
        let (body_text, status) = if let Some(idx) = raw.rfind("__YTDLP_HTTP_STATUS__:") {
            let status_str = raw[idx + "__YTDLP_HTTP_STATUS__:".len()..].trim();
            let st: u16 = status_str.parse().unwrap_or(0);
            (raw[..idx].to_string(), st)
        } else {
            (raw.to_string(), if out.status.success() { 200 } else { 0 })
        };
        Ok(serde_json::json!({
            "available": true,
            "status": status,
            "body": body_text,
            "headers": {},
        }))
    })
    .await
    .map_err(|e| format!("impersonate 任务失败: {e}"))?
}

fn find_curl_impersonate(profile: &str) -> Option<String> {
    let candidates: &[&str] = match profile {
        "safari" => &["curl-impersonate-safari", "curl_safari"],
        "edge" => &["curl-impersonate-chrome", "curl_chrome131", "curl_chrome"],
        _ => &[
            "curl-impersonate-chrome",
            "curl_chrome131",
            "curl_chrome120",
            "curl_chrome",
        ],
    };
    for name in candidates {
        if which_cmd(name) {
            return Some((*name).to_string());
        }
    }
    None
}

fn which_cmd(name: &str) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("where")
            .arg(name)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("sh")
            .arg("-c")
            .arg(format!("command -v {name}"))
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// 将字幕轨嵌入容器（系统 ffmpeg）。
#[tauri::command]
pub async fn media_convert_embed_subs(
    input_path: String,
    subtitle_path: String,
    output_path: String,
) -> Result<MergeFilesResult, String> {
    let input = input_path.trim().to_string();
    let sub = subtitle_path.trim().to_string();
    let out = output_path.trim().to_string();
    if input.is_empty() || sub.is_empty() || out.is_empty() {
        return Err("input/subtitle/output 不能为空".into());
    }
    if !std::path::Path::new(&input).is_file() {
        return Err(format!("输入不存在: {input}"));
    }
    if !std::path::Path::new(&sub).is_file() {
        return Err(format!("字幕不存在: {sub}"));
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let status = std::process::Command::new("ffmpeg")
            .args([
                "-y",
                "-i",
                &input,
                "-i",
                &sub,
                "-c",
                "copy",
                "-c:s",
                "mov_text",
                "-map",
                "0",
                "-map",
                "1",
                &out,
            ])
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
        if !status.success() {
            // 回退：mkv 用 copy 字幕
            let status2 = std::process::Command::new("ffmpeg")
                .args([
                    "-y", "-i", &input, "-i", &sub, "-c", "copy", "-map", "0", "-map", "1", &out,
                ])
                .status()
                .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
            if !status2.success() {
                return Err(format!("ffmpeg 嵌入字幕失败，exit={status2}"));
            }
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("嵌入字幕任务失败: {e}"))?
}

/// 写入基础元数据（title/artist/description）。
/// 主路：进程内 libav（media-ffmpeg）；兜底：外部 ffmpeg CLI（对齐外置 mpv）。
#[tauri::command]
pub async fn media_convert_embed_metadata(
    input_path: String,
    output_path: String,
    metadata: Option<std::collections::HashMap<String, String>>,
) -> Result<MergeFilesResult, String> {
    let input = input_path.trim().to_string();
    let out = output_path.trim().to_string();
    if input.is_empty() || out.is_empty() {
        return Err("input/output 不能为空".into());
    }
    if !std::path::Path::new(&input).is_file() {
        return Err(format!("输入不存在: {input}"));
    }
    let meta = metadata.unwrap_or_default();
    if meta.is_empty() {
        return Ok(MergeFilesResult {
            output_path: input,
        });
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    let same = std::path::Path::new(&input) == std::path::Path::new(&out);
    let tmp_out = if same {
        format!("{out}.reader-meta.tmp")
    } else {
        out.clone()
    };

    #[cfg(feature = "media-ffmpeg")]
    {
        let input2 = input.clone();
        let tmp2 = tmp_out.clone();
        let meta2 = meta.clone();
        match tauri::async_runtime::spawn_blocking(move || {
            stream_copy_with_ffmpeg_next(&[input2], &tmp2, Some(&meta2))
        })
        .await
        .map_err(|e| format!("写入元数据任务失败: {e}"))?
        {
            Ok(_) => {
                if same {
                    std::fs::rename(&tmp_out, &out).map_err(|e| format!("替换输出失败: {e}"))?;
                }
                log::info!("media_convert_embed_metadata: libav ok");
                return Ok(MergeFilesResult { output_path: out });
            }
            Err(e) => {
                log::warn!("media_convert_embed_metadata: libav failed, cli-fallback: {e}");
                let _ = std::fs::remove_file(&tmp_out);
            }
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        remux_copy_with_ffmpeg_cli(&input, &tmp_out, Some(&meta), false)?;
        if same {
            std::fs::rename(&tmp_out, &out).map_err(|e| format!("替换输出失败: {e}"))?;
        }
        log::info!("media_convert_embed_metadata: cli-fallback ok");
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("写入元数据任务失败: {e}"))?
}

/// 单文件 stream-copy remux（fixup / 容器转换 copy 路径）。
/// 主路：进程内 libav；兜底：外部 ffmpeg CLI。
#[tauri::command]
pub async fn media_convert_remux_copy(
    input_path: String,
    output_path: String,
    reset_timestamps: Option<bool>,
) -> Result<MergeFilesResult, String> {
    let input = input_path.trim().to_string();
    let out = output_path.trim().to_string();
    if input.is_empty() || out.is_empty() {
        return Err("input/output 不能为空".into());
    }
    if !std::path::Path::new(&input).is_file() {
        return Err(format!("输入不存在: {input}"));
    }
    if let Some(parent) = std::path::Path::new(&out).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败: {e}"))?;
    }
    let same = std::path::Path::new(&input) == std::path::Path::new(&out);
    let tmp_out = if same {
        format!("{out}.reader-remux.tmp")
    } else {
        out.clone()
    };
    let reset = reset_timestamps.unwrap_or(false);

    #[cfg(feature = "media-ffmpeg")]
    {
        let input2 = input.clone();
        let tmp2 = tmp_out.clone();
        // reset_timestamps：libav 路径已做 rescale_ts；与 CLI genpts 同属尽力修复
        match tauri::async_runtime::spawn_blocking(move || {
            let _ = reset;
            stream_copy_with_ffmpeg_next(&[input2], &tmp2, None)
        })
        .await
        .map_err(|e| format!("remux 任务失败: {e}"))?
        {
            Ok(_) => {
                if same {
                    std::fs::rename(&tmp_out, &out).map_err(|e| format!("替换输出失败: {e}"))?;
                }
                log::info!("media_convert_remux_copy: libav ok");
                return Ok(MergeFilesResult { output_path: out });
            }
            Err(e) => {
                log::warn!("media_convert_remux_copy: libav failed, cli-fallback: {e}");
                let _ = std::fs::remove_file(&tmp_out);
            }
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        remux_copy_with_ffmpeg_cli(&input, &tmp_out, None, reset)?;
        if same {
            std::fs::rename(&tmp_out, &out).map_err(|e| format!("替换输出失败: {e}"))?;
        }
        log::info!("media_convert_remux_copy: cli-fallback ok");
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("remux 任务失败: {e}"))?
}
