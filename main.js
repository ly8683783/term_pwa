const debugLog = (message, detail) => window.appDebugLog && window.appDebugLog(message, detail);
debugLog("main script start");
const appModules = window.TermPWA || {};
const APP_CACHE_NAME = appModules.APP_VERSION || "unknown";

if (!appModules.createNetViewPage || !appModules.SerialTransport || !appModules.SerialPortStore || !appModules.SerialPortManager || !appModules.createSerialEventBus || !appModules.createSerialSession || !appModules.createQuickSendPanel || !appModules.createFirmwareUpdateDialog || !appModules.createConfigPage || !appModules.hexToBytes) {
    debugLog("script globals missing", {
        createNetViewPage: Boolean(appModules.createNetViewPage),
        SerialTransport: Boolean(appModules.SerialTransport),
        SerialPortStore: Boolean(appModules.SerialPortStore),
        SerialPortManager: Boolean(appModules.SerialPortManager),
        createSerialEventBus: Boolean(appModules.createSerialEventBus),
        createSerialSession: Boolean(appModules.createSerialSession),
        createQuickSendPanel: Boolean(appModules.createQuickSendPanel),
        createFirmwareUpdateDialog: Boolean(appModules.createFirmwareUpdateDialog),
        createConfigPage: Boolean(appModules.createConfigPage),
        hexToBytes: Boolean(appModules.hexToBytes),
    });
    throw new Error("Required page scripts failed to load.");
}
debugLog("classic scripts loaded");
debugLog("browser security context", {
    isSecureContext: window.isSecureContext,
    hasNavigatorSerial: Boolean(navigator.serial),
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    origin: window.location.origin,
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        registerServiceWorker();
    });
}

const portSelect = document.getElementById('portSelect');
const appVersionInfo = document.getElementById('appVersionInfo');
const pwaUpdatePrompt = document.getElementById('pwaUpdatePrompt');
const pwaUpdateBtn = document.getElementById('pwaUpdateBtn');
const connectBtn = document.getElementById('connectBtn');
const connectText = document.getElementById('connectText');
const autoConnectToggle = document.getElementById('autoConnectToggle');
const statusMessage = document.getElementById('statusMessage');
const terminalOutput = document.getElementById('terminalOutput');
const atCommandInput = document.getElementById('atCommandInput');
const sendCmdBtn = document.getElementById('sendCmdBtn');
const autoScrollToggle = document.getElementById('autoScrollToggle');
const showLineTimeToggle = document.getElementById('showLineTimeToggle');
const terminalNotice = document.getElementById('terminalNotice');
const copyTerminalOutputBtn = document.getElementById('copyTerminalOutputBtn');
const clearTerminalOutputBtn = document.getElementById('clearTerminalOutputBtn');
const hexSendToggle = document.getElementById('hexSendToggle');
const rxIdleInput = document.getElementById('rxIdleInput');
const appendNewlineToggle = document.getElementById('appendNewlineToggle');
const sendIntervalInput = document.getElementById('sendIntervalInput');
const intervalSendBtn = document.getElementById('intervalSendBtn');
const COMMAND_HISTORY_KEY = "lr71TerminalCommandHistory";
const COMMAND_HISTORY_MAX = 50;
const TERMINAL_COPY_WARN_LENGTH = 2000000;
const RX_IDLE_DEFAULT_MS = 30;
debugLog("dom refs resolved", {
    connectBtn: Boolean(connectBtn),
    portSelect: Boolean(portSelect),
    atCommandInput: Boolean(atCommandInput),
    sendCmdBtn: Boolean(sendCmdBtn),
});

let netViewPage = null;
let firmwareUpdateDialog = null;
let configPage = null;
let quickSendPanel = null;
let intervalSendTimer = null;
let intervalSendBusy = false;
let commandHistory = loadCommandHistory();
let commandHistoryIndex = commandHistory.length;
let commandHistoryDraft = "";
let uartAtLineStart = true;
let selectedPortIndex = "request";
let activeViewId = "view-terminal";
let terminalNoticeTimer = null;
let hexRxBuffer = [];
let textRxBuffer = "";
let rxFlushTimer = null;
let waitingServiceWorker = null;
let serviceWorkerRefreshing = false;

