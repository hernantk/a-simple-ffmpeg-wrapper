use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FFmpegState {
    pub is_downloading: bool,
    pub download_progress: f64,
    pub is_ready: bool,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub error_message: Option<String>,
}

impl Default for FFmpegState {
    fn default() -> Self {
        Self {
            is_downloading: false,
            download_progress: 0.0,
            is_ready: false,
            ffmpeg_path: None,
            ffprobe_path: None,
            error_message: None,
        }
    }
}

pub struct FFmpegManager {
    pub state: Mutex<FFmpegState>,
    pub cancel_download: AtomicBool,
}

impl FFmpegManager {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(FFmpegState::default()),
            cancel_download: AtomicBool::new(false),
        }
    }

    pub fn get_ffmpeg_dir(&self) -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".a-good-ffmpeg-wrapper")
    }

    pub fn get_ffmpeg_path(&self) -> Option<PathBuf> {
        let dir = self.get_ffmpeg_dir();
        let ffmpeg_exe = if cfg!(target_os = "windows") {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        };
        let path = dir.join(ffmpeg_exe);
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }

    pub fn check_ffmpeg(&self) -> FFmpegState {
        let mut state = self.state.lock().unwrap();

        if let Some(path) = self.get_ffmpeg_path() {
            state.is_ready = true;
            state.ffmpeg_path = Some(path.to_string_lossy().to_string());
            state.error_message = None;

            let ffprobe_exe = if cfg!(target_os = "windows") {
                "ffprobe.exe"
            } else {
                "ffprobe"
            };
            let ffprobe_path = self.get_ffmpeg_dir().join(ffprobe_exe);
            if ffprobe_path.exists() {
                state.ffprobe_path = Some(ffprobe_path.to_string_lossy().to_string());
            }
        } else {
            state.is_ready = false;
            state.ffmpeg_path = None;
        }

        state.clone()
    }

    pub async fn download_ffmpeg(
        &self,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, String> {
        {
            let mut state = self.state.lock().unwrap();
            if state.is_downloading {
                return Err("Download already in progress".to_string());
            }
            state.is_downloading = true;
            state.download_progress = 0.0;
            state.error_message = None;
        }

        self.cancel_download.store(false, Ordering::SeqCst);

        let result = self.do_download(app_handle).await;

        {
            let mut state = self.state.lock().unwrap();
            state.is_downloading = false;
            if result.is_ok() {
                state.is_ready = true;
                state.download_progress = 100.0;
                state.error_message = None;
            } else {
                state.error_message = result.as_ref().err().cloned();
            }
        }

        result
    }

    async fn do_download(
        &self,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, String> {
        let ffmpeg_dir = self.get_ffmpeg_dir();
        fs::create_dir_all(&ffmpeg_dir)
            .map_err(|e| format!("Failed to create directory {}: {}", ffmpeg_dir.display(), e))?;

        let (url, is_zip) = get_ffmpeg_url();

        let client = reqwest::ClientBuilder::new()
            .user_agent("a-good-ffmpeg-wrapper")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to download server: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Download failed with status: {} ({})",
                response.status(),
                url
            ));
        }

        let total_size = response.content_length().unwrap_or(0);

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read download data: {}", e))?
            .to_vec();

        if bytes.is_empty() {
            return Err("Downloaded file is empty".to_string());
        }

        if self.cancel_download.load(Ordering::SeqCst) {
            return Err("Download cancelled".to_string());
        }

        let _ = app_handle.emit("ffmpeg-download-progress", 40.0_f64);

        if is_zip {
            extract_zip(&bytes, &ffmpeg_dir, total_size)
                .map_err(|e| format!("Failed to extract archive: {}", e))?;
        } else {
            extract_tar_gz(&bytes, &ffmpeg_dir)
                .map_err(|e| format!("Failed to extract archive: {}", e))?;
        }

        if self.cancel_download.load(Ordering::SeqCst) {
            return Err("Download cancelled".to_string());
        }

        let _ = app_handle.emit("ffmpeg-download-progress", 90.0_f64);

        make_executable(&ffmpeg_dir);

        if let Some(path) = self.get_ffmpeg_path() {
            let _ = app_handle.emit("ffmpeg-download-progress", 100.0_f64);
            Ok(path.to_string_lossy().to_string())
        } else {
            Err(format!(
                "FFmpeg binary not found after extraction. Looked in: {}",
                ffmpeg_dir.display()
            ))
        }
    }

    pub fn cancel_download_process(&self) {
        self.cancel_download.store(true, Ordering::SeqCst);
    }
}

fn get_ffmpeg_url() -> (String, bool) {
    if cfg!(target_os = "windows") {
        (
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip".to_string(),
            true,
        )
    } else if cfg!(target_os = "macos") {
        (
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-macos-arm64-gpl.tar.gz".to_string(),
            false,
        )
    } else {
        (
            "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.gz".to_string(),
            false,
        )
    }
}

fn is_ffmpeg_binary(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "ffmpeg.exe" | "ffprobe.exe" | "ffmpeg" | "ffprobe"
    )
}

fn extract_zip(data: &[u8], dest: &PathBuf, _total_size: u64) -> Result<(), String> {
    use std::io::{self, Read};

    let cursor = io::Cursor::new(data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid zip archive: {}", e))?;

    let mut extracted_count = 0;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to access entry {}: {}", i, e))?;

        let entry_path = match file.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue,
        };

        let file_name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");

        if !is_ffmpeg_binary(file_name) {
            continue;
        }

        let mut content = Vec::new();
        file.read_to_end(&mut content)
            .map_err(|e| format!("Failed to read {}: {}", file_name, e))?;

        let outpath = dest.join(file_name);
        fs::write(&outpath, &content)
            .map_err(|e| format!("Failed to write {}: {}", file_name, e))?;

        extracted_count += 1;
    }

    if extracted_count == 0 {
        return Err(
            "No ffmpeg.exe or ffprobe.exe found in the downloaded archive. The archive structure may have changed.".to_string(),
        );
    }

    Ok(())
}

fn extract_tar_gz(data: &[u8], dest: &PathBuf) -> Result<(), String> {
    use flate2::read::GzDecoder;

    let decoder = GzDecoder::new(data);
    let mut archive = tar::Archive::new(decoder);

    let mut extracted_count = 0;

    let entries = archive
        .entries()
        .map_err(|e| format!("Failed to read tar archive: {}", e))?;

    for entry in entries {
        let mut entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry
            .path()
            .map_err(|e| format!("Failed to get entry path: {}", e))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if !is_ffmpeg_binary(&file_name) {
            continue;
        }

        let outpath = dest.join(&file_name);
        entry
            .unpack(&outpath)
            .map_err(|e| format!("Failed to unpack {}: {}", file_name, e))?;

        extracted_count += 1;
    }

    if extracted_count == 0 {
        return Err(
            "No ffmpeg or ffprobe binary found in the downloaded archive.".to_string(),
        );
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn make_executable(dir: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;

    for name in &["ffmpeg", "ffprobe"] {
        let path = dir.join(name);
        if path.exists() {
            if let Ok(metadata) = fs::metadata(&path) {
                let mut perms = metadata.permissions();
                perms.set_mode(0o755);
                let _ = fs::set_permissions(&path, perms);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn make_executable(_dir: &PathBuf) {}
