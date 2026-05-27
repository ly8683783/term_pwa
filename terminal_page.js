(function () {
const appModules = window.TermPWA || {};

const COMMAND_HISTORY_KEY = "lr71TerminalCommandHistory";
const COMMAND_HISTORY_MAX = 50;
const TERMINAL_THEME_KEY = "lr71TerminalTheme";
const TERMINAL_DEFAULT_THEME = "bright-dark";
const TERMINAL_COPY_WARN_LENGTH = 2000000;
const TERMINAL_MAX_NODES = 4000;
const RX_IDLE_DEFAULT_MS = 10;
const COPY_BUTTON_LABEL = "Copy UART output";
const COPY_BUTTON_ICONS = {
    idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7A2 2 0 0 1 10 5H19A2 2 0 0 1 21 7V16A2 2 0 0 1 19 18H17V20A2 2 0 0 1 15 22H6A2 2 0 0 1 4 20V11A2 2 0 0 1 6 9H8V7ZM10 7V16H19V7H10ZM6 11V20H15V18H10A2 2 0 0 1 8 16V11H6Z"></path></svg>',
    success: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 8.75 6.5 11.5 12.25 4.5"></path></svg>',
    empty: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M8 4.4v4.1"></path><circle cx="8" cy="11.4" r="0.8" fill="currentColor"></circle></svg>',
    failed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"></path></svg>',
};
const EXPORT_BUTTON_LABEL = "Export UART log";
const EXPORT_BUTTON_ICONS = {
    idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L17 8H14V14H10V8H7L12 3ZM5 16H7V19H17V16H19V19A2 2 0 0 1 17 21H7A2 2 0 0 1 5 19V16Z"></path></svg>',
    success: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 8.75 6.5 11.5 12.25 4.5"></path></svg>',
    empty: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M8 4.4v4.1"></path><circle cx="8" cy="11.4" r="0.8" fill="currentColor"></circle></svg>',
    failed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"></path></svg>',
};

function createTerminalPage({
    serialSession,
    serialBus,
    debugLog = () => {},
} = {}) {
    const terminalOutput = document.getElementById("terminalOutput");
    const atCommandInput = document.getElementById("atCommandInput");
    const sendCmdBtn = document.getElementById("sendCmdBtn");
    const autoScrollToggle = document.getElementById("autoScrollToggle");
    const showLineTimeToggle = document.getElementById("showLineTimeToggle");
    const terminalThemeSelect = document.getElementById("terminalThemeSelect");
    const terminalNotice = document.getElementById("terminalNotice");
    const copyTerminalOutputBtn = document.getElementById("copyTerminalOutputBtn");
    const exportTerminalLogBtn = document.getElementById("exportTerminalLogBtn");
    const clearTerminalOutputBtn = document.getElementById("clearTerminalOutputBtn");
    const hexSendToggle = document.getElementById("hexSendToggle");
    const rxIdleInput = document.getElementById("rxIdleInput");
    const appendNewlineToggle = document.getElementById("appendNewlineToggle");
    const sendIntervalInput = document.getElementById("sendIntervalInput");
    const intervalSendBtn = document.getElementById("intervalSendBtn");

    let intervalSendTimer = null;
    let intervalSendBusy = false;
    let commandHistory = loadCommandHistory();
    let commandHistoryIndex = commandHistory.length;
    let commandHistoryDraft = "";
    let uartAtLineStart = true;
    let terminalNoticeTimer = null;
    let copySuccessTimer = null;
    let exportSuccessTimer = null;
    let hexRxBuffer = [];
    let textRxBuffer = "";
    let rxFlushTimer = null;

    const terminalLogStore = appModules.createTerminalLogStore({ debugLog });

    if (rxIdleInput) {
        rxIdleInput.value = String(RX_IDLE_DEFAULT_MS);
    }
    applyTerminalTheme(loadTerminalTheme());

    const quickSendPanel = appModules.createQuickSendPanel({
        serialSession,
        appendNewlineToggle,
        writeTerminal: writeSystem,
        writeTerminalTxEcho: writeTxEcho,
        debugLog,
    });

    if (serialBus) {
        serialBus.subscribeData("terminal", data => {
            handleSerialData(data);
        });
    }

    bindEvents();

    function bindEvents() {
        if (showLineTimeToggle) {
            showLineTimeToggle.addEventListener("change", () => {
                uartAtLineStart = true;
            });
        }
        if (terminalThemeSelect) {
            terminalThemeSelect.addEventListener("change", () => {
                applyTerminalTheme(terminalThemeSelect.value);
                localStorage.setItem(TERMINAL_THEME_KEY, terminalThemeSelect.value);
            });
        }
        if (copyTerminalOutputBtn) {
            copyTerminalOutputBtn.addEventListener("click", () => {
                copyTerminalOutput().catch(error => debugLog("UART output copy failed", error));
            });
        }
        if (exportTerminalLogBtn) {
            exportTerminalLogBtn.addEventListener("click", () => {
                exportTerminalLog().catch(error => debugLog("UART log export failed", error));
            });
        }
        if (clearTerminalOutputBtn) {
            clearTerminalOutputBtn.addEventListener("click", () => {
                clear().catch(error => debugLog("UART output clear failed", error));
            });
        }
        if (hexSendToggle) {
            hexSendToggle.addEventListener("change", handleTerminalHexToggle);
        }
        if (rxIdleInput) {
            rxIdleInput.addEventListener("change", normalizeRxIdleInput);
        }
        if (terminalOutput) {
            terminalOutput.addEventListener("click", () => terminalOutput.focus());
            terminalOutput.addEventListener("keydown", event => {
                sendTerminalKey(event);
            });
        }
        if (sendCmdBtn) {
            sendCmdBtn.addEventListener("click", () => sendCommand());
        }
        if (intervalSendBtn) {
            intervalSendBtn.addEventListener("click", startIntervalSend);
        }
        if (atCommandInput) {
            atCommandInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    sendCommand();
                } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    browseCommandHistory(-1);
                } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    browseCommandHistory(1);
                }
            });
            atCommandInput.addEventListener("input", () => {
                commandHistoryIndex = commandHistory.length;
                commandHistoryDraft = atCommandInput.value;
            });
        }
    }

    function writeTerminalText(text, className) {
        if (!terminalOutput || !text) return;

        const span = document.createElement("span");
        span.className = className;
        span.appendChild(document.createTextNode(text));
        terminalOutput.appendChild(span);
        trimTerminalNodes();
        scrollTerminalIfNeeded();
    }

    function writeTerminalFragment(fragment) {
        if (!terminalOutput) return;

        terminalOutput.appendChild(fragment);
        trimTerminalNodes();
        scrollTerminalIfNeeded();
    }

    function writeSystem(text) {
        appendTerminalLog({ dir: "system", mode: "text", text });
        writeTerminalText(text, "terminal-system");
    }

    function writeError(text) {
        appendTerminalLog({ dir: "system", mode: "text", text });
        writeTerminalText(text, "terminal-error");
    }

    function writeTxEcho(text, { hex = false } = {}) {
        appendTerminalLog({ dir: "tx", mode: hex ? "hex" : "text", text: `${text}\n` });

        const fragment = document.createDocumentFragment();
        if (showLineTimeToggle && showLineTimeToggle.checked) {
            writeTerminalTime(fragment);
        }
        const span = document.createElement("span");
        span.className = "terminal-tx";
        span.appendChild(document.createTextNode(`${text}\n`));
        fragment.appendChild(span);
        writeTerminalFragment(fragment);
    }

    function writeTerminalRxView(text) {
        writeTerminalText(text, "terminal-rx");
    }

    function appendTerminalLog(entry) {
        if (!terminalLogStore || !entry || !entry.text) {
            return;
        }

        terminalLogStore.append({
            ts: Date.now(),
            ...entry,
        });
    }

    function writeTerminalTime(fragment, date = new Date()) {
        const span = document.createElement("span");
        span.className = "terminal-time";
        span.appendChild(document.createTextNode(`[${formatTimestampMs(date)}] `));
        fragment.appendChild(span);
    }

    function loadTerminalTheme() {
        const stored = localStorage.getItem(TERMINAL_THEME_KEY);
        return isValidTerminalTheme(stored) ? stored : TERMINAL_DEFAULT_THEME;
    }

    function isValidTerminalTheme(theme) {
        return Boolean(terminalThemeSelect &&
                       theme &&
                       Array.from(terminalThemeSelect.options).some(option => option.value === theme));
    }

    function applyTerminalTheme(theme) {
        if (!terminalOutput) return;

        const nextTheme = isValidTerminalTheme(theme) ? theme : TERMINAL_DEFAULT_THEME;
        terminalOutput.dataset.theme = nextTheme;
        if (terminalThemeSelect) {
            terminalThemeSelect.value = nextTheme;
        }
    }

    function scrollTerminalIfNeeded() {
        if (!terminalOutput) return;

        if (!autoScrollToggle || autoScrollToggle.checked) {
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
    }

    function trimTerminalNodes() {
        if (!terminalOutput) return;

        while (terminalOutput.childNodes.length > TERMINAL_MAX_NODES) {
            terminalOutput.removeChild(terminalOutput.firstChild);
        }
    }

    function showTerminalNotice(message) {
        if (!terminalNotice) return;

        terminalNotice.textContent = message;
        terminalNotice.classList.add("visible");

        if (terminalNoticeTimer) {
            clearTimeout(terminalNoticeTimer);
        }

        terminalNoticeTimer = setTimeout(() => {
            terminalNotice.classList.remove("visible");
        }, 2000);
    }

    function showCopyButtonState(state) {
        showStatusButtonState({
            button: copyTerminalOutputBtn,
            icons: COPY_BUTTON_ICONS,
            label: COPY_BUTTON_LABEL,
            state,
            timerGetter: () => copySuccessTimer,
            timerSetter: value => { copySuccessTimer = value; },
            titles: {
                success: "Copied",
                empty: "Nothing to copy",
                failed: "Copy failed",
            },
        });
    }

    function showExportButtonState(state) {
        showStatusButtonState({
            button: exportTerminalLogBtn,
            icons: EXPORT_BUTTON_ICONS,
            label: EXPORT_BUTTON_LABEL,
            state,
            timerGetter: () => exportSuccessTimer,
            timerSetter: value => { exportSuccessTimer = value; },
            titles: {
                success: "Exported",
                empty: "No log to export",
                failed: "Export failed",
            },
        });
    }

    function showStatusButtonState({ button, icons, label, state, timerGetter, timerSetter, titles }) {
        if (!button) return;

        const icon = icons[state] || icons.idle;
        const title = titles[state] || label;

        button.classList.remove("copy-state-success", "copy-state-empty", "copy-state-failed");
        if (state !== "idle") {
            button.classList.add(`copy-state-${state}`);
        }
        button.innerHTML = icon;
        button.title = title;
        button.setAttribute("aria-label", title);

        const currentTimer = timerGetter();
        if (currentTimer) {
            clearTimeout(currentTimer);
            timerSetter(null);
        }

        if (state !== "idle") {
            timerSetter(setTimeout(() => {
                showStatusButtonState({ button, icons, label, state: "idle", timerGetter, timerSetter, titles });
            }, 900));
        }
    }

    async function copyTerminalOutput() {
        const text = terminalOutput ? terminalOutput.textContent : "";
        if (!text) {
            showCopyButtonState("empty");
            debugLog("No UART output to copy");
            return;
        }

        if (text.length > TERMINAL_COPY_WARN_LENGTH &&
            !confirm("UART output is large. Copying may freeze the page. Continue?")) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showCopyButtonState("success");
            debugLog("UART output copied", { length: text.length });
        } catch (error) {
            showCopyButtonState("failed");
            debugLog("UART output copy failed", error);
        }
    }

    async function exportTerminalLog() {
        if (!terminalLogStore) {
            showExportButtonState("failed");
            debugLog("terminal log store unavailable");
            return;
        }

        try {
            const text = await terminalLogStore.exportText();
            if (!text) {
                showExportButtonState("empty");
                debugLog("No UART log to export");
                return;
            }

            const filename = `uart-log-${formatLogFilenameDate(new Date())}.txt`;
            const picker = appModules.filePicker;
            if (picker) {
                picker.downloadTextFile({
                    suggestedName: filename,
                    text,
                    type: "text/plain",
                });
            } else {
                const blob = new Blob([text], { type: "text/plain" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                URL.revokeObjectURL(link.href);
            }

            showExportButtonState("success");
            debugLog("UART log exported", { length: text.length });
        } catch (error) {
            showExportButtonState("failed");
            debugLog("UART log export failed", error);
        }
    }

    async function clear() {
        clearUartRxBuffer();
        if (terminalOutput) {
            terminalOutput.replaceChildren();
            terminalOutput.scrollTop = 0;
        }
        uartAtLineStart = true;
        if (terminalLogStore) {
            await terminalLogStore.clear();
        }
        showTerminalNotice("Cleared terminal and log");
    }

    function writeUartData(data) {
        if (!showLineTimeToggle || !showLineTimeToggle.checked) {
            writeTerminalRxView(data);
            uartAtLineStart = /(\r|\n)$/.test(data);
            return;
        }

        const fragment = document.createDocumentFragment();
        let rxText = "";

        function flushRxText() {
            if (!rxText) return;
            const span = document.createElement("span");
            span.className = "terminal-rx";
            span.appendChild(document.createTextNode(rxText));
            fragment.appendChild(span);
            rxText = "";
        }

        for (const char of data) {
            if (uartAtLineStart && char !== "\r" && char !== "\n") {
                flushRxText();
                writeTerminalTime(fragment);
                uartAtLineStart = false;
            }

            rxText += char;
            if (char === "\r" || char === "\n") {
                uartAtLineStart = true;
            }
        }

        flushRxText();
        writeTerminalFragment(fragment);
    }

    function writeUartHexData(bytes) {
        hexRxBuffer.push(...bytes);
        restartUartRxFlushTimer();
    }

    function writeUartTextBuffered(data) {
        textRxBuffer += data;
        restartUartRxFlushTimer();
    }

    function getRxIdleMs() {
        const value = Number(rxIdleInput ? rxIdleInput.value : RX_IDLE_DEFAULT_MS);
        if (!Number.isFinite(value) || value < 1) {
            return RX_IDLE_DEFAULT_MS;
        }
        return Math.min(1000, Math.floor(value));
    }

    function restartUartRxFlushTimer() {
        if (rxFlushTimer) {
            clearTimeout(rxFlushTimer);
        }
        rxFlushTimer = setTimeout(flushUartRxBuffer, getRxIdleMs());
    }

    function clearUartRxBuffer() {
        if (rxFlushTimer) {
            clearTimeout(rxFlushTimer);
            rxFlushTimer = null;
        }
        textRxBuffer = "";
        hexRxBuffer = [];
    }

    function flushUartRxBuffer() {
        if (rxFlushTimer) {
            clearTimeout(rxFlushTimer);
            rxFlushTimer = null;
        }

        if (hexRxBuffer.length > 0) {
            flushUartHexBuffer();
        }

        if (textRxBuffer.length > 0) {
            const output = textRxBuffer;
            textRxBuffer = "";
            writeUartData(output);
        }
    }

    function flushUartHexBuffer() {
        const output = appModules.bytesToHexText(new Uint8Array(hexRxBuffer));
        hexRxBuffer = [];
        if (!output) return;

        const line = `${output}\n`;
        if (showLineTimeToggle && showLineTimeToggle.checked) {
            const fragment = document.createDocumentFragment();
            writeTerminalTime(fragment);
            const span = document.createElement("span");
            span.className = "terminal-rx";
            span.appendChild(document.createTextNode(line));
            fragment.appendChild(span);
            writeTerminalFragment(fragment);
        } else {
            writeTerminalRxView(line);
        }
        uartAtLineStart = true;
    }

    function handleSerialData({ text = "", bytes = null } = {}) {
        if (hexSendToggle.checked) {
            if (!bytes) {
                return;
            }
            const output = appModules.bytesToHexText(bytes);
            if (output) {
                appendTerminalLog({ dir: "rx", mode: "hex", text: `${output}\n` });
            }
            writeUartHexData(bytes);
            return;
        }

        if (hexRxBuffer.length > 0) {
            flushUartRxBuffer();
        }
        if (text) {
            appendTerminalLog({ dir: "rx", mode: "text", text });
            writeUartTextBuffered(text);
        }
    }

    function buildTerminalPayload(text) {
        return appendNewlineToggle && appendNewlineToggle.checked ? `${text}\r\n` : text;
    }

    async function sendCommand({ clearInput = true } = {}) {
        const cmd = atCommandInput ? atCommandInput.value : "";
        if (!cmd) return;

        try {
            if (hexSendToggle.checked) {
                await serialSession.writeBytes("terminal", appModules.hexToBytes(cmd));
                writeTxEcho(cmd, { hex: true });
            } else {
                await serialSession.writeText("terminal", buildTerminalPayload(cmd));
                writeTxEcho(cmd);
            }
            addCommandHistory(cmd);
            if (clearInput) {
                atCommandInput.value = "";
            }
        } catch (error) {
            writeError(`Error: ${error.message}\n`);
        }
    }

    function handleTerminalHexToggle() {
        const enabled = hexSendToggle.checked;
        const value = atCommandInput.value;

        if (!enabled) {
            flushUartRxBuffer();
        }

        if (!value) return;

        try {
            atCommandInput.value = enabled ? appModules.textToHexText(value) : appModules.hexTextToText(value);
            commandHistoryIndex = commandHistory.length;
            commandHistoryDraft = atCommandInput.value;
        } catch (error) {
            hexSendToggle.checked = !enabled;
            showTerminalNotice("HEX convert failed");
            writeError(`Error: ${error.message}\n`);
        }
    }

    function normalizeRxIdleInput() {
        if (rxIdleInput) {
            rxIdleInput.value = String(getRxIdleMs());
        }
    }

    function loadCommandHistory() {
        try {
            const value = JSON.parse(localStorage.getItem(COMMAND_HISTORY_KEY) || "[]");
            return Array.isArray(value) ? value.filter(item => typeof item === "string" && item.length > 0) : [];
        } catch (error) {
            return [];
        }
    }

    function saveCommandHistory() {
        localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(commandHistory));
    }

    function addCommandHistory(command) {
        const value = String(command || "");
        if (!value) return;

        if (commandHistory[commandHistory.length - 1] !== value) {
            commandHistory.push(value);
            if (commandHistory.length > COMMAND_HISTORY_MAX) {
                commandHistory = commandHistory.slice(commandHistory.length - COMMAND_HISTORY_MAX);
            }
            saveCommandHistory();
        }
        commandHistoryIndex = commandHistory.length;
        commandHistoryDraft = "";
    }

    function browseCommandHistory(direction) {
        if (commandHistory.length === 0 || !atCommandInput) return;

        if (commandHistoryIndex === commandHistory.length) {
            commandHistoryDraft = atCommandInput.value;
        }

        if (direction < 0) {
            commandHistoryIndex = Math.max(0, commandHistoryIndex - 1);
            atCommandInput.value = commandHistory[commandHistoryIndex];
        } else if (commandHistoryIndex < commandHistory.length - 1) {
            commandHistoryIndex += 1;
            atCommandInput.value = commandHistory[commandHistoryIndex];
        } else {
            commandHistoryIndex = commandHistory.length;
            atCommandInput.value = commandHistoryDraft;
        }

        atCommandInput.setSelectionRange(atCommandInput.value.length, atCommandInput.value.length);
    }

    function terminalKeyToSerialText(event) {
        if (event.ctrlKey || event.altKey || event.metaKey) {
            return null;
        }
        if (event.key === "Enter") {
            return appendNewlineToggle && appendNewlineToggle.checked ? "\r\n" : "\r";
        }
        if (event.key === "Backspace") {
            return "\b";
        }
        if (event.key === "Tab") {
            return "\t";
        }
        if (event.key.length === 1) {
            return event.key;
        }
        return null;
    }

    async function sendTerminalKey(event) {
        const text = terminalKeyToSerialText(event);
        if (text === null) return;

        event.preventDefault();
        if (!serialSession.canWrite("terminal")) {
            writeError(`${serialSession.getStatusText() || "Error: serial is not connected"}\n`);
            return;
        }

        try {
            await serialSession.writeText("terminal", text);
        } catch (error) {
            writeError(`Error: ${error.message}\n`);
        }
    }

    function startIntervalSend() {
        if (intervalSendTimer) {
            stopIntervalSend();
            return;
        }

        const intervalMs = Number(sendIntervalInput ? sendIntervalInput.value : NaN);
        if (!Number.isFinite(intervalMs) || intervalMs < 10) {
            writeError("Error: send interval must be at least 10 ms\n");
            return;
        }
        if (!atCommandInput || !atCommandInput.value) {
            writeError("Error: enter data before starting interval send\n");
            return;
        }

        intervalSendBtn.textContent = "Stop Interval";
        intervalSendBtn.classList.add("active");
        sendCommand({ clearInput: false });
        intervalSendTimer = setInterval(async () => {
            if (intervalSendBusy) return;
            intervalSendBusy = true;
            try {
                await sendCommand({ clearInput: false });
            } finally {
                intervalSendBusy = false;
            }
        }, intervalMs);
    }

    function stopIntervalSend() {
        if (intervalSendTimer) {
            clearInterval(intervalSendTimer);
            intervalSendTimer = null;
        }
        intervalSendBusy = false;
        if (intervalSendBtn) {
            intervalSendBtn.textContent = "Start Interval";
            intervalSendBtn.classList.remove("active");
        }
    }

    function handleConnected() {
        handleSessionChanged();
        if (quickSendPanel) {
            quickSendPanel.handleConnected();
        }
    }

    function handleDisconnected() {
        stopIntervalSend();
        clearUartRxBuffer();
        setTerminalReady(false);
        if (quickSendPanel) {
            quickSendPanel.handleDisconnected();
        }
    }

    function handleSessionChanged() {
        const terminalReady = serialSession ? serialSession.canWrite("terminal") : true;

        setTerminalReady(terminalReady);
        if (!terminalReady) {
            stopIntervalSend();
        }
        if (quickSendPanel && quickSendPanel.handleSessionChanged) {
            quickSendPanel.handleSessionChanged();
        }
    }

    function setTerminalReady(ready) {
        if (atCommandInput) atCommandInput.disabled = !ready;
        if (sendCmdBtn) sendCmdBtn.disabled = !ready;
        if (sendIntervalInput) sendIntervalInput.disabled = !ready;
        if (intervalSendBtn) intervalSendBtn.disabled = !ready;
    }

    function formatTimestampMs(date) {
        const pad2 = value => String(value).padStart(2, "0");
        const pad3 = value => String(value).padStart(3, "0");
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
    }

    function formatLogFilenameDate(date) {
        const pad2 = value => String(value).padStart(2, "0");
        return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
    }

    return {
        handleConnected,
        handleDisconnected,
        handleSessionChanged,
        writeSystem,
        writeError,
        writeTxEcho,
        clear,
        stopIntervalSend,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createTerminalPage = createTerminalPage;
})();
