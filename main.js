const debugLog = (message, detail) => window.appDebugLog && window.appDebugLog(message, detail);
debugLog("main script start");
const appModules = window.TermPWA || {};

if (!appModules.createNetViewPage || !appModules.SerialPortManager || !appModules.createQuickSendPanel || !appModules.createFirmwareUpdateDialog || !appModules.createConfigPage) {
    debugLog("script globals missing", {
        createNetViewPage: Boolean(appModules.createNetViewPage),
        SerialPortManager: Boolean(appModules.SerialPortManager),
        createQuickSendPanel: Boolean(appModules.createQuickSendPanel),
        createFirmwareUpdateDialog: Boolean(appModules.createFirmwareUpdateDialog),
        createConfigPage: Boolean(appModules.createConfigPage),
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
        navigator.serviceWorker.register("./service_worker.js")
            .then(registration => {
                debugLog("service worker registered", { scope: registration.scope });
            })
            .catch(error => {
                debugLog("service worker registration failed", error);
            });
    });
}

const portSelect = document.getElementById('portSelect');
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
const appendNewlineToggle = document.getElementById('appendNewlineToggle');
const sendIntervalInput = document.getElementById('sendIntervalInput');
const intervalSendBtn = document.getElementById('intervalSendBtn');
const COMMAND_HISTORY_KEY = "lr71TerminalCommandHistory";
const COMMAND_HISTORY_MAX = 50;
const TERMINAL_COPY_WARN_LENGTH = 2000000;
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

function formatTimestampMs(date) {
    const pad2 = value => String(value).padStart(2, "0");
    const pad3 = value => String(value).padStart(3, "0");
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
}

function onDataReceived(data) {
    debugLog("serial data received", { length: data.length });
    writeUartData(data);
    netViewPage.handleSerialData(data);
    firmwareUpdateDialog.handleSerialText(data);
    configPage.handleSerialData(data);
}

function onDisconnect() {
    debugLog("serial disconnected");
    stopIntervalSend();
    updateUI(false);
    updatePortList().catch(error => console.error("Port list update failed:", error));
}

const serialManager = new appModules.SerialPortManager(onDataReceived, onDisconnect);
debugLog("serial manager created", { supported: serialManager.isSupported() });
netViewPage = appModules.createNetViewPage({
    serialManager,
    writeTerminal,
});
debugLog("netview page created");
quickSendPanel = appModules.createQuickSendPanel({
    serialManager,
    appendNewlineToggle,
    writeTerminal,
    debugLog,
});
debugLog("quick send panel created");
firmwareUpdateDialog = appModules.createFirmwareUpdateDialog({
    serialManager,
    writeTerminal,
    debugLog,
});
debugLog("firmware update dialog created");
configPage = appModules.createConfigPage({
    serialManager,
    writeTerminal,
    debugLog,
});
debugLog("configuration page created");

