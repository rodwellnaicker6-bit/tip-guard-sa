/**
 * Push notification service worker — STUB (disabled).
 * Uncomment registration in main.tsx when VITE_ENABLE_PUSH and VAPID keys exist.
 *
 * self.addEventListener("push", (event) => {
 *   const data = event.data?.json() ?? {};
 *   event.waitUntil(
 *     self.registration.showNotification(data.title ?? "TipGuard", {
 *       body: data.body ?? "",
 *       icon: "/favicon.svg",
 *       data: { url: data.url ?? "/" },
 *     }),
 *   );
 * });
 *
 * self.addEventListener("notificationclick", (event) => {
 *   event.notification.close();
 *   const url = event.notification.data?.url ?? "/";
 *   event.waitUntil(clients.openWindow(url));
 * });
 */
