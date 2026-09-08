// VibeFlow service worker — web push only. No offline caching (the app is
// online-first). Android Chrome delivers these even when the tab is closed;
// iOS Safari only when the PWA is installed to the home screen (16.4+).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "VibeFlow", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "VibeFlow";
  const options = {
    body: data.body || "",
    icon: "/brand/vibeflow-maskable-192.png",
    badge: "/brand/vibeflow-maskable-192.png",
    tag: data.tag || undefined,
    renotify: false,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
