import { useUpdater } from "../hooks/useUpdater";
import "./UpdateNotification.css";

export function UpdateNotification() {
  const {
    checking,
    updateAvailable,
    updateInfo,
    downloading,
    downloadProgress,
    error,
    downloadAndInstall,
    clearError,
  } = useUpdater();

  if (checking) {
    return (
      <div className="update-notification checking">
        <span>Checking for updates...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="update-notification error">
        <span>Update error: {error}</span>
        <button onClick={clearError}>Dismiss</button>
      </div>
    );
  }

  if (downloading) {
    return (
      <div className="update-notification downloading">
        <span>Downloading update...</span>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      </div>
    );
  }

  if (updateAvailable && updateInfo) {
    return (
      <div className="update-notification available">
        <div className="update-info">
          <span className="update-version">
            Version {updateInfo.version} available
          </span>
          {updateInfo.body && (
            <span className="update-changelog">{updateInfo.body}</span>
          )}
        </div>
        <button
          className="update-btn"
          onClick={downloadAndInstall}
          disabled={downloading}
        >
          Update Now
        </button>
      </div>
    );
  }

  return null;
}