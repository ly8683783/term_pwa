importScripts("./js/core/app_version.js");
try {
    importScripts("./docs/catalog.js");
} catch (error) {
    // A failed update must not replace the working worker with incomplete assets.
    throw new Error("Service Worker: unable to load docs/catalog.js; update cancelled.", { cause: error });
}

const APP_VERSION = (self.TermPWA && self.TermPWA.APP_VERSION) || "dev";
const CORE_CACHE_NAME = `term-pwa-${APP_VERSION}`;
const DOCS_CACHE_NAME = `term-pwa-docs-${APP_VERSION}`;
const APP_BASE_URL = new URL("./", self.location.href);
const CATALOG_PATHNAME = new URL("./docs/catalog.js", APP_BASE_URL).pathname;
const DOCUMENTATION_RUNTIME_PREFIXES = [
    "./docs/",
    "./docs-img/",
    "./js/vendor/",
].map(path => new URL(path, APP_BASE_URL).href);

function validateDocumentationGroups(groups) {
    const invalid = message => {
        throw new Error(`Invalid docs/catalog.js: ${message}; Service Worker update cancelled.`);
    };
    if (!Array.isArray(groups)) {
        invalid("DOCUMENTATION_GROUPS must be an array");
    }
    const validatePath = (path, field) => {
        if (typeof path !== "string" || !path.trim()) {
            invalid(`${field} must be a non-empty string`);
        }
    };
    const validateDocument = (doc, field) => {
        validatePath(doc?.path, `${field}.path`);
        if (doc.assets !== undefined && !Array.isArray(doc.assets)) {
            invalid(`${field}.assets must be an array when provided`);
        }
        (doc.assets || []).forEach((path, index) => validatePath(path, `${field}.assets[${index}]`));
    };
    if (self.TermPWA?.DOCUMENTATION_HELP !== undefined) {
        validateDocument(self.TermPWA.DOCUMENTATION_HELP, "DOCUMENTATION_HELP");
    }
    groups.forEach((group, groupIndex) => {
        const field = `DOCUMENTATION_GROUPS[${groupIndex}].documents`;
        if (!group || !Array.isArray(group.documents)) {
            invalid(`${field} must be an array`);
        }
        group.documents.forEach((doc, docIndex) => {
            validateDocument(doc, `${field}[${docIndex}]`);
        });
    });
}

validateDocumentationGroups(self.TermPWA?.DOCUMENTATION_GROUPS);

const APP_ASSETS = [
    "./docs/catalog.js",
    "./css/documentation.css",
    "./js/features/documentation_navigation.js",
    "./js/features/documentation_page.js",
    "./js/features/system_monitor_page.js",

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
    "./js/utils/horizontal_resize.js",
    "./js/core/page_runtime.js",
    "./js/core/page_definitions.js",
    "./js/core/ui_state.js",
    "./js/core/main.js",
    "./js/serial/serial_transport.js",
    "./js/serial/serial_port_store.js",
    "./js/serial/serial_port.js",
    "./js/serial/serial_event_bus.js",
    "./js/serial/serial_session.js",
    "./js/features/quick_send.js",
    "./js/features/uart_console.js",
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
        caches.open(CORE_CACHE_NAME)
            .then(cache => cache.addAll(APP_ASSETS))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CORE_CACHE_NAME && key !== DOCS_CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

function isDocumentationRuntimeRequest(request) {
    if (request.method !== "GET") return false;
    const url = new URL(request.url);
    return url.origin === APP_BASE_URL.origin
        && url.pathname !== CATALOG_PATHNAME
        && DOCUMENTATION_RUNTIME_PREFIXES.some(prefix => url.href.startsWith(prefix));
}

async function cacheDocumentationRequest(request) {
    const cache = await caches.open(DOCS_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    const responseUrl = new URL(response.url || request.url);
    if (response.ok && responseUrl.origin === APP_BASE_URL.origin) {
        try {
            await cache.put(request, response.clone());
        } catch (error) {
            console.error("Unable to cache documentation resource:", error);
        }
    }
    return response;
}

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    if (isDocumentationRuntimeRequest(event.request)) {
        event.respondWith(cacheDocumentationRequest(event.request));
        return;
    }

    event.respondWith(caches.open(CORE_CACHE_NAME)
        .then(cache => cache.match(event.request))
        .then(cached => cached || fetch(event.request)));
});

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});
