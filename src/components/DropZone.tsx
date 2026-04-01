import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileItem } from "../types";

interface DropZoneProps {
  onFilesAdded: (files: FileItem[]) => void;
  disabled: boolean;
}

export function DropZone({ onFilesAdded, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const listenersRef = useRef<(() => void)[]>([]);
  const onFilesAddedRef = useRef(onFilesAdded);
  const disabledRef = useRef(disabled);

  const getFilesFromPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = [...new Set(paths.filter((path) => path.trim().length > 0))];

    const fileResults = await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          const info = await invoke<{
            name: string;
            extension: string;
            size: number;
            path: string;
          }>("get_file_info", { path });

          return {
            path: info.path,
            name: info.name,
            extension: info.extension,
            size: info.size,
          } satisfies FileItem;
        } catch (error) {
          console.error("Failed to get file info for:", path, error);
          return null;
        }
      })
    );

    return fileResults.filter((file): file is FileItem => file !== null);
  }, []);

  useEffect(() => {
    onFilesAddedRef.current = onFilesAdded;
  }, [onFilesAdded]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      setIsDragging(false);
    }
  }, [disabled]);

  useEffect(() => {
    let mounted = true;

    const setupListeners = async () => {
      try {
        const unlistenDragDrop = await getCurrentWindow().onDragDropEvent(async (event) => {
          if (!mounted) return;

          if (event.payload.type === "enter" || event.payload.type === "over") {
            if (!disabledRef.current) {
              setIsDragging(true);
            }
            return;
          }

          if (event.payload.type === "leave") {
            setIsDragging(false);
            return;
          }

          setIsDragging(false);
          if (disabledRef.current) return;

          const files = await getFilesFromPaths(event.payload.paths);
          if (files.length > 0) {
            onFilesAddedRef.current(files);
          }
        });

        if (!mounted) {
          unlistenDragDrop();
          return;
        }

        listenersRef.current = [unlistenDragDrop];
      } catch (error) {
        console.error("Failed to setup drag and drop listeners:", error);
      }
    };

    setupListeners();

    return () => {
      mounted = false;
      listenersRef.current.forEach((unlisten) => unlisten());
      listenersRef.current = [];
    };
  }, [getFilesFromPaths]);

  const handleFileSelect = useCallback(async () => {
    if (disabled) return;

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: [
              "mp4",
              "avi",
              "mkv",
              "mov",
              "wmv",
              "webm",
              "flv",
              "mp3",
              "wav",
              "flac",
              "aac",
              "ogg",
              "wma",
              "opus",
              "m4a",
              "png",
              "jpg",
              "jpeg",
              "webp",
              "bmp",
              "tiff",
              "ico",
              "svg",
              "gif",
            ],
          },
        ],
      });

      if (selected) {
        const paths = (Array.isArray(selected) ? selected : [selected]).filter(
          (path): path is string => typeof path === "string"
        );
        const files = await getFilesFromPaths(paths);

        if (files.length > 0) {
          onFilesAddedRef.current(files);
        }
      }
    } catch (error) {
      console.error("Failed to select files:", error);
    }
  }, [disabled, getFilesFromPaths]);

  return (
    <div
      className={`dropzone ${isDragging ? "dragging" : ""} ${disabled ? "disabled" : ""}`}
      onClick={handleFileSelect}
    >
      <div className="dropzone-content">
        <svg
          className="dropzone-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="dropzone-text">
          Drag & drop files here, or click to browse
        </p>
        <p className="dropzone-hint">
          Supports video, audio, and image files
        </p>
      </div>
    </div>
  );
}
