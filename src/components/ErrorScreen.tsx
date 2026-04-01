import { useCallback } from "react";
import { ConversionJob } from "../types";

interface ErrorScreenProps {
  jobs: ConversionJob[];
  onDismiss: () => void;
  onRetry?: (failedJobs: ConversionJob[]) => void;
}

export function ErrorScreen({ jobs, onDismiss, onRetry }: ErrorScreenProps) {
  const failedJobs = jobs.filter((j) => j.status === "failed");

  if (failedJobs.length === 0) {
    return null;
  }

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry(failedJobs);
    }
  }, [onRetry, failedJobs]);

  return (
    <div className="error-screen-overlay" onClick={handleDismiss}>
      <div className="error-screen" onClick={(e) => e.stopPropagation()}>
        <div className="error-screen-header">
          <div className="error-screen-title">
            <svg
              className="error-screen-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2>Conversion Errors</h2>
            <span className="error-count">{failedJobs.length} file(s) failed</span>
          </div>
          <button className="error-screen-close" onClick={handleDismiss}>
            &times;
          </button>
        </div>

        <div className="error-screen-body">
          {failedJobs.map((job) => (
            <div key={job.id} className="error-item">
              <div className="error-item-info">
                <span className="error-item-name" title={job.inputPath}>
                  {job.inputPath.split(/[\\/]/).pop() || job.inputPath}
                </span>
                <span className="error-item-target">
                  Target: {job.outputFormat.toUpperCase()}
                </span>
              </div>
              <div className="error-item-message" title={job.error}>
                {job.error || "Unknown error"}
              </div>
            </div>
          ))}
        </div>

        <div className="error-screen-actions">
          {onRetry && (
            <button className="error-retry-btn" onClick={handleRetry}>
              Retry Failed
            </button>
          )}
          <button className="error-dismiss-btn" onClick={handleDismiss}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
