importScripts("./app_version.js");

const CACHE_NAME = self.TermPWA.APP_VERSION;

const APP_ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./app_version.js",
    "./file_picker.js",
    "./debug_logger.js",
    "./hex_utils.js",
    "./main.js",
    "./serial_transport.js",
    "./serial_port_store.js",
    "./serial_port.js",
    "./serial_event_bus.js",
    "./serial_session.js",
    "./quick_send.js",
    "./netview_parser.js",
    "./topology_view.js",
    "./netview_page.js",
    "./ymodem_crc.js",
    "./firmware_update.js",
    "./config_page.js",
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
