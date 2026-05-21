const CACHE_NAME = "lr71-web-v1";

const APP_ASSETS = [
    "./",
    "./index.html",
    "./styles.css",
    "./debug_logger.js",
    "./main.js",
    "./serial_port.js",
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
            .then(() => self.skipWaiting())
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