if (appVersionInfo) {
    appVersionInfo.textContent = `Application Version: ${APP_CACHE_NAME}`;
}

function registerServiceWorker() {
    navigator.serviceWorker.register("./service_worker.js")
        .then(registration => {
            debugLog("service worker registered", { scope: registration.scope });
            watchServiceWorkerUpdate(registration);
            return registration.update();
        })
        .catch(error => {
            debugLog("service worker registration failed", error);
        });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (serviceWorkerRefreshing) return;
        serviceWorkerRefreshing = true;
        window.location.reload();
    });
}

function watchServiceWorkerUpdate(registration) {
    if (registration.waiting && navigator.serviceWorker.controller) {
        showPwaUpdatePrompt(registration.waiting);
    }

    registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;

        debugLog("service worker update found");
        worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
                showPwaUpdatePrompt(worker);
            }
        });
    });
}

function showPwaUpdatePrompt(worker) {
    waitingServiceWorker = worker;
    if (pwaUpdatePrompt) {
        pwaUpdatePrompt.hidden = false;
    }
    debugLog("service worker update ready");
}

if (pwaUpdateBtn) {
    pwaUpdateBtn.addEventListener("click", () => {
        if (!waitingServiceWorker) return;

        pwaUpdateBtn.disabled = true;
        pwaUpdateBtn.textContent = "Updating...";
        waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    });
}

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-target');
        if (activeViewId === "view-netview" && targetId !== "view-netview") {
            netViewPage.stop("Status: stopped because NetView page was left.");
        }
        activeViewId = targetId;

        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');

        if (targetId === 'view-netview') {
            netViewPage.redraw();
        } else if (targetId === 'view-config') {
            configPage.handleShown();
        }
    });
});

function writeTerminal(text) {
    terminalOutput.textContent += text;
    if (!autoScrollToggle || autoScrollToggle.checked) {
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }
}

function writeTerminalTxEcho(text, { hex = false } = {}) {
    const timestamp = showLineTimeToggle.checked ? `[${formatTimestampMs(new Date())}] ` : "";
    writeTerminal(`${timestamp}> ${hex ? "[HEX] " : ""}${text}\n`);
}

function showTerminalNotice(message) {
    if (!terminalNotice) return;

    terminalNotice.textContent = message;
    terminalNotice.classList.add('visible');

    if (terminalNoticeTimer) {
        clearTimeout(terminalNoticeTimer);
    }

    terminalNoticeTimer = setTimeout(() => {
        terminalNotice.classList.remove('visible');
    }, 2000);
}

async function copyTerminalOutput() {
    const text = terminalOutput.textContent;
    if (!text) {
        showTerminalNotice("Nothing to copy");
        debugLog("No UART output to copy");
        return;
    }

    if (text.length > TERMINAL_COPY_WARN_LENGTH &&
        !confirm("UART output is large. Copying may freeze the page. Continue?")) {
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showTerminalNotice("Copied");
        debugLog("UART output copied", { length: text.length });
    } catch (error) {
        showTerminalNotice("Copy failed");
        debugLog("UART output copy failed", error);
    }
}

function clearTerminalOutput() {
    clearUartRxBuffer();
    terminalOutput.textContent = "";
    terminalOutput.scrollTop = 0;
    uartAtLineStart = true;
    showTerminalNotice("Cleared");
}

function writeUartData(data) {
    if (!showLineTimeToggle.checked) {
        writeTerminal(data);
        uartAtLineStart = /(\r|\n)$/.test(data);
        return;
    }

    let output = "";
    for (const char of data) {
        if (uartAtLineStart && char !== "\r" && char !== "\n") {
            output += `[${formatTimestampMs(new Date())}] `;
            uartAtLineStart = false;
        }

        output += char;
        if (char === "\r" || char === "\n") {
            uartAtLineStart = true;
        }
    }
    writeTerminal(output);
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
    const value = Number(rxIdleInput.value);
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

    if (showLineTimeToggle.checked) {
        writeTerminal(`[${formatTimestampMs(new Date())}] ${output}\n`);
    } else {
        writeTerminal(`${output}\n`);
    }
    uartAtLineStart = true;
}

