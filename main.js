const debugLog = (message, detail) => window.appDebugLog && window.appDebugLog(message, detail);
debugLog("main script start");
const appModules = window.TermPWA || {};

if (!appModules.createNetViewPage || !appModules.SerialPortManager || !appModules.createFirmwareUpdateDialog || !appModules.createConfigPage) {
    debugLog("script globals missing", {
        createNetViewPage: Boolean(appModules.createNetViewPage),
        SerialPortManager: Boolean(appModules.SerialPortManager),
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

const portSelect = document.getElementById('portSelect');
const connectBtn = document.getElementById('connectBtn');
const connectText = document.getElementById('connectText');
const autoConnectToggle = document.getElementById('autoConnectToggle');
const statusMessage = document.getElementById('statusMessage');
const terminalOutput = document.getElementById('terminalOutput');
const atCommandInput = document.getElementById('atCommandInput');
const sendCmdBtn = document.getElementById('sendCmdBtn');
const appendNewlineToggle = document.getElementById('appendNewlineToggle');
const sendIntervalInput = document.getElementById('sendIntervalInput');
const intervalSendBtn = document.getElementById('intervalSendBtn');
debugLog("dom refs resolved", {
    connectBtn: Boolean(connectBtn),
    portSelect: Boolean(portSelect),
    atCommandInput: Boolean(atCommandInput),
    sendCmdBtn: Boolean(sendCmdBtn),
});

let netViewPage = null;
let firmwareUpdateDialog = null;
let configPage = null;
let intervalSendTimer = null;
let intervalSendBusy = false;

document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        item.classList.add('active');

        const targetId = item.getAttribute('data-target');
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
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function onDataReceived(data) {
    debugLog("serial data received", { length: data.length });
    writeTerminal(data);
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
            portSelect.value = "0";
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
}

portSelect.addEventListener('change', async () => {
    if (portSelect.value === 'request_new') {
        try {
            await serialManager.requestNewPort();
            await updatePortList();
        } catch (e) {
            console.error("Device selection cancelled", e);
        }
        portSelect.value = 'request';
    }
});

autoConnectToggle.addEventListener('change', () => {
    localStorage.setItem('autoConnect', autoConnectToggle.checked);
});

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
            }
        }

        debugLog("serial connect call", { hasPortObj: Boolean(portObj), baudRate: 115200 });
        await serialManager.connect(portObj, 115200);
        debugLog("serial connect success");
        updateUI(true);
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
        if (clearInput) {
            atCommandInput.value = '';
        }
    } catch (error) {
        writeTerminal(`Error: ${error.message}\n`);
    }
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

    intervalSendBtn.textContent = "停止定时发送";
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
        intervalSendBtn.textContent = "开始定时发送";
        intervalSendBtn.classList.remove("active");
    }
}

terminalOutput.addEventListener('click', () => terminalOutput.focus());
terminalOutput.addEventListener('keydown', event => {
    sendTerminalKey(event);
});
sendCmdBtn.addEventListener('click', () => sendCommand());
intervalSendBtn.addEventListener('click', startIntervalSend);
atCommandInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCommand();
});

init().catch(error => {
    debugLog("init failed", error);
    console.error("Initialization failed:", error);
    statusMessage.innerText = `Status: initialization failed - ${error.message}`;
});
