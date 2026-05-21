(function () {
const STORAGE_KEY = "lr71QuickSendList";
const COLLAPSED_KEY = "lr71QuickSendCollapsed";

const DEFAULT_GROUPS = [
    {
        name: "LR71 AT Commands",
        list: [
            { name: "Read Config", content: "at+ab config", hex: false },
        ],
    },
];

function createQuickSendPanel({
    serialManager,
    appendNewlineToggle,
    writeTerminal = () => {},
    debugLog = () => {},
    rootSelector = "#quickSendPanel",
} = {}) {
    const root = document.querySelector(rootSelector);
    let groups = loadGroups();
    let currentIndex = 0;
    let connected = false;
    let collapsed = localStorage.getItem(COLLAPSED_KEY) === "true";
    let draggingItemIndex = null;

    if (!root) {
        return emptyQuickSendPanel();
    }

    render();
    selectGroup(0);
    setConnected(false);

    function render() {
        root.innerHTML = `
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
    }

    function renderGroups() {
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
            send.title = "Double-click to rename";
            send.textContent = item.name || "Send";
            let clickTimer = null;
            send.addEventListener("click", event => {
                if (event.detail > 1) return;
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    sendItem(item).catch(error => {
                        setStatus(`Send failed: ${error.message}`);
                        debugLog("quick send failed", error);
                    });
                }, 180);
            });
            send.addEventListener("dblclick", () => {
                clearTimeout(clickTimer);
                clickTimer = null;
                renameItem(index);
            });

            const hex = document.createElement("input");
            hex.className = "quick-send-hex";
            hex.type = "checkbox";
            hex.title = "HEX";
            hex.checked = Boolean(item.hex);
            hex.addEventListener("change", () => {
                item.hex = hex.checked;
                saveGroups();
            });

            row.append(drag, remove, content, send, hex);
            list.appendChild(row);
        });
        updateSendButtons();
    }

    function selectGroup(index) {
        currentIndex = Number.isInteger(index) && groups[index] ? index : 0;
        renderGroups();
        renderItems();
    }

    function addGroup() {
        const name = prompt("Enter group name", "New Group");
        if (!name) return;

        groups.push({ name, list: [] });
        currentIndex = groups.length - 1;
        saveGroups();
        renderGroups();
        renderItems();
    }

    function renameGroup() {
        const group = groups[currentIndex];
        if (!group) return;

        const name = prompt("Enter new group name", group.name);
        if (!name) return;

        group.name = name;
        saveGroups();
        renderGroups();
    }

    function removeGroup() {
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
        const group = groups[currentIndex];
        if (!group) return;

        group.list.push({ name: "Send", content: "", hex: false });
        saveGroups();
        renderItems();
    }

    function removeItem(index) {
        const group = groups[currentIndex];
        if (!group) return;

        group.list.splice(index, 1);
        saveGroups();
        renderItems();
    }

    function reorderItem(fromIndex, toIndex) {
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
        const item = groups[currentIndex] && groups[currentIndex].list[index];
        if (!item) return;

        const name = prompt("Enter display name", item.name || "Send");
        if (!name) return;

        item.name = name;
        saveGroups();
        renderItems();
    }

    async function sendItem(item) {
        if (!serialManager || !serialManager.isConnected()) {
            throw new Error("serial is not connected");
        }
        if (!item.content) {
            throw new Error("send content is empty");
        }

        if (item.hex) {
            await serialManager.writeBytes(hexToBytes(item.content));
            writeTerminal(`> [HEX] ${item.content}\n`);
        } else {
            const payload = appendNewlineToggle && appendNewlineToggle.checked ? `${item.content}\r\n` : item.content;
            await serialManager.writeText(payload);
            writeTerminal(`> ${item.content}\n`);
        }
        setStatus(`Sent: ${item.name || item.content}`);
    }

    function exportGroup() {
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
        connected = Boolean(value);
        updateSendButtons();
        setStatus(connected ? "Ready." : "Connect serial before quick send.");
    }

    function updateSendButtons() {
        root.querySelectorAll(".quick-send-button").forEach(button => {
            button.disabled = !connected;
        });
    }

    function setStatus(message) {
        const el = root.querySelector("#quickSendStatus");
        if (el) el.textContent = message;
    }

    function toggleCollapsed() {
        collapsed = !collapsed;
        localStorage.setItem(COLLAPSED_KEY, collapsed ? "true" : "false");
        applyCollapsed();
    }

    function applyCollapsed() {
        root.classList.toggle("collapsed", collapsed);
        const toggle = root.querySelector("#quickSendToggle");
        if (toggle) {
            toggle.textContent = collapsed ? "<" : ">";
            toggle.title = collapsed ? "Show Quick Send" : "Hide Quick Send";
        }
    }

    function saveGroups() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    }

    return {
        handleConnected() {
            setConnected(true);
        },
        handleDisconnected() {
            setConnected(false);
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

function hexToBytes(hex) {
    const value = String(hex).replace(/\s+/g, "");
    if (!value || (value.length % 2) !== 0 || /[^0-9a-fA-F]/.test(value)) {
        throw new Error(`invalid HEX: ${hex}`);
    }

    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function sanitizeFilename(name) {
    return String(name || "quick-send").replace(/[\\/:*?"<>|]+/g, "_");
}

function emptyQuickSendPanel() {
    return {
        handleConnected() {},
        handleDisconnected() {},
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createQuickSendPanel = createQuickSendPanel;
})();
