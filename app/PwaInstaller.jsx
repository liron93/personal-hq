"use client";

import { useEffect } from "react";

/**
 * Registers a deliberately shell-only service worker.
 * Personal HQ never caches authenticated data, API responses or user documents.
 */
export default function PwaInstaller() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation remains optional; the website must work normally without it.
      });
    }
  }, []);

  return null;
}
