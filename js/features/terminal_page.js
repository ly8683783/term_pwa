(function () {
const appModules = window.TermPWA || {};

const COMMAND_HISTORY_KEY = "lr71TerminalCommandHistory";
const COMMAND_HISTORY_MAX = 50;
const TERMINAL_MAX_NODES = 4000;
const RX_IDLE_DEFAULT_MS = 10;
const TEXT_COMMAND_PLACEHOLDER = "Enter AT command (e.g. at+ab info)";
const HEX_COMMAND_PLACEHOLDER = "Enter HEX bytes (e.g. 61 74 2B 61 62 20 69 6E 66 6F)";

function createTerminalPage({
    rootSelector = "#view-terminal",
    serialSession,
    serialBus,
    debugLog = () => {},
} = {}) {
    const root = document.querySelector(rootSelector) || document;
    const findById = id => root.querySelector(`#${id}`);

    const terminalOutput = findById("terminalOutput");
    const atCommandInput = findById("atCommandInput");
    const sendCmdBtn = findById("sendCmdBtn");
    const autoScrollToggle = findById("autoScrollToggle");
    const showLineTimeToggle = findById("showLineTimeToggle");
    const terminalThemeSelect = findById("terminalThemeSelect");
    const terminalNotice = findById("terminalNotice");
    const copyTerminalOutputBtn = findById("copyTerminalOutputBtn");
    const exportTerminalLogBtn = findById("exportTerminalLogBtn");
    const clearTerminalOutputBtn = findById("clearTerminalOutputBtn");
    const hexSendToggle = findById("hexSendToggle");
    const rxIdleInput = findById("rxIdleInput");
    const appendNewlineToggle = findById("appendNewlineToggle");
    const sendIntervalInput = findById("sendIntervalInput");
    const intervalSendBtn = findById("intervalSendBtn");

    let intervalSendTimer = null;
    let intervalSendBusy = false;
    let commandHistory = loadCommandHistory();
    let commandHistoryIndex = commandHistory.length;
    let commandHistoryDraft = "";
    let uartAtLineStart = true;
    let hexRxBuffer = [];
    let textRxBuffer = "";
    let rxFlushTimer = null;
    let disposed = false;
    let unsubscribeTerminalData = null;

    const terminalLogStore = appModules.createTerminalLogStore({ debugLog });
    const consoleView = appModules.createUartConsole({
        outputElement: terminalOutput,
        copyButton: copyTerminalOutputBtn,
        exportButton: exportTerminalLogBtn,
        clearButton: clearTerminalOutputBtn,
        noticeElement: terminalNotice,
        themeApi: getTerminalThemeApi(),
        autoScrollToggle,
        maxNodes: TERMINAL_MAX_NODES,
        getExportFileName: () => `uart-log-${formatLogFilenameDate(new Date())}.txt`,
        getExportText: () => terminalLogStore ? terminalLogStore.exportText() : "",
        onClear: async () => {
            clearUartRxBuffer();
            uartAtLineStart = true;
            if (terminalLogStore) await terminalLogStore.clear();
        },
        clearNotice: "Cleared terminal and log",
        debugLog,
    });
    const handleShowLineTimeChange = () => {
        if (disposed) {
            return;
        }
        uartAtLineStart = true;
    };
    const handleTerminalThemeChange = () => {
        if (disposed || !terminalThemeSelect) {
            return;
        }
        const themeApi = getTerminalThemeApi();
        const nextTheme = themeApi
            ? themeApi.save(terminalThemeSelect.value)
            : terminalThemeSelect.value;
        applyTerminalTheme(nextTheme);
    };
    const handleHexToggleChange = () => {
        if (disposed) {
            return;
        }
        handleTerminalHexToggle();
    };
    const handleRxIdleChange = () => {
        if (disposed) {
            return;
        }
        normalizeRxIdleInput();
    };
    const handleTerminalOutputClick = () => {
        if (disposed || !terminalOutput) {
            return;
        }
        terminalOutput.focus();
    };
    const handleTerminalOutputKeydown = event => {
        if (disposed) {
            return;
        }
        logTerminalKeyEvent("output", event);
        sendTerminalKey(event);
    };
    const handleTerminalKeyCapture = event => {
        if (!disposed && root.classList.contains("active") && isTerminalControlKey(event)) {
            logTerminalKeyEvent("capture", event);
            queueMicrotask(() => logTerminalKeyEvent("after", event));
        }
    };
    const handleSendClick = () => {
        if (disposed) {
            return;
        }
        sendCommand();
    };
    const handleIntervalSendClick = () => {
        if (disposed) {
            return;
        }
        startIntervalSend();
    };
    const handleAtCommandKeydown = event => {
        if (disposed) {
            return;
        }
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
    };
    const handleAtCommandInput = () => {
        if (disposed || !atCommandInput) {
            return;
        }
        commandHistoryIndex = commandHistory.length;
        commandHistoryDraft = atCommandInput.value;
    };

    if (rxIdleInput) {
        rxIdleInput.value = String(RX_IDLE_DEFAULT_MS);
    }
    updateCommandPlaceholder();
    applyTerminalTheme(loadTerminalTheme());

    const quickSendPanel = createTerminalQuickSendPanel({
        rootSelector: `${rootSelector} #quickSendPanel`,
        serialSession,
        appendNewlineToggle,
        writeTerminal: writeSystem,
        writeTerminalTxEcho: writeTxEcho,
        debugLog,
    });

    if (serialBus) {
        unsubscribeTerminalData = serialBus.subscribeData("terminal", data => {
            handleSerialData(data);
        });
    }

    bindEvents();

    function bindEvents() {
        if (showLineTimeToggle) {
            showLineTimeToggle.addEventListener("change", handleShowLineTimeChange);
        }
        if (terminalThemeSelect) {
            terminalThemeSelect.addEventListener("change", handleTerminalThemeChange);
        }
        if (hexSendToggle) {
            hexSendToggle.addEventListener("change", handleHexToggleChange);
        }
        if (rxIdleInput) {
            rxIdleInput.addEventListener("change", handleRxIdleChange);
        }
        if (terminalOutput) {
            terminalOutput.addEventListener("click", handleTerminalOutputClick);
            terminalOutput.addEventListener("keydown", handleTerminalOutputKeydown);
        }
        document.addEventListener("keydown", handleTerminalKeyCapture, true);
        if (sendCmdBtn) {
            sendCmdBtn.addEventListener("click", handleSendClick);
        }
        if (intervalSendBtn) {
            intervalSendBtn.addEventListener("click", handleIntervalSendClick);
        }
        if (atCommandInput) {
            atCommandInput.addEventListener("keydown", handleAtCommandKeydown);
            atCommandInput.addEventListener("input", handleAtCommandInput);
        }
    }

    function writeTerminalText(text, className) {
        consoleView.appendText(text, className);
    }

    function writeTerminalFragment(fragment) {
        consoleView.appendFragment(fragment);
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
        const line = `${text}\n`;
        const txDate = new Date();
        const logText = isUartTimeEnabled()
            ? `${formatTimestampPrefix(txDate)}${line}`
            : line;
        appendTerminalLog({ dir: "tx", mode: hex ? "hex" : "text", text: logText });

        const fragment = document.createDocumentFragment();
        if (isUartTimeEnabled()) {
            writeTerminalTime(fragment, txDate);
        }
        const span = document.createElement("span");
        span.className = "terminal-tx";
        span.appendChild(document.createTextNode(line));
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
        const themeApi = getTerminalThemeApi();
        return themeApi ? themeApi.load() : "bright-dark";
    }

    function applyTerminalTheme(theme) {
        const themeApi = getTerminalThemeApi();
        const nextTheme = consoleView.setTheme(theme);
        if (themeApi) {
            themeApi.syncSelect(terminalThemeSelect, nextTheme);
        } else if (terminalThemeSelect) {
            terminalThemeSelect.value = nextTheme;
        }
    }

    function getTerminalThemeApi() {
        return appModules.terminalTheme || null;
    }

    function scrollTerminalOnShow() {
        requestAnimationFrame(() => {
            if (!disposed) consoleView.scrollToBottom();
        });
    }

    async function clear() {
        await consoleView.clear();
    }

    function writeUartData(data) {
        if (!isUartTimeEnabled()) {
            writeTerminalRxView(data);
            appendTerminalLog({ dir: "rx", mode: "text", text: data });
            uartAtLineStart = /(\r|\n)$/.test(data);
            return;
        }

        const fragment = document.createDocumentFragment();
        const timestampDate = new Date();
        let logText = "";
        let rxText = "";

        function flushRxText() {
            if (!rxText) return;
            const span = document.createElement("span");
            span.className = "terminal-rx";
            span.appendChild(document.createTextNode(rxText));
            fragment.appendChild(span);
            logText += rxText;
            rxText = "";
        }

        for (const char of data) {
            if (uartAtLineStart && char !== "\r" && char !== "\n") {
                flushRxText();
                writeTerminalTime(fragment, timestampDate);
                logText += formatTimestampPrefix(timestampDate);
                uartAtLineStart = false;
            }

            rxText += char;
            if (char === "\r" || char === "\n") {
                uartAtLineStart = true;
            }
        }

        flushRxText();
        writeTerminalFragment(fragment);
        appendTerminalLog({ dir: "rx", mode: "text", text: logText });
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
        if (isUartTimeEnabled()) {
            const timestampDate = new Date();
            const fragment = document.createDocumentFragment();
            writeTerminalTime(fragment, timestampDate);
            const span = document.createElement("span");
            span.className = "terminal-rx";
            span.appendChild(document.createTextNode(line));
            fragment.appendChild(span);
            writeTerminalFragment(fragment);
            appendTerminalLog({ dir: "rx", mode: "hex", text: `${formatTimestampPrefix(timestampDate)}${line}` });
        } else {
            writeTerminalRxView(line);
            appendTerminalLog({ dir: "rx", mode: "hex", text: line });
        }
        uartAtLineStart = true;
    }

    function handleSerialData({ text = "", bytes = null } = {}) {
        if (disposed) {
            return;
        }
        if (hexSendToggle.checked) {
            if (!bytes) {
                return;
            }
            writeUartHexData(bytes);
            return;
        }

        if (hexRxBuffer.length > 0) {
            flushUartRxBuffer();
        }
        if (text) {
            writeUartTextBuffered(text);
        }
    }

    function buildTerminalPayload(text) {
        return appendNewlineToggle && appendNewlineToggle.checked ? `${text}\r\n` : text;
    }

    async function sendCommand({ clearInput = true } = {}) {
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
        const enabled = hexSendToggle.checked;
        const value = atCommandInput.value;

        if (!enabled) {
            flushUartRxBuffer();
        }
        updateCommandPlaceholder();

        if (!value) return;

        try {
            atCommandInput.value = enabled ? appModules.textToHexText(value) : appModules.hexTextToText(value);
            commandHistoryIndex = commandHistory.length;
            commandHistoryDraft = atCommandInput.value;
        } catch (error) {
            hexSendToggle.checked = !enabled;
            consoleView.showNotice("HEX convert failed");
            writeError(`Error: ${error.message}\n`);
        }
    }

    function updateCommandPlaceholder() {
        if (!atCommandInput) return;

        atCommandInput.placeholder = hexSendToggle && hexSendToggle.checked
            ? HEX_COMMAND_PLACEHOLDER
            : TEXT_COMMAND_PLACEHOLDER;
    }

    function normalizeRxIdleInput() {
        if (rxIdleInput) {
            rxIdleInput.value = String(getRxIdleMs());
        }
    }

    function isUartTimeEnabled() {
        return Boolean(showLineTimeToggle && showLineTimeToggle.checked);
    }

    function formatTimestampPrefix(date) {
        return `[${formatTimestampMs(date)}] `;
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
        const arrowKeySequences = {
            ArrowUp: "\u001b[A",
            ArrowDown: "\u001b[B",
            ArrowRight: "\u001b[C",
            ArrowLeft: "\u001b[D",
        };
        if (arrowKeySequences[event.key]) {
            return arrowKeySequences[event.key];
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

    function isTerminalControlKey(event) {
        return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Delete"].includes(event.key);
    }

    function logTerminalKeyEvent(stage, event) {
        const activeElement = document.activeElement;
        debugLog(`terminal key ${stage}`, {
            key: event.key,
            target: describeKeyboardTarget(event.target),
            activeElement: describeKeyboardTarget(activeElement),
            outputFocused: activeElement === terminalOutput,
            defaultPrevented: event.defaultPrevented,
        });
    }

    function describeKeyboardTarget(element) {
        if (!element) return null;
        return `${element.tagName || "unknown"}${element.id ? `#${element.id}` : ""}${element.className ? `.${String(element.className).trim().replace(/\s+/g, ".")}` : ""}`;
    }

    async function sendTerminalKey(event) {
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
        handleSessionChanged();
        if (quickSendPanel) {
            quickSendPanel.handleConnected();
        }
    }

    function handleDisconnected() {
        if (disposed) {
            return;
        }
        stopIntervalSend();
        clearUartRxBuffer();
        setTerminalReady(false);
        if (quickSendPanel) {
            quickSendPanel.handleDisconnected();
        }
    }

    function handleSessionChanged() {
        if (disposed) {
            return;
        }
        const terminalReady = serialSession ? serialSession.canWrite("terminal") : true;

        setTerminalReady(terminalReady);
        if (!terminalReady) {
            stopIntervalSend();
        }
        if (quickSendPanel && quickSendPanel.handleSessionChanged) {
            quickSendPanel.handleSessionChanged();
        }
    }

    function handleShown() {
        if (disposed) {
            return;
        }
        if (quickSendPanel && quickSendPanel.handleShown) {
            quickSendPanel.handleShown();
        }
        scrollTerminalOnShow();
    }

    function dispose() {
        if (disposed) {
            return;
        }
        disposed = true;
        if (typeof unsubscribeTerminalData === "function") {
            unsubscribeTerminalData();
            unsubscribeTerminalData = null;
        }
        stopIntervalSend();
        clearUartRxBuffer();
        if (showLineTimeToggle) showLineTimeToggle.removeEventListener("change", handleShowLineTimeChange);
        if (terminalThemeSelect) terminalThemeSelect.removeEventListener("change", handleTerminalThemeChange);
        if (hexSendToggle) hexSendToggle.removeEventListener("change", handleHexToggleChange);
        if (rxIdleInput) rxIdleInput.removeEventListener("change", handleRxIdleChange);
        if (terminalOutput) {
            terminalOutput.removeEventListener("click", handleTerminalOutputClick);
            terminalOutput.removeEventListener("keydown", handleTerminalOutputKeydown);
        }
        document.removeEventListener("keydown", handleTerminalKeyCapture, true);
        if (sendCmdBtn) sendCmdBtn.removeEventListener("click", handleSendClick);
        if (intervalSendBtn) intervalSendBtn.removeEventListener("click", handleIntervalSendClick);
        if (atCommandInput) {
            atCommandInput.removeEventListener("keydown", handleAtCommandKeydown);
            atCommandInput.removeEventListener("input", handleAtCommandInput);
        }
        if (quickSendPanel && typeof quickSendPanel.dispose === "function") {
            quickSendPanel.dispose();
        }
        consoleView.dispose();
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

    // Keep this object as the stable public interface consumed by main.js and sibling pages.
    return Object.freeze({
        handleConnected,
        handleDisconnected,
        handleSessionChanged,
        handleShown,
        writeSystem,
        writeError,
        writeTxEcho,
        clear,
        stopIntervalSend,
        dispose,
    });
}

function createTerminalQuickSendPanel(options) {
    if (typeof appModules.createQuickSendPanel !== "function") {
        return {
            handleConnected() {},
            handleDisconnected() {},
            handleSessionChanged() {},
            handleShown() {},
            dispose() {},
        };
    }

    return appModules.createQuickSendPanel(options);
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createTerminalPage = createTerminalPage;
})();
