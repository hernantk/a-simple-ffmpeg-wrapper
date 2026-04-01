mod commands;
mod ffmpeg;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let ffmpeg_manager = ffmpeg::FFmpegManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ffmpeg_manager)
        .invoke_handler(tauri::generate_handler![
            commands::get_ffmpeg_state,
            commands::download_ffmpeg,
            commands::cancel_ffmpeg_download,
            commands::convert_file,
            commands::convert_batch,
            commands::get_file_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