async function init() {
    debugLog("init start");
    const autoConnect = localStorage.getItem('autoConnect') === 'true';
    autoConnectToggle.checked = autoConnect;
    debugLog("auto connect setting", { autoConnect });

    await updatePortList();

    if (autoConnect && serialManager.isSupported()) {
        const ports = await serialManager.getAuthorizedPorts();
        debugLog("auto connect ports", { count: ports.length });
        if (ports.length > 0) {
            selectedPortIndex = "0";
            tryConnect(ports[0]);
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
        return;
    }

    const ports = await serialManager.getAuthorizedPorts();
    debugLog("authorized ports loaded", { count: ports.length });
    portSelect.innerHTML = '<option value="request">Select your device...</option>';

    ports.forEach((p, index) => {
        const info = p.getInfo();
        const option = document.createElement('option');
        option.value = index;
        option.text = `Device ${index + 1} (VID:${info.usbVendorId || '?'})`;
        portSelect.appendChild(option);
    });

    portSelect.appendChild(new Option("Add new device...", "request_new"));

    const currentPortIndex = ports.findIndex(port => port === serialManager.port);
    if (currentPortIndex >= 0) {
        selectedPortIndex = String(currentPortIndex);
    }

    if (selectedPortIndex !== "request" && ports[selectedPortIndex]) {
        portSelect.value = selectedPortIndex;
    } else {
        selectedPortIndex = "request";
        portSelect.value = "request";
    }
}

portSelect.addEventListener('change', async () => {
    const selectedValue = portSelect.value;
    if (portSelect.value === 'request_new') {
        try {
            await serialManager.requestNewPort();
            await updatePortList();
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
    try {
        const ports = await serialManager.getAuthorizedPorts();
        const nextPort = ports[selectedValue];
        if (!nextPort || nextPort === serialManager.port) {
            return;
        }

        debugLog("switch serial port start", { selectedValue });
        stopIntervalSend();
        await serialManager.disconnect({ notify: false });
        await serialManager.connect(nextPort, 115200);
        selectedPortIndex = selectedValue;
        updateUI(true);
        await updatePortList();
        configPage.handleDeviceChanged(activeViewId === "view-config");
        debugLog("switch serial port success", { selectedValue });
    } catch (error) {
        debugLog("switch serial port failed", error);
        console.error("Switch port failed:", error);
        alert("Failed to switch device: " + error.message);
        selectedPortIndex = "request";
        updateUI(false);
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

async function tryConnect(targetPort = null) {
    debugLog("tryConnect start", { hasTargetPort: Boolean(targetPort), selectedValue: portSelect.value });
    try {
        let portObj = targetPort;
        if (!portObj) {
            const selectedValue = portSelect.value;
            const ports = await serialManager.getAuthorizedPorts();
            debugLog("tryConnect authorized ports", { count: ports.length, selectedValue });

            if (selectedValue === 'request') {
                portObj = null;
            } else if (ports[selectedValue]) {
                portObj = ports[selectedValue];
                selectedPortIndex = selectedValue;
            }
        }

        debugLog("serial connect call", { hasPortObj: Boolean(portObj), baudRate: 115200 });
        const connectedPort = await serialManager.connect(portObj, 115200);
        if (connectedPort) {
            const ports = await serialManager.getAuthorizedPorts();
            const connectedIndex = ports.findIndex(port => port === connectedPort);
            if (connectedIndex >= 0) {
                selectedPortIndex = String(connectedIndex);
                portSelect.value = selectedPortIndex;
            }
        }
        debugLog("serial connect success");
        updateUI(true);
        if (activeViewId === "view-config") {
            configPage.handleDeviceChanged(true);
        }
    } catch (error) {
        debugLog("serial connect failed", error);
        console.error("Connection failed:", error);
        alert("Failed to connect: " + error.message);
        updateUI(false);
    }
}

async function tryDisconnect() {
    debugLog("tryDisconnect start");
    try {
        stopIntervalSend();
        await serialManager.disconnect();
        selectedPortIndex = "request";
        debugLog("tryDisconnect success");
    } catch (error) {
        debugLog("tryDisconnect failed", error);
        console.error("Disconnect failed:", error);
        updateUI(false);
    }
}

function updateUI(connected) {
    debugLog("updateUI", { connected });
    if (connected) {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnect";
        statusMessage.innerText = "Status: Connected to Serial Device";
        atCommandInput.disabled = false;
        sendCmdBtn.disabled = false;
        sendIntervalInput.disabled = false;
        intervalSendBtn.disabled = false;
        netViewPage.handleConnected();
        configPage.handleConnected();
        quickSendPanel.handleConnected();
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

connectBtn.addEventListener('click', () => {
    debugLog("connect button clicked", { connected: serialManager.isConnected() });
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
        }
        updatePortList();
    });
}

function buildTerminalPayload(text) {
    return appendNewlineToggle.checked ? `${text}\r\n` : text;
}

function formatTerminalEcho(text) {
    return `> ${text}\n`;
}

async function sendCommand({ clearInput = true } = {}) {
    const cmd = atCommandInput.value;
    if (!cmd) return;

    writeTerminal(formatTerminalEcho(cmd));
    try {
        await serialManager.writeText(buildTerminalPayload(cmd));
        addCommandHistory(cmd);
        if (clearInput) {
            atCommandInput.value = '';
        }
    } catch (error) {
        writeTerminal(`Error: ${error.message}\n`);
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
    if (!serialManager.isConnected()) {
        writeTerminal("Error: serial is not connected\n");
        return;
    }

    try {
        await serialManager.writeText(text);
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
