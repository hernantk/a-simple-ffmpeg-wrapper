import { DropZone } from "./components/DropZone";
import { ConversionTypeTabs, FormatSelector } from "./components/ConversionType";
import { FileList } from "./components/FileList";
import { FFmpegStatus } from "./components/FFmpegStatus";
import { ErrorScreen } from "./components/ErrorScreen";
import { AppLogo } from "./components/AppLogo";
import { UpdateNotification } from "./components/UpdateNotification";
import { useConversion } from "./hooks/useConversion";
import "./App.css";

function App() {
  const {
    ffmpegState,
    downloadError,
    setDownloadError,
    conversionType,
    setConversionType,
    files,
    selectedFormat,
    setSelectedFormat,
    outputDir,
    jobs,
    isConverting,
    overwriteExisting,
    setOverwriteExisting,
    downloadFFmpeg,
    cancelDownload,
    selectOutputDir,
    addFiles,
    removeFile,
    clearFiles,
    startConversion,
    conversionError,
    clearConversionError,
  } = useConversion();

  const canConvert =
    files.length > 0 &&
    selectedFormat &&
    outputDir &&
    ffmpegState.isReady &&
    !isConverting;

  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const runningJobs = jobs.filter((j) => j.status === "running").length;

  const hasSidebar = files.length > 0 || jobs.length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <AppLogo />
          <h1 className="app-title">A Simple FFmpeg Wrapper</h1>
        </div>
        <FFmpegStatus
          state={ffmpegState}
          downloadError={downloadError}
          onDownload={downloadFFmpeg}
          onCancelDownload={cancelDownload}
          onClearError={() => setDownloadError(null)}
        />
      </header>

      <div className="app-body">
        <main className="app-main">
          <ConversionTypeTabs
            value={conversionType}
            onChange={setConversionType}
          />

          <DropZone onFilesAdded={addFiles} disabled={!ffmpegState.isReady} />

          <div className="controls">
            <div className="controls-row">
              <FormatSelector
                conversionType={conversionType}
                value={selectedFormat}
                onChange={setSelectedFormat}
              />

              <div className="output-dir">
                <label className="format-label">Output Directory</label>
                <div className="output-dir-input">
                  <input
                    type="text"
                    className="dir-input"
                    value={outputDir}
                    placeholder="Select output directory..."
                    readOnly
                  />
                  <button className="browse-btn" onClick={selectOutputDir}>
                    Browse
                  </button>
                </div>
              </div>
            </div>

            <div className="convert-section">
              {jobs.length > 0 && (
                <div className="batch-status">
                  {runningJobs > 0 && (
                    <span className="batch-running">
                      {runningJobs} converting...
                    </span>
                  )}
                  {completedJobs > 0 && (
                    <span className="batch-completed">
                      {completedJobs} completed
                    </span>
                  )}
                  {failedJobs > 0 && (
                    <button
                      className="batch-failed-btn"
                      onClick={() => clearConversionError()}
                    >
                      {failedJobs} failed
                    </button>
                  )}
                </div>
              )}

              <div className="convert-controls">
                <label className="overwrite-checkbox" title="Quando desmarcado, adiciona (1), (2), etc. ao nome do arquivo">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    disabled={isConverting}
                  />
                  <span>Sobrescrever arquivos existentes</span>
                </label>

                <button
                  className="convert-btn"
                  onClick={startConversion}
                  disabled={!canConvert}
                >
                  {isConverting
                    ? `Converting... (${runningJobs} active)`
                    : `Convert ${files.length} file${files.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className={`app-sidebar${hasSidebar ? " visible" : ""}`}>
          <FileList
            files={files}
            jobs={jobs}
            onRemove={removeFile}
            onClear={clearFiles}
          />
        </aside>
      </div>

      {conversionError && (
        <ErrorScreen
          jobs={conversionError.jobs}
          onDismiss={() => clearConversionError()}
        />
      )}
      <UpdateNotification />
    </div>
  );
}

export default App;
