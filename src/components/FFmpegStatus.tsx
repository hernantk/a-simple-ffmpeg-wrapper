import { FFmpegState } from "../types";

interface FFmpegStatusProps {
  state: FFmpegState;
  downloadError: string | null;
  onDownload: () => void;
  onCancelDownload: () => void;
  onClearError: () => void;
}

export function FFmpegStatus({
  state,
  downloadError,
  onDownload,
  onCancelDownload,
  onClearError,
}: FFmpegStatusProps) {
  if (state.isReady) {
    return (
      <div className="ffmpeg-status status-ready">
        <span className="status-dot ready"></span>
        <span className="status-text">FFmpeg ready</span>
      </div>
    );
  }

  return (
    <div className="ffmpeg-status status-not-ready">
      <span className="status-dot not-ready"></span>
      <span className="status-text">FFmpeg not found</span>
      {state.isDownloading ? (
        <div className="download-progress">
          <div className="download-bar">
            <div
              className="download-fill"
              style={{ width: `${state.downloadProgress}%` }}
            />
          </div>
          <span className="download-percent">
            {state.downloadProgress.toFixed(0)}%
          </span>
          <button className="cancel-btn" onClick={onCancelDownload}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="download-actions">
          <button className="download-btn" onClick={onDownload}>
            Download FFmpeg
          </button>
        </div>
      )}
      {downloadError && (
        <div className="download-error">
          <span className="error-text">{downloadError}</span>
          <button className="error-dismiss" onClick={onClearError}>
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