function formatTimestampMs(date) {
    const pad2 = value => String(value).padStart(2, "0");
    const pad3 = value => String(value).padStart(3, "0");
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
}

function onDataReceived(data, bytes) {
    const byteLength = bytes ? bytes.length : data.length;
    debugLog("serial data received", { length: byteLength });
    serialBus.emitData({ text: data, bytes });
}

function handleTerminalSerialData({ text, bytes }) {
    if (hexSendToggle.checked && bytes) {
        writeUartHexData(bytes);
    } else {
        if (hexRxBuffer.length > 0) {
            flushUartRxBuffer();
        }
        writeUartTextBuffered(text);
    }
}

function onDisconnect() {
    debugLog("serial disconnected");
    if (serialSession) {
        serialSession.reset();
    }
    flushUartRxBuffer();
    stopIntervalSend();
    updateUI(false);
    updatePortList().catch(error => console.error("Port list update failed:", error));
}

const serialManager = new appModules.SerialPortManager(onDataReceived, onDisconnect);
debugLog("serial manager created", { supported: serialManager.isSupported() });
const serialBus = appModules.createSerialEventBus();
debugLog("serial event bus created");
const serialSession = appModules.createSerialSession({
    serialManager,
    serialBus,
    onStatusChange: updateSessionUI,
});
debugLog("serial session created");
netViewPage = appModules.createNetViewPage({
    serialManager,
    serialSession,
    writeTerminal,
});
debugLog("netview page created");
quickSendPanel = appModules.createQuickSendPanel({
    serialSession,
    appendNewlineToggle,
    writeTerminal,
    writeTerminalTxEcho,
    debugLog,
});
debugLog("quick send panel created");
firmwareUpdateDialog = appModules.createFirmwareUpdateDialog({
    serialManager,
    serialSession,
    writeTerminal,
    debugLog,
});
debugLog("firmware update dialog created");
configPage = appModules.createConfigPage({
    serialManager,
    serialSession,
    writeTerminal,
    debugLog,
});
debugLog("configuration page created");

serialBus.subscribeBytes("terminal", bytes => {
    if (!hexSendToggle.checked) {
        return;
    }
    handleTerminalSerialData({ text: "", bytes });
});
serialBus.subscribeText("terminal", text => {
    if (hexSendToggle.checked) {
        return;
    }
    handleTerminalSerialData({ text, bytes: null });
});
serialBus.subscribeText("netview", text => netViewPage.handleSerialData(text));
serialBus.subscribeText("firmware", text => firmwareUpdateDialog.handleSerialText(text));
serialBus.subscribeText("config", text => configPage.handleSerialData(text));

async function init() {
    debugLog("init start");
    const autoConnect = localStorage.getItem('autoConnect') === 'true';
    autoConnectToggle.checked = autoConnect;
    debugLog("auto connect setting", { autoConnect });

    await updatePortList();

    if (autoConnect && serialManager.isSupported() && !serialManager.isBusy()) {
        const entries = await serialManager.getPortEntries();
        debugLog("auto connect ports", { count: entries.length });
        if (entries.length > 0) {
            selectedPortIndex = "0";
            tryConnect(entries[0].port);
        }
    }
}

