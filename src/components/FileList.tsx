import { ConversionJob, FileItem, formatFileSize } from "../types";

interface FileListProps {
  files: FileItem[];
  jobs: ConversionJob[];
  onRemove: (path: string) => void;
  onClear: () => void;
}

export function FileList({ files, jobs, onRemove, onClear }: FileListProps) {
  if (files.length === 0 && jobs.length === 0) {
    return null;
  }

  return (
    <div className="file-list">
      <div className="file-list-header">
        <span className="file-count">{files.length} file(s)</span>
        {files.length > 0 && (
          <button className="clear-btn" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>

      <div className="file-items">
        {files.map((file) => {
          const job = jobs.find(
            (j) => j.inputPath === file.path || j.inputPath.endsWith(file.name)
          );

          return (
            <div key={file.path} className="file-item">
              <div className="file-info">
                <span className="file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="file-meta">
                  {file.extension.toUpperCase()} &middot; {formatFileSize(file.size)}
                </span>
              </div>

              {job ? (
                <div className="file-status">
                  <span className={`status-badge status-${job.status}`}>
                    {job.status}
                  </span>
                  {job.status === "running" && (
                    <span className="status-progress">
                      {job.progress.toFixed(0)}%
                    </span>
                  )}
                  {job.status === "failed" && job.error && (
                    <span className="status-error" title={job.error}>
                      Error
                    </span>
                  )}
                </div>
              ) : (
                <button
                  className="remove-btn"
                  onClick={() => onRemove(file.path)}
                  disabled={jobs.some((j) => j.status === "running")}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
