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
        video_backend: "none".into(),
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