async function updatePortList() {
    debugLog("updatePortList start", { supported: serialManager.isSupported() });
    if (!serialManager.isSupported()) {
        portSelect.innerHTML = '<option value="unsupported">Web Serial unavailable</option>';
        portSelect.disabled = true;
        autoConnectToggle.disabled = true;
        statusMessage.innerText = "Status: Web Serial unavailable";
        netViewPage.handleUnavailable("Status: Web Serial requires Chrome/Chromium over localhost or HTTPS.");
        configPage.handleUnavailable("Web Serial requires Chrome/Chromium over localhost or HTTPS.");
        return [];
    }

    const entries = await serialManager.getPortEntries();
    debugLog("authorized ports loaded", { count: entries.length });
    portSelect.innerHTML = '<option value="request">Select your device...</option>';

    entries.forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.text = entry.displayName;
        portSelect.appendChild(option);
    });

    portSelect.appendChild(new Option("Add new device...", "request_new"));

    const currentPortIndex = entries.findIndex(entry => entry.port === serialManager.port);
    if (currentPortIndex >= 0) {
        selectedPortIndex = String(currentPortIndex);
    }

    if (selectedPortIndex !== "request" && entries[selectedPortIndex]) {
        portSelect.value = selectedPortIndex;
    } else {
        selectedPortIndex = "request";
        portSelect.value = "request";
    }

    return entries;
}

portSelect.addEventListener('change', async () => {
    if (serialManager.isBusy()) {
        await updatePortList();
        return;
    }

    const selectedValue = portSelect.value;
    if (portSelect.value === 'request_new') {
        try {
            const requestedEntry = await serialManager.requestNewPortEntry();
            const entries = await updatePortList();
            if (requestedEntry) {
                const requestedIndex = entries.findIndex(entry => entry.port === requestedEntry.port);
                if (requestedIndex >= 0) {
                    selectedPortIndex = String(requestedIndex);
                    portSelect.value = selectedPortIndex;
                }
            }
        } catch (e) {
            console.error("Device selection cancelled", e);
        }
        if (selectedPortIndex !== "request") {
            portSelect.value = selectedPortIndex;
        } else {
            portSelect.value = 'request';
        }
        return;
    }

    selectedPortIndex = selectedValue;
    if ((selectedValue === "request") || !serialManager.isConnected()) {
        return;
    }

    await switchConnectedPort(selectedValue);
});

async function switchConnectedPort(selectedValue) {
    if (serialManager.isBusy()) {
        return;
    }

    try {
        const entries = await serialManager.getPortEntries();
        const nextPort = entries[selectedValue] && entries[selectedValue].port;
        if (!nextPort || nextPort === serialManager.port) {
            return;
        }

        debugLog("switch serial port start", { selectedValue });
        stopIntervalSend();
        serialSession.reset();
        flushUartRxBuffer();
        const disconnectPromise = serialManager.disconnect({ notify: false });
        updateUI();
        await disconnectPromise;
        const connectPromise = serialManager.connect(nextPort, 115200);
        updateUI();
        await connectPromise;
        selectedPortIndex = selectedValue;
        updateUI();
        await updatePortList();
        configPage.handleDeviceChanged(activeViewId === "view-config");
        debugLog("switch serial port success", { selectedValue });
    } catch (error) {
        debugLog("switch serial port failed", error);
        console.error("Switch port failed:", error);
        alert("Failed to switch device: " + error.message);
        selectedPortIndex = "request";
        updateUI();
        await updatePortList();
    }
}

autoConnectToggle.addEventListener('change', () => {
    localStorage.setItem('autoConnect', autoConnectToggle.checked);
});

showLineTimeToggle.addEventListener('change', () => {
    uartAtLineStart = true;
});

copyTerminalOutputBtn.addEventListener('click', () => {
    copyTerminalOutput().catch(error => {
        debugLog("UART output copy failed", error);
    });
});

clearTerminalOutputBtn.addEventListener('click', clearTerminalOutput);
hexSendToggle.addEventListener('change', handleTerminalHexToggle);
rxIdleInput.addEventListener('change', normalizeRxIdleInput);

