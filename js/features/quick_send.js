(function () {
const appModules = window.TermPWA || {};
const STORAGE_KEY = "lr71QuickSendList";
const INDEX_STORAGE_KEY = "lr71QuickSendIndex";
const QUICK_SEND_MIN_WIDTH = 340;
const QUICK_SEND_MAX_WIDTH = 640;
const QUICK_SEND_WIDTH_RATIO = 0.382;
const QUICK_SEND_MOBILE_QUERY = "(max-width: 820px)";
const QUICK_SEND_RENAME_HOLD_MS = 700;

const DEFAULT_GROUPS = [
    {
        name: "LR71 AT Commands",
        list: [
            { name: "Read Config", content: "at+ab config", hex: false },
        ],
    },
];

function createQuickSendPanel({
    serialSession,
    appendNewlineToggle,
    writeTerminal = () => {},
    writeTerminalTxEcho = (text, { hex = false } = {}) => writeTerminal(`> ${text}\n`),
    debugLog = () => {},
    rootSelector = "#quickSendPanel",
} = {}) {
    const root = document.querySelector(rootSelector);
    let groups = loadGroups();
    let currentIndex = parseInt(localStorage.getItem(INDEX_STORAGE_KEY)) || 0;
    let connected = false;
    let collapsed = false;
    let draggingItemIndex = null;
    // 0 means "use the default golden-ratio width" for the current terminal container.
    let panelWidth = 0;
    let resizeState = null;
    let disposed = false;
    let renameHoldTimer = null;
    let renameHoldButton = null;
    let renameHoldTriggered = false;

    if (!root) {
        return emptyQuickSendPanel();
    }

    render();
    applyPanelWidth();
    selectGroup(currentIndex);
    setConnected(false);
    window.addEventListener("resize", handleWindowResize);

    function render() {
        root.innerHTML = `
            <div id="quickSendResizer" class="quick-send-resizer" title="Resize Quick Send" aria-hidden="true"></div>
            <div class="quick-send-header">
                <h3 class="quick-send-title">Quick Send</h3>
                <button id="quickSendToggle" class="quick-send-toggle" type="button" title="Hide/Show Quick Send"></button>
            </div>
            <div class="quick-send-body">
            <div class="quick-send-toolbar">
                <select id="quickSendGroup" aria-label="Quick Send group"></select>
                <button id="quickSendAddGroup" type="button">Add</button>
                <button id="quickSendRenameGroup" type="button">Rename</button>
                <button id="quickSendRemoveGroup" type="button">Delete</button>
            </div>
            <div class="quick-send-actions">
                <button id="quickSendAddItem" type="button">Add Item</button>
                <button id="quickSendImportBtn" type="button">Import</button>
                <button id="quickSendExportBtn" type="button">Export</button>
                <button id="quickSendDefaultsBtn" type="button">Defaults</button>
                <input id="quickSendImportFile" class="quick-send-file" type="file" accept="application/json,.json">
            </div>
            <div id="quickSendStatus" class="quick-send-status">Ready.</div>
            <div id="quickSendList" class="quick-send-list"></div>
            </div>
        `;

        root.querySelector("#quickSendResizer").addEventListener("pointerdown", startResize);
        root.querySelector("#quickSendToggle").addEventListener("click", toggleCollapsed);
        root.querySelector("#quickSendGroup").addEventListener("change", event => {
            selectGroup(Number(event.target.value));
        });
        root.querySelector("#quickSendAddGroup").addEventListener("click", addGroup);
        root.querySelector("#quickSendRenameGroup").addEventListener("click", renameGroup);
        root.querySelector("#quickSendRemoveGroup").addEventListener("click", removeGroup);
        root.querySelector("#quickSendAddItem").addEventListener("click", addItem);
        root.querySelector("#quickSendImportBtn").addEventListener("click", () => root.querySelector("#quickSendImportFile").click());
        root.querySelector("#quickSendImportFile").addEventListener("change", event => {
            importGroup(event).catch(error => {
                setStatus(`Import failed: ${error.message}`);
                debugLog("quick send import failed", error);
            });
        });
        root.querySelector("#quickSendExportBtn").addEventListener("click", exportGroup);
        root.querySelector("#quickSendDefaultsBtn").addEventListener("click", restoreDefaults);

        renderGroups();
        applyCollapsed();
        applyPanelWidth();
    }

    function startResize(event) {
        if (disposed) {
            return;
        }
        if (event.button !== 0 || !canResizePanel()) {
            return;
        }

        event.preventDefault();
        resizeState = {
            startX: event.clientX,
            startWidth: root.getBoundingClientRect().width,
        };
        document.body.classList.add("quick-send-resizing");
        document.addEventListener("pointermove", resizePanel);
        document.addEventListener("pointerup", stopResize);
        document.addEventListener("pointercancel", stopResize);
    }

    function resizePanel(event) {
        if (disposed || !resizeState) return;

        const nextWidth = resizeState.startWidth + (resizeState.startX - event.clientX);
        setPanelWidth(nextWidth);
    }

    function stopResize() {
        if (!resizeState) return;

        resizeState = null;
        document.body.classList.remove("quick-send-resizing");
        document.removeEventListener("pointermove", resizePanel);
        document.removeEventListener("pointerup", stopResize);
        document.removeEventListener("pointercancel", stopResize);
    }

    function handleWindowResize() {
        if (disposed) {
            return;
        }
        applyPanelWidth();
    }

    function canResizePanel() {
        return !collapsed &&
               !isMobileLayout() &&
               getContainerWidth() >= QUICK_SEND_MIN_WIDTH;
    }

    function applyPanelWidth() {
        if (collapsed || isMobileLayout()) {
            return;
        }

        const width = panelWidth || calcDefaultPanelWidth();
        root.style.setProperty("--quick-send-width", `${clampPanelWidth(width)}px`);
    }

    function setPanelWidth(width) {
        panelWidth = clampPanelWidth(width);
        root.style.setProperty("--quick-send-width", `${panelWidth}px`);
    }

    function clampPanelWidth(width) {
        const containerWidth = getContainerWidth();
        const upper = Math.min(QUICK_SEND_MAX_WIDTH, Math.max(QUICK_SEND_MIN_WIDTH, containerWidth || QUICK_SEND_MAX_WIDTH));
        const value = Math.round(Number(width) || calcDefaultPanelWidth());

        return Math.min(upper, Math.max(QUICK_SEND_MIN_WIDTH, value));
    }

    function calcDefaultPanelWidth() {
        const containerWidth = getContainerWidth();
        if (containerWidth <= 0) {
            // The terminal tab may be hidden during startup; handleShown() recalculates
            // the golden-ratio width after the container becomes measurable.
            return QUICK_SEND_MAX_WIDTH;
        }

        return Math.round(containerWidth * QUICK_SEND_WIDTH_RATIO);
    }

    function getContainerWidth() {
        const container = root.closest(".terminal-container");
        return container ? container.clientWidth : 0;
    }

    function isMobileLayout() {
        return window.matchMedia(QUICK_SEND_MOBILE_QUERY).matches;
    }

    function renderGroups() {
        if (disposed) {
            return;
        }
        const select = root.querySelector("#quickSendGroup");
        select.innerHTML = "";
        groups.forEach((group, index) => {
            select.appendChild(new Option(group.name, String(index)));
        });
        if (currentIndex >= groups.length) {
            currentIndex = 0;
        }
        select.value = String(currentIndex);
    }

    function renderItems() {
        if (disposed) {
            return;
        }
        clearRenameHoldState();
        const list = root.querySelector("#quickSendList");
        const group = groups[currentIndex];
        list.innerHTML = "";

        if (!group || group.list.length === 0) {
            list.innerHTML = `<div class="quick-send-empty">No quick commands.</div>`;
            return;
        }

        group.list.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "quick-send-row";
            row.dataset.index = String(index);

            const drag = document.createElement("button");
            drag.className = "quick-send-drag";
            drag.type = "button";
            drag.title = "Drag to reorder";
            drag.textContent = "☰";
            drag.draggable = true;
            drag.addEventListener("dragstart", event => {
                draggingItemIndex = index;
                row.classList.add("dragging");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
            });
            drag.addEventListener("dragend", () => {
                draggingItemIndex = null;
                root.querySelectorAll(".quick-send-row").forEach(itemRow => {
                    itemRow.classList.remove("dragging", "drag-over");
                });
            });

            row.addEventListener("dragover", event => {
                if (draggingItemIndex === null) return;
                event.preventDefault();
                row.classList.add("drag-over");
                event.dataTransfer.dropEffect = "move";
            });
            row.addEventListener("dragleave", () => {
                row.classList.remove("drag-over");
            });
            row.addEventListener("drop", event => {
                event.preventDefault();
                row.classList.remove("drag-over");
                reorderItem(draggingItemIndex, index);
            });

            const remove = document.createElement("button");
            remove.className = "quick-send-remove";
            remove.type = "button";
            remove.title = "Remove item";
            remove.textContent = "x";
            remove.addEventListener("click", () => removeItem(index));

            const content = document.createElement("input");
            content.type = "text";
            content.value = item.content || "";
            content.placeholder = "Send content";
            content.addEventListener("input", () => {
                item.content = content.value;
                saveGroups();
            });

            const send = document.createElement("button");
            send.className = "quick-send-button";
            send.type = "button";
            send.title = "Click to send. Hold to rename.";
            send.textContent = item.name || "Send";
            send.addEventListener("contextmenu", event => {
                event.preventDefault();
            });
            send.addEventListener("pointerdown", event => {
                if (disposed || event.button !== 0) {
                    return;
                }
                clearRenameHoldState();
                renameHoldButton = send;
                renameHoldTriggered = false;
                send.classList.add("quick-send-button-armed");
                renameHoldTimer = setTimeout(() => {
                    renameHoldTimer = null;
                    renameHoldTriggered = true;
                    if (renameHoldButton) {
                        renameHoldButton.classList.remove("quick-send-button-armed");
                        renameHoldButton = null;
                    }
                    renameItem(index);
                }, QUICK_SEND_RENAME_HOLD_MS);
            });
            send.addEventListener("pointerup", () => {
                clearRenameHoldState({ keepTriggered: true });
            });
            send.addEventListener("pointerleave", () => {
                clearRenameHoldState({ keepTriggered: true });
            });
            send.addEventListener("pointercancel", () => {
                clearRenameHoldState({ keepTriggered: true });
            });
            send.addEventListener("click", event => {
                if (renameHoldTriggered) {
                    renameHoldTriggered = false;
                    event.preventDefault();
                    return;
                }
                sendItem(item).catch(error => {
                    setStatus(`Send failed: ${error.message}`);
                    debugLog("quick send failed", error);
                });
            });

            const hex = document.createElement("input");
            hex.className = "quick-send-hex";
            hex.type = "checkbox";
            hex.title = "HEX";
            hex.checked = Boolean(item.hex);
            hex.addEventListener("change", () => {
                const enabled = hex.checked;
                try {
                    item.content = enabled ? appModules.textToHexText(item.content) : appModules.hexTextToText(item.content);
                    item.hex = enabled;
                    content.value = item.content;
                    saveGroups();
                } catch (error) {
                    hex.checked = !enabled;
                    setStatus(`HEX convert failed: ${error.message}`);
                    debugLog("quick send hex convert failed", error);
                }
            });

            row.append(drag, remove, content, send, hex);
            list.appendChild(row);
        });
        updateSendButtons();
    }

    function clearRenameHoldState({ keepTriggered = false } = {}) {
        if (renameHoldTimer) {
            clearTimeout(renameHoldTimer);
            renameHoldTimer = null;
        }
        if (renameHoldButton) {
            renameHoldButton.classList.remove("quick-send-button-armed");
            renameHoldButton = null;
        }
        if (!keepTriggered) {
            renameHoldTriggered = false;
        }
    }

    function selectGroup(index) {
        if (disposed) {
            return;
        }
        currentIndex = Number.isInteger(index) && groups[index] ? index : 0;
        localStorage.setItem(INDEX_STORAGE_KEY, currentIndex);
        renderGroups();
        renderItems();
    }

    function addGroup() {
        if (disposed) {
            return;
        }
        const name = prompt("Enter group name", "New Group");
        if (!name) return;

        groups.push({ name, list: [] });
        currentIndex = groups.length - 1;
        saveGroups();
        renderGroups();
        renderItems();
    }

    function renameGroup() {
        if (disposed) {
            return;
        }
        const group = groups[currentIndex];
        if (!group) return;

        const name = prompt("Enter new group name", group.name);
        if (!name) return;

        group.name = name;
        saveGroups();
        renderGroups();
    }

    function removeGroup() {
        if (disposed) {
            return;
        }
        if (groups.length <= 1) {
            setStatus("At least one group is required.");
            return;
        }
        if (!confirm("Delete this group?")) return;

        groups.splice(currentIndex, 1);
        currentIndex = Math.max(0, currentIndex - 1);
        saveGroups();
        renderGroups();
        renderItems();
    }

    function addItem() {
        if (disposed) {
            return;
        }
        const group = groups[currentIndex];
        if (!group) return;

        group.list.push({ name: "Send", content: "", hex: false });
        saveGroups();
        renderItems();
    }

    function removeItem(index) {
        if (disposed) {
            return;
        }
        const group = groups[currentIndex];
        if (!group) return;

        group.list.splice(index, 1);
        saveGroups();
        renderItems();
    }

    function reorderItem(fromIndex, toIndex) {
        if (disposed) {
            return;
        }
        const group = groups[currentIndex];
        if (!group ||
            fromIndex === null ||
            fromIndex === toIndex ||
            !group.list[fromIndex] ||
            !group.list[toIndex]) {
            return;
        }

        const [item] = group.list.splice(fromIndex, 1);
        group.list.splice(toIndex, 0, item);
        saveGroups();
        renderItems();
    }

    function restoreDefaults() {
        if (disposed) {
            return;
        }
        if (!confirm("Restore default Quick Send commands? This will delete all commands and groups you added. This action cannot be undone.")) {
            return;
        }

        groups = cloneDefaultGroups();
        currentIndex = 0;
        saveGroups();
        renderGroups();
        renderItems();
        setStatus("Default Quick Send commands restored.");
    }

    function renameItem(index) {
        if (disposed) {
            return;
        }
        clearRenameHoldState({ keepTriggered: true });
        const item = groups[currentIndex] && groups[currentIndex].list[index];
        if (!item) return;

        const name = prompt("Enter display name", item.name || "Send");
        if (!name) return;

        item.name = name;
        saveGroups();
        renderItems();
    }

    async function sendItem(item) {
        if (disposed) {
            return;
        }
        if (!serialSession || !serialSession.canWrite("quick-send")) {
            throw new Error(serialSession ? (serialSession.getStatusText() || "serial is not connected") : "serial is not connected");
        }
        if (!item.content) {
            throw new Error("send content is empty");
        }

        if (item.hex) {
            await serialSession.writeBytes("quick-send", appModules.hexToBytes(item.content));
            writeTerminalTxEcho(item.content, { hex: true });
        } else {
            const payload = appendNewlineToggle && appendNewlineToggle.checked ? `${item.content}\r\n` : item.content;
            await serialSession.writeText("quick-send", payload);
            writeTerminalTxEcho(item.content);
        }
        setStatus(`Sent: ${item.name || item.content}`);
    }

    function exportGroup() {
        if (disposed) {
            return;
        }
        const group = groups[currentIndex];
        if (!group) return;

        const blob = new Blob([JSON.stringify(group.list, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${sanitizeFilename(group.name)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function importGroup(event) {
        if (disposed) {
            return;
        }
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        const data = JSON.parse(await file.text());
        if (!Array.isArray(data)) {
            throw new Error("JSON must be an array");
        }

        const imported = data.map(normalizeImportedItem).filter(Boolean);
        if (imported.length === 0) {
            throw new Error("no valid quick send items");
        }

        groups[currentIndex].list.push(...imported);
        saveGroups();
        renderItems();
        setStatus(`Imported ${imported.length} item(s).`);
    }

    function setConnected(value) {
        if (disposed) {
            return;
        }
        connected = Boolean(value);
        updateSendButtons();
        setStatus(connected ? "Ready." : "Connect serial before quick send.");
    }

    function updateSendButtons() {
        if (disposed) {
            return;
        }
        const canSend = connected && (!serialSession || serialSession.canWrite("quick-send"));
        root.querySelectorAll(".quick-send-button").forEach(button => {
            button.disabled = !canSend;
        });
    }

    function setStatus(message) {
        if (disposed) {
            return;
        }
        const el = root.querySelector("#quickSendStatus");
        if (el) el.textContent = message;
    }

    function toggleCollapsed() {
        if (disposed) {
            return;
        }
        collapsed = !collapsed;
        applyCollapsed();
    }

    function applyCollapsed() {
        if (disposed) {
            return;
        }
        root.classList.toggle("collapsed", collapsed);
        const toggle = root.querySelector("#quickSendToggle");
        if (toggle) {
            toggle.textContent = collapsed ? "<" : ">";
            toggle.title = collapsed ? "Show Quick Send" : "Hide Quick Send";
        }
        applyPanelWidth();
    }

    function saveGroups() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
        localStorage.setItem(INDEX_STORAGE_KEY, currentIndex);
    }

    return {
        handleConnected() {
            if (disposed) {
                return;
            }
            setConnected(true);
        },
        handleDisconnected() {
            if (disposed) {
                return;
            }
            setConnected(false);
        },
        handleSessionChanged() {
            if (disposed) {
                return;
            }
            updateSendButtons();
            if (connected && serialSession && serialSession.isBusy() && !serialSession.canWrite("quick-send")) {
                setStatus(serialSession.getStatusText());
            } else if (connected) {
                setStatus("Ready.");
            }
        },
        handleShown() {
            if (disposed) {
                return;
            }
            applyPanelWidth();
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            clearRenameHoldState();
            stopResize();
            window.removeEventListener("resize", handleWindowResize);
            root.replaceChildren();
        },
    };
}

function loadGroups() {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) {
        return cloneDefaultGroups();
    }

    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return cloneDefaultGroups();
        }
        return parsed.map(group => ({
            name: String(group.name || "Group"),
            list: Array.isArray(group.list) ? group.list.map(normalizeImportedItem).filter(Boolean) : [],
        }));
    } catch (error) {
        return cloneDefaultGroups();
    }
}

function cloneDefaultGroups() {
    return JSON.parse(JSON.stringify(DEFAULT_GROUPS));
}

function normalizeImportedItem(item) {
    if (!item || typeof item !== "object") {
        return null;
    }
    const content = String(item.content || "");
    if (!content) {
        return null;
    }
    return {
        name: String(item.name || "Send"),
        content,
        hex: Boolean(item.hex),
    };
}

function sanitizeFilename(name) {
    return String(name || "quick-send").replace(/[\\/:*?"<>|]+/g, "_");
}

function emptyQuickSendPanel() {
    return {
        handleConnected() {},
        handleDisconnected() {},
        handleSessionChanged() {},
        handleShown() {},
        dispose() {},
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createQuickSendPanel = createQuickSendPanel;
})();
