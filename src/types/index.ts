export type ConversionType = "audio" | "video" | "image";

export interface FileItem {
  path: string;
  name: string;
  extension: string;
  size: number;
}

export interface ConversionJob {
  id: string;
  inputPath: string;
  outputFormat: string;
  outputDir: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  error?: string;
}

export interface ConversionProgressEvent {
  id: string;
  progress: number;
  status: string;
  message: string;
}

export interface FFmpegState {
  isDownloading: boolean;
  downloadProgress: number;
  isReady: boolean;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  errorMessage: string | null;
}

export interface AppConfig {
  defaultOutputDir: string | null;
  overwriteExisting: boolean;
}

export const AUDIO_FORMATS = ["mp3", "aac", "wav", "flac", "ogg", "wma", "opus", "m4a"];
export const VIDEO_FORMATS = ["mp4", "webm", "mkv", "avi", "mov", "flv", "wmv", "gif"];
export const IMAGE_FORMATS = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "ico", "svg"];

export const getFormatsForType = (type: ConversionType): string[] => {
  switch (type) {
    case "audio":
      return AUDIO_FORMATS;
    case "video":
      return VIDEO_FORMATS;
    case "image":
      return IMAGE_FORMATS;
  }
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};
