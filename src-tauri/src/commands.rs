use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tauri::Emitter;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;
use uuid::Uuid;

use crate::ffmpeg::FFmpegManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionJob {
    pub id: String,
    pub input_path: String,
    pub output_format: String,
    pub output_dir: String,
    pub status: ConversionStatus,
    pub progress: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConversionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionProgress {
    pub id: String,
    pub progress: f64,
    pub status: String,
    pub message: String,
}

#[tauri::command]
pub async fn get_ffmpeg_state(
    state: tauri::State<'_, FFmpegManager>,
) -> Result<crate::ffmpeg::FFmpegState, String> {
    Ok(state.check_ffmpeg())
}

#[tauri::command]
pub async fn download_ffmpeg(
    app: tauri::AppHandle,
    state: tauri::State<'_, FFmpegManager>,
) -> Result<String, String> {
    state.download_ffmpeg(&app).await
}

#[tauri::command]
pub async fn cancel_ffmpeg_download(
    state: tauri::State<'_, FFmpegManager>,
) -> Result<(), String> {
    state.cancel_download_process();
    Ok(())
}

#[tauri::command]
pub async fn convert_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, FFmpegManager>,
    input_path: String,
    output_format: String,
    output_dir: String,
    job_id: String,
    overwrite_existing: bool,
) -> Result<String, String> {
    let ffmpeg_path = state
        .get_ffmpeg_path()
        .ok_or("FFmpeg not available. Please download it first.")?;

    let input = PathBuf::from(&input_path);
    if !input.exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    let output_dir_path = PathBuf::from(&output_dir);
    if !output_dir_path.exists() {
        std::fs::create_dir_all(&output_dir_path)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    let stem = input
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let output_filename = format!("{}.{}", stem, output_format);
    let mut output_path = output_dir_path.join(&output_filename);

    // If file exists and we shouldn't overwrite, generate a new name with (1), (2), etc.
    if !overwrite_existing && output_path.exists() {
        let mut counter = 1;
        loop {
            let new_filename = format!("{} ({}).{}", stem, counter, output_format);
            let new_path = output_dir_path.join(&new_filename);
            if !new_path.exists() {
                output_path = new_path;
                break;
            }
            counter += 1;
        }
    }

    let progress_event = ConversionProgress {
        id: job_id.clone(),
        progress: 0.0,
        status: "running".to_string(),
        message: "Starting conversion...".to_string(),
    };
    _ = app.emit("conversion-progress", &progress_event);

    let result = run_ffmpeg(
        &app,
        ffmpeg_path.to_string_lossy().as_ref(),
        &input_path,
        &output_path.to_string_lossy().to_string(),
        &output_format,
        &job_id,
        overwrite_existing,
    )
    .await;

    match result {
        Ok(_) => {
            let complete_event = ConversionProgress {
                id: job_id.clone(),
                progress: 100.0,
                status: "completed".to_string(),
                message: "Conversion completed successfully!".to_string(),
            };
            _ = app.emit("conversion-progress", &complete_event);
            Ok(output_path.to_string_lossy().to_string())
        }
        Err(e) => {
            let error_event = ConversionProgress {
                id: job_id.clone(),
                progress: 0.0,
                status: "failed".to_string(),
                message: e.clone(),
            };
            _ = app.emit("conversion-progress", &error_event);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn convert_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, FFmpegManager>,
    input_paths: Vec<String>,
    output_format: String,
    output_dir: String,
    overwrite_existing: bool,
) -> Result<Vec<ConversionJob>, String> {
    let ffmpeg_path = state
        .get_ffmpeg_path()
        .ok_or("FFmpeg not available. Please download it first.")?;

    let mut jobs = Vec::new();

    for input_path in &input_paths {
        let job_id = Uuid::new_v4().to_string();
        let job = ConversionJob {
            id: job_id.clone(),
            input_path: input_path.clone(),
            output_format: output_format.clone(),
            output_dir: output_dir.clone(),
            status: ConversionStatus::Pending,
            progress: 0.0,
            error: None,
        };
        jobs.push(job);

        let ffmpeg_path_clone = ffmpeg_path.clone();
        let input_path_clone = input_path.clone();
        let output_format_clone = output_format.clone();
        let output_dir_clone = output_dir.clone();
        let job_id_clone = job_id.clone();
        let app_clone = app.clone();

        tauri::async_runtime::spawn(async move {
            let input = PathBuf::from(&input_path_clone);
            let stem = input
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let mut output_filename = format!("{}.{}", stem, output_format_clone);
            let mut output_path = PathBuf::from(&output_dir_clone).join(&output_filename);

            if output_path.canonicalize().ok() == input.canonicalize().ok() {
                let stem_with_suffix = format!("{}_converted", stem);
                output_filename.clone_from(&format!("{}.{}", stem_with_suffix, output_format_clone));
                output_path = PathBuf::from(&output_dir_clone).join(&output_filename);
            }

            // If file exists and we shouldn't overwrite, generate a new name with (1), (2), etc.
            if !overwrite_existing && output_path.exists() {
                let mut counter = 1;
                loop {
                    let new_filename = format!("{} ({}).{}", stem, counter, output_format_clone);
                    let new_path = PathBuf::from(&output_dir_clone).join(&new_filename);
                    if !new_path.exists() {
                        output_path = new_path;
                        break;
                    }
                    counter += 1;
                }
            }

            let progress_event = ConversionProgress {
                id: job_id_clone.clone(),
                progress: 0.0,
                status: "running".to_string(),
                message: "Starting conversion...".to_string(),
            };
            _ = app_clone.emit("conversion-progress", &progress_event);

            let result = run_ffmpeg(
                &app_clone,
                ffmpeg_path_clone.to_string_lossy().as_ref(),
                &input_path_clone,
                &output_path.to_string_lossy().to_string(),
                &output_format_clone,
                &job_id_clone,
                overwrite_existing,
            )
            .await;

            match result {
                Ok(_) => {
                    let complete_event = ConversionProgress {
                        id: job_id_clone.clone(),
                        progress: 100.0,
                        status: "completed".to_string(),
                        message: "Conversion completed!".to_string(),
                    };
                    _ = app_clone.emit("conversion-progress", &complete_event);
                }
                Err(e) => {
                    let error_event = ConversionProgress {
                        id: job_id_clone.clone(),
                        progress: 0.0,
                        status: "failed".to_string(),
                        message: e.clone(),
                    };
                    _ = app_clone.emit("conversion-progress", &error_event);
                }
            }
        });
    }

    Ok(jobs)
}

async fn run_ffmpeg(
    app: &tauri::AppHandle,
    ffmpeg_path: &str,
    input_path: &str,
    output_path: &str,
    output_format: &str,
    job_id: &str,
    overwrite_existing: bool,
) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg_path);
    cmd.arg("-i").arg(input_path);
    
    // Only add -y flag if we want to overwrite existing files
    if overwrite_existing {
        cmd.arg("-y");
    } else {
        cmd.arg("-n"); // Do not overwrite output files
    }

    let is_audio = matches!(
        output_format,
        "mp3" | "aac" | "wav" | "flac" | "ogg" | "wma" | "opus" | "m4a"
    );
    let is_image = matches!(
        output_format,
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tiff" | "ico" | "svg"
    );

    if is_audio {
        cmd.arg("-vn");
        match output_format {
            "mp3" => {
                cmd.args(["-c:a", "libmp3lame"]).arg("-q:a").arg("2");
            }
            "aac" => {
                cmd.args(["-c:a", "aac"]).arg("-b:a").arg("192k");
            }
            "wav" => {
                cmd.args(["-c:a", "pcm_s16le"]);
            }
            "flac" => {
                cmd.args(["-c:a", "flac"]);
            }
            "ogg" => {
                cmd.args(["-c:a", "libvorbis"]).arg("-q:a").arg("5");
            }
            "opus" => {
                cmd.args(["-c:a", "libopus"]).arg("-b:a").arg("128k");
            }
            "m4a" => {
                cmd.args(["-c:a", "aac"]).arg("-b:a").arg("192k");
            }
            _ => {}
        }
    } else if is_image {
        cmd.arg("-frames:v").arg("1");
        if matches!(output_format, "jpg" | "jpeg") {
            cmd.args(["-q:v", "2"]);
        }
    } else {
        match output_format {
            "mp4" => {
                cmd.args(["-c:v", "libx264"])
                    .arg("-preset")
                    .arg("medium")
                    .args(["-c:a", "aac"])
                    .arg("-b:a")
                    .arg("192k");
            }
            "webm" => {
                cmd.args(["-c:v", "libvpx-vp9"])
                    .args(["-c:a", "libopus"])
                    .arg("-b:a")
                    .arg("192k");
            }
            "gif" => {
                cmd.args(["-vf", "scale=640:-1:flags=lanczos"])
                    .arg("-loop")
                    .arg("0");
            }
            "mkv" => {
                cmd.args(["-c:v", "libx264"]).args(["-c:a", "aac"]);
            }
            "avi" => {
                cmd.args(["-c:v", "mpeg4"]).args(["-c:a", "mp3"]);
            }
            _ => {}
        }
    }

    cmd.arg(output_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture FFmpeg stderr")?;

    let mut duration: Option<f64> = None;
    let mut error_output = String::new();

    let mut reader = tokio::io::BufReader::new(stderr);
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                let line_lower = line.to_lowercase();

                if line_lower.contains("duration:") && duration.is_none() {
                    if let Some(dur_str) = line.split("Duration:").nth(1) {
                        if let Some(dur_str) = dur_str.split(',').next() {
                            if let Ok(dur) = parse_duration(dur_str.trim()) {
                                duration = Some(dur);
                            }
                        }
                    }
                }

                if line_lower.contains("time=") {
                    if let Some(time_str) = line.split("time=").nth(1) {
                        if let Some(time_str) = time_str.split_whitespace().next() {
                            if let Ok(t) = parse_duration(time_str) {
                                if let Some(dur) = duration {
                                    if dur > 0.0 {
                                        let progress = ((t / dur) * 100.0).min(99.0);
                                        let progress_event = ConversionProgress {
                                            id: job_id.to_string(),
                                            progress,
                                            status: "running".to_string(),
                                            message: format!("Converting: {:.1}%", progress),
                                        };
                                        _ = app.emit("conversion-progress", &progress_event);
                                    }
                                }
                            }
                        }
                    }
                }

                if line_lower.contains("error")
                    || line_lower.contains("invalid")
                    || line_lower.contains("unsupported")
                {
                    if !error_output.is_empty() {
                        error_output.push_str(" | ");
                    }
                    error_output.push_str(line.trim());
                }
            }
            Err(_) => break,
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("FFmpeg process failed: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        let msg = if !error_output.is_empty() {
            error_output
        } else {
            format!("FFmpeg exited with code: {:?}", status.code())
        };
        Err(msg)
    }
}

fn parse_duration(duration_str: &str) -> Result<f64, String> {
    let parts: Vec<&str> = duration_str.split(':').collect();
    if parts.len() != 3 {
        return Err("Invalid duration format".to_string());
    }

    let hours: f64 = parts[0]
        .parse()
        .map_err(|_| "Invalid hours")?;
    let minutes: f64 = parts[1]
        .parse()
        .map_err(|_| "Invalid minutes")?;
    let seconds: f64 = parts[2]
        .parse()
        .map_err(|_| "Invalid seconds")?;

    Ok(hours * 3600.0 + minutes * 60.0 + seconds)
}

#[tauri::command]
pub async fn get_file_info(path: String) -> Result<serde_json::Value, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File not found".to_string());
    }

    let metadata = std::fs::metadata(&path_buf)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let file_name = path_buf
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let extension = path_buf
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
        .to_lowercase();
    let size = metadata.len();

    Ok(serde_json::json!({
        "name": file_name,
        "extension": extension,
        "size": size,
        "path": path
    }))
}
