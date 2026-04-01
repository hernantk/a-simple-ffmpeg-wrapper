import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AppConfig,
  ConversionJob,
  ConversionProgressEvent,
  ConversionType,
  FFmpegState,
  FileItem,
} from "../types";

export function useConversion() {
  const [ffmpegState, setFfmpegState] = useState<FFmpegState>({
    isDownloading: false,
    downloadProgress: 0,
    isReady: false,
    ffmpegPath: null,
    ffprobePath: null,
    errorMessage: null,
  });
  const [conversionType, setConversionType] = useState<ConversionType>("video");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("");
  const [outputDir, setOutputDir] = useState<string>("");
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState<{ jobs: ConversionJob[] } | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [hasDefaultOutputDir, setHasDefaultOutputDir] = useState(false);
  const listenersRef = useRef<(() => void)[]>([]);

  const checkFFmpeg = useCallback(async () => {
    try {
      const state = await invoke<FFmpegState>("get_ffmpeg_state");
      setFfmpegState(state);
    } catch {
      setFfmpegState((prev) => ({ ...prev, isReady: false }));
    }
  }, []);

  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadFFmpeg = useCallback(async () => {
    setDownloadError(null);
    setFfmpegState((prev) => ({
      ...prev,
      isDownloading: true,
      downloadProgress: 0,
    }));

    try {
      const listener = await listen<number>(
        "ffmpeg-download-progress",
        (event) => {
          setFfmpegState((prev) => ({
            ...prev,
            downloadProgress: event.payload,
          }));
        }
      );
      listenersRef.current.push(listener);

      await invoke<string>("download_ffmpeg");
      await checkFFmpeg();
    } catch (error) {
      const errorMsg =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unknown error occurred";
      setDownloadError(errorMsg);
      console.error("Failed to download FFmpeg:", error);
      setFfmpegState((prev) => ({
        ...prev,
        isDownloading: false,
        downloadProgress: 0,
      }));
    }
  }, [checkFFmpeg]);

  const cancelDownload = useCallback(async () => {
    try {
      await invoke("cancel_ffmpeg_download");
    } catch (error) {
      console.error("Failed to cancel download:", error);
    }
  }, []);

  const selectOutputDir = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select output directory",
      });
      if (selected && typeof selected === "string") {
        setOutputDir(selected);
      }
    } catch (error) {
      console.error("Failed to select output directory:", error);
    }
  }, []);

  const addFiles = useCallback((newFiles: FileItem[]) => {
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      const unique = newFiles.filter((f) => !existingPaths.has(f.path));
      return [...prev, ...unique];
    });
    
    // Se não tiver diretório padrão configurado E outputDir estiver vazio, 
    // use o diretório do primeiro arquivo
    if (!hasDefaultOutputDir && outputDir === "" && newFiles.length > 0) {
      const firstFile = newFiles[0];
      const lastSlash = firstFile.path.lastIndexOf("\\") !== -1 
        ? firstFile.path.lastIndexOf("\\") 
        : firstFile.path.lastIndexOf("/");
      const fileDir = firstFile.path.substring(0, lastSlash);
      if (fileDir) {
        setOutputDir(fileDir);
      }
    }
  }, [outputDir, hasDefaultOutputDir]);

  const removeFile = useCallback((path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const startConversion = useCallback(async () => {
    if (files.length === 0 || !selectedFormat || !outputDir) return;

    setIsConverting(true);
    setJobs([]);
    setConversionError(null);

    try {
      const listener = await listen<ConversionProgressEvent>(
        "conversion-progress",
        (event) => {
          const { id, progress, status, message } = event.payload;
          setJobs((prev) => {
            const updated = prev.map((job) =>
              job.id === id
                ? {
                    ...job,
                    progress,
                    status: status as ConversionJob["status"],
                    error: status === "failed" ? message : job.error,
                  }
                : job
            );

            const allDone = updated.every(
              (j) => j.status === "completed" || j.status === "failed"
            );
            if (allDone) {
              const failed = updated.filter((j) => j.status === "failed");
              if (failed.length > 0) {
                setConversionError({ jobs: updated });
              }
            }

            return updated;
          });
        }
      );
      listenersRef.current.push(listener);

      const inputPaths = files.map((f) => f.path);
      const newJobs = await invoke<ConversionJob[]>("convert_batch", {
        inputPaths,
        outputFormat: selectedFormat,
        outputDir,
        overwriteExisting,
      });

      setJobs(newJobs);
    } catch (error) {
      console.error("Failed to start conversion:", error);
    } finally {
      setIsConverting(false);
    }
  }, [files, selectedFormat, outputDir, overwriteExisting]);

  const clearConversionError = useCallback(() => {
    setConversionError(null);
  }, []);

  // Load config on mount
  const loadConfig = useCallback(async () => {
    try {
      const config = await invoke<AppConfig>("get_config");
      if (config.defaultOutputDir) {
        setOutputDir(config.defaultOutputDir);
        setHasDefaultOutputDir(true);
      }
      setOverwriteExisting(config.overwriteExisting);
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  }, []);

  // Save overwrite preference when changed
  const updateOverwriteExisting = useCallback(async (value: boolean) => {
    setOverwriteExisting(value);
    try {
      await invoke("set_overwrite_existing", { value });
    } catch (error) {
      console.error("Failed to save overwrite setting:", error);
    }
  }, []);

  // Save default output dir
  const setDefaultOutputDir = useCallback(async (dir: string | null) => {
    try {
      await invoke("set_default_output_dir", { dir });
      if (dir) {
        setHasDefaultOutputDir(true);
      } else {
        setHasDefaultOutputDir(false);
      }
    } catch (error) {
      console.error("Failed to save default output dir:", error);
    }
  }, []);

  useEffect(() => {
    checkFFmpeg();
    loadConfig();
    return () => {
      listenersRef.current.forEach((unlisten) => unlisten());
    };
  }, [checkFFmpeg, loadConfig]);

  useEffect(() => {
    setSelectedFormat("");
  }, [conversionType]);

    return {
    ffmpegState,
    downloadError,
    setDownloadError,
    conversionType,
    setConversionType,
    files,
    selectedFormat,
    setSelectedFormat,
    outputDir,
    setOutputDir,
    jobs,
    isConverting,
    conversionError,
    overwriteExisting,
    setOverwriteExisting: updateOverwriteExisting,
    setDefaultOutputDir,
    clearConversionError,
    downloadFFmpeg,
    cancelDownload,
    selectOutputDir,
    addFiles,
    removeFile,
    clearFiles,
    startConversion,
    checkFFmpeg,
  };
}