async function tryConnect(targetPort = null) {
    if (serialManager.isBusy()) {
        return;
    }

    debugLog("tryConnect start", { hasTargetPort: Boolean(targetPort), selectedValue: portSelect.value });
    try {
        let portObj = targetPort;
        if (!portObj) {
            const selectedValue = portSelect.value;
            const entries = await serialManager.getPortEntries();
            debugLog("tryConnect authorized ports", { count: entries.length, selectedValue });

            if (selectedValue === 'request') {
                portObj = null;
            } else if (entries[selectedValue]) {
                portObj = entries[selectedValue].port;
                selectedPortIndex = selectedValue;
            }
        }

        debugLog("serial connect call", { hasPortObj: Boolean(portObj), baudRate: 115200 });
        const connectPromise = serialManager.connect(portObj, 115200);
        updateUI();
        const connectedPort = await connectPromise;
        if (connectedPort) {
            const entries = await serialManager.getPortEntries();
            const connectedIndex = entries.findIndex(entry => entry.port === connectedPort);
            if (connectedIndex >= 0) {
                selectedPortIndex = String(connectedIndex);
                portSelect.value = selectedPortIndex;
            }
        }
        debugLog("serial connect success");
        updateUI();
        if (activeViewId === "view-config") {
            configPage.handleDeviceChanged(true);
        }
    } catch (error) {
        debugLog("serial connect failed", error);
        console.error("Connection failed:", error);
        alert("Failed to connect: " + error.message);
        updateUI();
    }
}

async function tryDisconnect() {
    if (serialManager.isBusy()) {
        return;
    }

    debugLog("tryDisconnect start");
    try {
        stopIntervalSend();
        const disconnectPromise = serialManager.disconnect();
        updateUI();
        await disconnectPromise;
        selectedPortIndex = "request";
        debugLog("tryDisconnect success");
        updateUI();
    } catch (error) {
        debugLog("tryDisconnect failed", error);
        console.error("Disconnect failed:", error);
        updateUI();
    }
}

function updateUI(connected = serialManager.isConnected()) {
    const state = serialManager.getState();
    const busy = serialManager.isBusy();

    debugLog("updateUI", { connected, state });
    portSelect.disabled = busy || !serialManager.isSupported();
    connectBtn.classList.toggle('disabled', busy);
    connectBtn.setAttribute('aria-disabled', busy ? 'true' : 'false');

    if (state === "connecting") {
        connectBtn.classList.remove('connected');
        connectText.innerText = "Connecting...";
        statusMessage.innerText = "Status: Connecting...";
        atCommandInput.disabled = true;
        sendCmdBtn.disabled = true;
        sendIntervalInput.disabled = true;
        intervalSendBtn.disabled = true;
        netViewPage.handleDisconnected("Status: serial connection is busy.");
        configPage.handleDisconnected();
        quickSendPanel.handleDisconnected();
        return;
    }

    if (state === "disconnecting") {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnecting...";
        statusMessage.innerText = "Status: Disconnecting...";
        atCommandInput.disabled = true;
        sendCmdBtn.disabled = true;
        sendIntervalInput.disabled = true;
        intervalSendBtn.disabled = true;
        netViewPage.handleDisconnected("Status: serial connection is busy.");
        configPage.handleDisconnected();
        quickSendPanel.handleDisconnected();
        return;
    }

    if (connected) {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnect";
        netViewPage.handleConnected();
        configPage.handleConnected();
        quickSendPanel.handleConnected();
        updateSessionUI();
    } else {
        stopIntervalSend();
        connectBtn.classList.remove('connected');
        connectText.innerText = "Connect";
        statusMessage.innerText = "Status: Disconnected";
        atCommandInput.disabled = true;
        sendCmdBtn.disabled = true;
        sendIntervalInput.disabled = true;
        intervalSendBtn.disabled = true;
        netViewPage.handleDisconnected();
        configPage.handleDisconnected();
        quickSendPanel.handleDisconnected();
    }
}

