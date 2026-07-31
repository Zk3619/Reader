//! 媒体格式转换（导出用）：图片 `image`，音频 `ffmpeg-next`（桌面端启用时）

use serde::Serialize;
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
            Ok(r) => return Ok(r),
            Err(e) => {
                log::warn!("ffmpeg-next 合并失败，回退 CLI: {e}");
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

#[cfg(feature = "media-ffmpeg")]
fn merge_with_ffmpeg_next(inputs: &[String], out: &str) -> Result<MergeFilesResult, String> {
    use ffmpeg_next as ffmpeg;
    use ffmpeg_next::{codec, encoder, format, media, Rational};

    ffmpeg::init().map_err(|e| format!("ffmpeg-next init: {e:?}"))?;

    let mut inputs_ctx: Vec<format::context::Input> = Vec::with_capacity(inputs.len());
    for p in inputs {
        let ictx = format::input(&std::path::Path::new(p))
            .map_err(|e| format!("打开输入失败 {p}: {e:?}"))?;
        inputs_ctx.push(ictx);
    }

    let mut octx = format::output(&std::path::Path::new(out))
        .map_err(|e| format!("打开输出失败 {out}: {e:?}"))?;

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

/// 使用系统 ffmpeg 拉取 HLS/m3u8 到本地文件。
#[tauri::command]
pub async fn media_convert_fetch_hls(
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
        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            url,
            "-c".to_string(),
            "copy".to_string(),
        ];
        if let Some(hdrs) = headers {
            let mut lines = String::new();
            for (k, v) in hdrs {
                lines.push_str(&format!("{k}: {v}\r\n"));
            }
            if !lines.is_empty() {
                args.splice(0..0, ["-headers".into(), lines]);
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
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("HLS 任务失败: {e}"))?
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
    tauri::async_runtime::spawn_blocking(move || {
        let mut args = vec!["-y".into(), "-i".into(), input.clone(), "-c".into(), "copy".into()];
        for (k, v) in &meta {
            if v.trim().is_empty() {
                continue;
            }
            args.push("-metadata".into());
            args.push(format!("{k}={v}"));
        }
        args.push(tmp_out.clone());
        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .status()
            .map_err(|e| format!("无法启动 ffmpeg: {e}"))?;
        if !status.success() {
            return Err(format!("ffmpeg 写入元数据失败，exit={status}"));
        }
        if same {
            std::fs::rename(&tmp_out, &out).map_err(|e| format!("替换输出失败: {e}"))?;
        }
        Ok(MergeFilesResult { output_path: out })
    })
    .await
    .map_err(|e| format!("写入元数据任务失败: {e}"))?
}
