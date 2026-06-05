importScripts("./js/core/app_version.js");

const CACHE_NAME = `term-pwa-${(self.TermPWA && self.TermPWA.APP_VERSION) || "dev"}`;

const APP_ASSETS = [
    "./",
    "./index.html",
    "./css/styles.css",
    "./css/styles_wf88.css",
    "./js/core/app_version.js",
    "./js/utils/file_picker.js",
    "./js/utils/terminal_theme.js",
    "./js/utils/terminal_log_store.js",
    "./js/core/device_profile.js",
    "./js/core/device_detector.js",
    "./js/core/debug_logger.js",
    "./js/utils/hex_utils.js",
    "./js/core/main.js",
    "./js/serial/serial_transport.js",
    "./js/serial/serial_port_store.js",
    "./js/serial/serial_port.js",
    "./js/serial/serial_event_bus.js",
    "./js/serial/serial_session.js",
    "./js/features/quick_send.js",
    "./js/features/terminal_page.js",
    "./js/netview/lr71_parser.js",
    "./js/netview/lr71_renderer.js",
    "./js/netview/lr71_page.js",
    "./js/netview/wf88_page.js",
    "./js/utils/ymodem_crc.js",
    "./js/features/firmware_update.js",
    "./js/config/config_schema.js",
    "./js/config/config_parser.js",
    "./js/features/config_page.js",
    "./manifest.json",
    "./icons/icon.svg",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_ASSETS))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cached => cached || fetch(event.request))
    );
});

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});
