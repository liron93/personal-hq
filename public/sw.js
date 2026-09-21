// Personal HQ service worker: installability only.
// Do NOT cache navigations, Supabase responses, uploads, or private documents.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