function updateSessionUI() {
    if (!serialManager || !serialManager.isConnected()) {
        return;
    }

    const sessionText = serialSession ? serialSession.getStatusText() : "";
    const terminalReady = serialSession ? serialSession.canWrite("terminal") : true;

    statusMessage.innerText = sessionText
        ? `Status: Connected to Serial Device (${sessionText})`
        : "Status: Connected to Serial Device";
    atCommandInput.disabled = !terminalReady;
    sendCmdBtn.disabled = !terminalReady;
    sendIntervalInput.disabled = !terminalReady;
    intervalSendBtn.disabled = !terminalReady;

    if (!terminalReady) {
        stopIntervalSend();
    }
    if (quickSendPanel && quickSendPanel.handleSessionChanged) {
        quickSendPanel.handleSessionChanged();
    }
    if (netViewPage && netViewPage.handleSessionChanged) {
        netViewPage.handleSessionChanged();
    }
    if (configPage && configPage.handleSessionChanged) {
        configPage.handleSessionChanged();
    }
}

connectBtn.addEventListener('click', () => {
    if (serialManager.isBusy()) {
        return;
    }

    debugLog("connect button clicked", {
        connected: serialManager.isConnected(),
        state: serialManager.getState(),
    });
    if (serialManager.isConnected()) {
        tryDisconnect();
    } else {
        tryConnect();
    }
});

if (serialManager.isSupported()) {
    debugLog("register navigator.serial events");
    navigator.serial.addEventListener('connect', () => {
        debugLog("navigator serial connect event");
        updatePortList();
    });

    navigator.serial.addEventListener('disconnect', (e) => {
        debugLog("navigator serial disconnect event");
        if (serialManager.port === e.target) {
            tryDisconnect();
            return;
        }
        updatePortList();
    });
}

function buildTerminalPayload(text) {
    return appendNewlineToggle.checked ? `${text}\r\n` : text;
}

async function sendCommand({ clearInput = true } = {}) {
    const cmd = atCommandInput.value;
    if (!cmd) return;

    try {
        if (hexSendToggle.checked) {
            await serialSession.writeBytes("terminal", appModules.hexToBytes(cmd));
            writeTerminalTxEcho(cmd, { hex: true });
        } else {
            await serialSession.writeText("terminal", buildTerminalPayload(cmd));
            writeTerminalTxEcho(cmd);
        }
        addCommandHistory(cmd);
        if (clearInput) {
            atCommandInput.value = '';
        }
    } catch (error) {
        writeTerminal(`Error: ${error.message}\n`);
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
        writeTerminal(`Error: ${error.message}\n`);
    }
}

function normalizeRxIdleInput() {
    rxIdleInput.value = String(getRxIdleMs());
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
    if (commandHistory.length === 0) return;

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
        return appendNewlineToggle.checked ? "\r\n" : "\r";
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
        writeTerminal(`${serialSession.getStatusText() || "Error: serial is not connected"}\n`);
        return;
    }

    try {
        await serialSession.writeText("terminal", text);
    } catch (error) {
        writeTerminal(`Error: ${error.message}\n`);
    }
}

function startIntervalSend() {
    if (intervalSendTimer) {
        stopIntervalSend();
        return;
    }

    const intervalMs = Number(sendIntervalInput.value);
    if (!Number.isFinite(intervalMs) || intervalMs < 10) {
        writeTerminal("Error: send interval must be at least 10 ms\n");
        return;
    }
    if (!atCommandInput.value) {
        writeTerminal("Error: enter data before starting interval send\n");
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

terminalOutput.addEventListener('click', () => terminalOutput.focus());
terminalOutput.addEventListener('keydown', event => {
    sendTerminalKey(event);
});
sendCmdBtn.addEventListener('click', () => sendCommand());
intervalSendBtn.addEventListener('click', startIntervalSend);
atCommandInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendCommand();
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        browseCommandHistory(-1);
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        browseCommandHistory(1);
    }
});
atCommandInput.addEventListener('input', () => {
    commandHistoryIndex = commandHistory.length;
    commandHistoryDraft = atCommandInput.value;
});

init().catch(error => {
    debugLog("init failed", error);
    console.error("Initialization failed:", error);
    statusMessage.innerText = `Status: initialization failed - ${error.message}`;
});
