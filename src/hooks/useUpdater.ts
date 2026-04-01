import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState, useEffect, useCallback } from "react";

interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

interface UpdaterState {
  checking: boolean;
  updateAvailable: boolean;
  updateInfo: UpdateInfo | null;
  downloading: boolean;
  downloadProgress: number;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    checking: false,
    updateAvailable: false,
    updateInfo: null,
    downloading: false,
    downloadProgress: 0,
    error: null,
  });

  const checkForUpdates = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      const update = await check();

      if (update) {
        setState((prev) => ({
          ...prev,
          checking: false,
          updateAvailable: true,
          updateInfo: {
            version: update.version,
            date: update.date,
            body: update.body,
          },
        }));
        return update;
      } else {
        setState((prev) => ({
          ...prev,
          checking: false,
          updateAvailable: false,
          updateInfo: null,
        }));
        return null;
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        checking: false,
        error: error instanceof Error ? error.message : "Failed to check for updates",
      }));
      return null;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = await checkForUpdates();

    if (!update) return;

    setState((prev) => ({ ...prev, downloading: true, downloadProgress: 0 }));

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            setState((prev) => ({ ...prev, downloadProgress: 0 }));
            break;
          case "Progress":
            if (event.data.chunkLength) {
              setState((prev) => ({
                ...prev,
                downloadProgress: prev.downloadProgress + event.data.chunkLength,
              }));
            }
            break;
          case "Finished":
            setState((prev) => ({ ...prev, downloadProgress: 100 }));
            break;
        }
      });

      await relaunch();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : "Failed to install update",
      }));
    }
  }, [checkForUpdates]);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    // Only check for updates in production builds
    // The updater doesn't work properly in development mode
    if (import.meta.env.PROD) {
      checkForUpdates();
    }
  }, [checkForUpdates]);

  return {
    ...state,
    checkForUpdates,
    downloadAndInstall,
    clearError,
  };
}