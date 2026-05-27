(function () {
const DB_NAME = "lr71-terminal-log-v1";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const FALLBACK_MAX_ENTRIES = 100000;
const FALLBACK_TRIM_CHUNK = 1000;

function createTerminalLogStore({ debugLog = () => {} } = {}) {
    let dbPromise = null;
    let fallbackEntries = [];
    let fallbackNextId = 1;
    let useFallback = !window.indexedDB;
    let writeChain = Promise.resolve();

    function openDb() {
        if (useFallback) {
            return Promise.resolve(null);
        }
        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
            request.onblocked = () => debugLog("terminal log IndexedDB upgrade blocked");
        }).catch(error => {
            useFallback = true;
            debugLog("terminal log IndexedDB unavailable, using memory fallback", error);
            return null;
        });

        return dbPromise;
    }

    function append(entry) {
        if (!entry || !entry.text) {
            return Promise.resolve();
        }

        const record = {
            ts: entry.ts || Date.now(),
            dir: entry.dir || "system",
            mode: entry.mode || "text",
            text: String(entry.text),
        };

        writeChain = writeChain
            .catch(() => {})
            .then(() => appendRecord(record))
            .catch(error => debugLog("terminal log append failed", error));

        return writeChain;
    }

    async function appendRecord(record) {
        const db = await openDb();
        if (!db) {
            fallbackEntries.push({ id: fallbackNextId++, ...record });
            trimFallbackEntries();
            return;
        }

        await runStoreRequest(db, "readwrite", store => store.add(record));
    }

    async function clear() {
        await writeChain.catch(() => {});

        const db = await openDb();
        if (!db) {
            fallbackEntries = [];
            fallbackNextId = 1;
            return;
        }

        await runStoreRequest(db, "readwrite", store => store.clear());
    }

    function trimFallbackEntries() {
        if (fallbackEntries.length <= FALLBACK_MAX_ENTRIES) {
            return;
        }

        const overflow = fallbackEntries.length - FALLBACK_MAX_ENTRIES;
        fallbackEntries.splice(0, Math.max(overflow, FALLBACK_TRIM_CHUNK));
    }

    async function exportText() {
        await writeChain.catch(() => {});

        const entries = useFallback ? fallbackEntries.slice() : await readAllEntries();
        return entries.map(formatEntry).join("");
    }

    async function getStats() {
        await writeChain.catch(() => {});

        if (useFallback) {
            return { count: fallbackEntries.length, persistent: false };
        }

        const db = await openDb();
        if (!db) {
            return { count: fallbackEntries.length, persistent: false };
        }

        const count = await runStoreRequest(db, "readonly", store => store.count());
        return { count, persistent: true };
    }

    async function readAllEntries() {
        const db = await openDb();
        if (!db) {
            return fallbackEntries.slice();
        }

        return await runStoreRequest(db, "readonly", store => store.getAll());
    }

    function runStoreRequest(db, mode, makeRequest) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);
            let request;

            try {
                request = makeRequest(store);
            } catch (error) {
                reject(error);
                return;
            }

            if (request && typeof request.onsuccess !== "undefined") {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || tx.error || new Error("IndexedDB request failed"));
            }

            tx.oncomplete = () => {
                if (!request || typeof request.onsuccess === "undefined") {
                    resolve();
                }
            };
            tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
            tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
        });
    }

    function formatEntry(entry) {
        const timestamp = formatTimestampMs(new Date(entry.ts || Date.now()));
        const dir = String(entry.dir || "system").toUpperCase();
        const mode = String(entry.mode || "text").toUpperCase();
        const body = String(entry.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = body.endsWith("\n") ? body.slice(0, -1).split("\n") : body.split("\n");

        return lines
            .map(line => `[${timestamp}] ${dir} ${mode} ${line}\n`)
            .join("");
    }

    function formatTimestampMs(date) {
        const pad2 = value => String(value).padStart(2, "0");
        const pad3 = value => String(value).padStart(3, "0");
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
    }

    openDb();

    return {
        append,
        clear,
        exportText,
        getStats,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createTerminalLogStore = createTerminalLogStore;
})();
