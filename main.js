const debugLog = (message, detail) => window.appDebugLog && window.appDebugLog(message, detail);
debugLog("main script start");
const appModules = window.TermPWA || {};
const APP_CACHE_NAME = appModules.APP_VERSION || "unknown";

if (!appModules.createNetViewPage || !appModules.SerialTransport || !appModules.SerialPortStore || !appModules.SerialPortManager || !appModules.createSerialEventBus || !appModules.createSerialSession || !appModules.createTerminalPage || !appModules.createFirmwareUpdateDialog || !appModules.createConfigPage || !appModules.createTerminalLogStore || !appModules.createDeviceDetector || !appModules.hexToBytes) {
    debugLog("script globals missing", {
        createNetViewPage: Boolean(appModules.createNetViewPage),
        SerialTransport: Boolean(appModules.SerialTransport),
        SerialPortStore: Boolean(appModules.SerialPortStore),
        SerialPortManager: Boolean(appModules.SerialPortManager),
        createSerialEventBus: Boolean(appModules.createSerialEventBus),
        createSerialSession: Boolean(appModules.createSerialSession),
        createTerminalPage: Boolean(appModules.createTerminalPage),
        createFirmwareUpdateDialog: Boolean(appModules.createFirmwareUpdateDialog),
        createConfigPage: Boolean(appModules.createConfigPage),
        createTerminalLogStore: Boolean(appModules.createTerminalLogStore),
        createDeviceDetector: Boolean(appModules.createDeviceDetector),
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
const autoDetectToggle = document.getElementById('autoDetectToggle');
const statusMessage = document.getElementById('statusMessage');
const welcomeDetectDeviceBtn = document.getElementById('welcomeDetectDeviceBtn');
const welcomeDeviceName = document.getElementById('welcomeDeviceName');
const welcomeDeviceStatus = document.getElementById('welcomeDeviceStatus');
debugLog("dom refs resolved", {
    connectBtn: Boolean(connectBtn),
    portSelect: Boolean(portSelect),
    autoDetectToggle: Boolean(autoDetectToggle),
});

let netViewPage = null;
let terminalPage = null;
let firmwareUpdateDialog = null;
let configPage = null;
let deviceDetector = null;
let activeViewId = "view-welcome";
let activeDeviceProfileName = "UNKNOWN";
let welcomeStatusText = "Connect a device, then detect it.";
let waitingServiceWorker = null;
let serviceWorkerRefreshing = false;

if (appVersionInfo) {
    appVersionInfo.textContent = `Application Version: ${APP_CACHE_NAME}`;
}
const welcomeVersionInfo = document.getElementById('welcomeVersionInfo');
if (welcomeVersionInfo) {
    welcomeVersionInfo.textContent = `Application Version: ${APP_CACHE_NAME}`;
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
        const feature = item.getAttribute('data-feature');
        if (feature && !hasActiveCapability(feature)) {
            return;
        }
        if (activeViewId === "view-netview" && targetId !== "view-netview") {
            netViewPage.stop("Status: stopped because NetView page was left.");
        }
        switchView(targetId);
    });
});

function onDataReceived(data, bytes) {
    const byteLength = bytes ? bytes.length : data.length;
    debugLog("serial data received", { length: byteLength });
    serialBus.emitData({ text: data, bytes });
}

function onDisconnect() {
    debugLog("serial disconnected");
    if (serialSession) {
        serialSession.reset();
    }
    setActiveDeviceProfile("UNKNOWN", "Serial disconnected.");
    if (terminalPage) {
        terminalPage.handleDisconnected();
    }
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
terminalPage = appModules.createTerminalPage({
    rootSelector: "#view-terminal",
    serialSession,
    serialBus,
    debugLog,
});
debugLog("terminal page created");
netViewPage = appModules.createNetViewPage({
    serialManager,
    serialSession,
    writeTerminal: terminalPage.writeSystem,
});
debugLog("netview page created");
firmwareUpdateDialog = appModules.createFirmwareUpdateDialog({
    serialManager,
    serialSession,
    writeTerminal: terminalPage.writeSystem,
    debugLog,
});
debugLog("firmware update dialog created");
configPage = appModules.createConfigPage({
    serialManager,
    serialSession,
    writeTerminal: terminalPage.writeSystem,
    debugLog,
});
debugLog("configuration page created");
deviceDetector = appModules.createDeviceDetector({
    serialSession,
    serialBus,
    debugLog,
});
debugLog("device detector created");

serialBus.subscribeText("netview", text => netViewPage.handleSerialData(text));
serialBus.subscribeText("firmware", text => firmwareUpdateDialog.handleSerialText(text));
serialBus.subscribeText("config", text => configPage.handleSerialData(text));
updateFeatureVisibility();
renderWelcomeDevice();

async function init() {
    debugLog("init start");
    const autoConnect = localStorage.getItem('autoConnect') === 'true';
    const storedAutoDetect = localStorage.getItem('autoDetect');
    const autoDetect = storedAutoDetect === null ? true : storedAutoDetect === 'true';
    autoConnectToggle.checked = autoConnect;
    autoDetectToggle.checked = autoDetect;
    debugLog("auto connect setting", { autoConnect, autoDetect });

    await updatePortList();

    if (autoConnect && serialManager.isSupported() && !serialManager.isBusy()) {
        const entries = await serialManager.getPortEntries();
        debugLog("auto connect ports", { count: entries.length });
        if (entries.length > 0) {
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
    selectCurrentPort(entries);

    return entries;
}

function selectCurrentPort(entries) {
    const currentPortIndex = entries.findIndex(entry => entry.port === serialManager.port);
    portSelect.value = currentPortIndex >= 0 ? String(currentPortIndex) : "request";
    return currentPortIndex;
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
                    portSelect.value = String(requestedIndex);
                }
            }
        } catch (e) {
            console.error("Device selection cancelled", e);
            await updatePortList();
        }
        return;
    }

    if (selectedValue === "request") {
        await updatePortList();
        return;
    }

    if (!serialManager.isConnected()) {
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
        terminalPage.stopIntervalSend();
        serialSession.reset();
        terminalPage.handleDisconnected();
        setActiveDeviceProfile("UNKNOWN", "Switching serial device...");
        const disconnectPromise = serialManager.disconnect({ notify: false });
        updateUI();
        await disconnectPromise;
        const connectPromise = serialManager.connect(nextPort, 115200);
        updateUI();
        await connectPromise;
        updateUI();
        await updatePortList();
        configPage.handleDeviceChanged(activeViewId === "view-config");
        debugLog("switch serial port success", { selectedValue });
    } catch (error) {
        debugLog("switch serial port failed", error);
        console.error("Switch port failed:", error);
        alert("Failed to switch device: " + error.message);
        updateUI();
        await updatePortList();
    }
}

autoConnectToggle.addEventListener('change', () => {
    localStorage.setItem('autoConnect', autoConnectToggle.checked);
});

autoDetectToggle.addEventListener('change', () => {
    localStorage.setItem('autoDetect', autoDetectToggle.checked);
});

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
            }
        }

        debugLog("serial connect call", { hasPortObj: Boolean(portObj), baudRate: 115200 });
        const connectPromise = serialManager.connect(portObj, 115200);
        updateUI();
        const connectedPort = await connectPromise;
        if (connectedPort) {
            await updatePortList();
        }
        debugLog("serial connect success");
        updateUI();
        if (autoDetectToggle.checked) {
            setActiveDeviceProfile("UNKNOWN", "Detecting device...");
            await detectDevice();
        } else {
            setActiveDeviceProfile("UNKNOWN", "Device connected. Click Detect Device.");
        }
        if (activeViewId === "view-config") {
            configPage.handleDeviceChanged(true);
        }
    } catch (error) {
        debugLog("serial connect failed", error);
        console.error("Connection failed:", error);
        alert("Failed to connect: " + error.message);
        updateUI();
        await updatePortList();
    }
}

async function tryDisconnect() {
    if (serialManager.isBusy()) {
        return;
    }

    debugLog("tryDisconnect start");
    try {
        terminalPage.stopIntervalSend();
        setActiveDeviceProfile("UNKNOWN", "Disconnecting...");
        const disconnectPromise = serialManager.disconnect();
        updateUI();
        await disconnectPromise;
        await updatePortList();
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
        terminalPage.handleDisconnected();
        netViewPage.handleDisconnected("Status: serial connection is busy.");
        configPage.handleDisconnected();
        renderWelcomeDevice("Connecting...");
        return;
    }

    if (state === "disconnecting") {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnecting...";
        statusMessage.innerText = "Status: Disconnecting...";
        terminalPage.handleDisconnected();
        netViewPage.handleDisconnected("Status: serial connection is busy.");
        configPage.handleDisconnected();
        renderWelcomeDevice("Disconnecting...");
        return;
    }

    if (connected) {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnect";
        netViewPage.handleConnected();
        configPage.handleConnected();
        terminalPage.handleConnected();
        updateSessionUI();
        renderWelcomeDevice();
    } else {
        connectBtn.classList.remove('connected');
        connectText.innerText = "Connect";
        statusMessage.innerText = "Status: Disconnected";
        terminalPage.handleDisconnected();
        netViewPage.handleDisconnected();
        configPage.handleDisconnected();
        renderWelcomeDevice("Connect a device, then detect it.");
    }
}

function updateSessionUI() {
    if (!serialManager || !serialManager.isConnected()) {
        return;
    }

    const sessionText = serialSession ? serialSession.getStatusText() : "";

    statusMessage.innerText = sessionText
        ? `Status: Connected to Serial Device (${sessionText})`
        : "Status: Connected to Serial Device";
    terminalPage.handleSessionChanged();
    if (netViewPage && netViewPage.handleSessionChanged) {
        netViewPage.handleSessionChanged();
    }
    if (configPage && configPage.handleSessionChanged) {
        configPage.handleSessionChanged();
    }
    renderWelcomeDevice();
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

if (welcomeDetectDeviceBtn) {
    welcomeDetectDeviceBtn.addEventListener("click", () => {
        detectDevice().catch(error => {
            debugLog("device detect failed", error);
            setWelcomeStatus(`Detect failed: ${error.message}`);
        });
    });
}

async function detectDevice() {
    if (!serialManager.isConnected()) {
        setWelcomeStatus("Connect a device first.");
        return;
    }
    if (serialManager.isBusy()) {
        setWelcomeStatus("Serial is busy. Try again later.");
        return;
    }

    setWelcomeStatus("Checking bootloader...");
    const result = await deviceDetector.detect();
    const profileName = result.profileName || "UNKNOWN";
    const message = result.mode === "bootloader"
        ? "Flashloader detected."
        : result.mode === "application"
            ? `${profileName} application detected.`
            : "Device type is unknown.";

    setActiveDeviceProfile(profileName, message);
    debugLog("device detect result", { profileName, mode: result.mode });
}

function setActiveDeviceProfile(profileName, statusText = "") {
    activeDeviceProfileName = appModules.normalizeDeviceProfileName(profileName) || "UNKNOWN";
    if (statusText) {
        welcomeStatusText = statusText;
    }
    updateFeatureVisibility();
    renderWelcomeDevice();
}

function setWelcomeStatus(statusText) {
    welcomeStatusText = statusText;
    renderWelcomeDevice();
}

function renderWelcomeDevice(statusOverride = "") {
    const profile = appModules.getDeviceProfile
        ? appModules.getDeviceProfile(activeDeviceProfileName)
        : { name: "Unknown", capabilities: ["terminal", "firmwareUpdate"] };
    const connected = serialManager && serialManager.isConnected();
    const busy = serialManager && serialManager.isBusy();

    if (welcomeDeviceName) {
        welcomeDeviceName.textContent = profile.name || "Unknown";
    }
    if (welcomeDeviceStatus) {
        welcomeDeviceStatus.textContent = statusOverride || welcomeStatusText ||
            (connected ? "Device connected. Click Detect Device." : "Connect a device, then detect it.");
    }
    if (welcomeDetectDeviceBtn) {
        welcomeDetectDeviceBtn.disabled = !connected || busy;
        welcomeDetectDeviceBtn.textContent = busy && serialSession.getActiveOwner() === "device-detect"
            ? "Detecting..."
            : "Detect Device";
    }
}

function hasActiveCapability(capability) {
    return appModules.hasDeviceCapability
        ? appModules.hasDeviceCapability(activeDeviceProfileName, capability)
        : false;
}

function updateFeatureVisibility() {
    document.querySelectorAll(".menu-item[data-feature]").forEach(item => {
        const feature = item.getAttribute("data-feature");
        const visible = hasActiveCapability(feature);
        item.hidden = !visible;
        item.setAttribute("aria-hidden", visible ? "false" : "true");
    });

    const activeItem = document.querySelector(`.menu-item[data-target="${activeViewId}"]`);
    if (activeItem && activeItem.hidden) {
        if (activeViewId === "view-netview") {
            netViewPage.stop("Status: stopped because NetView is unavailable for this device.");
        }
        switchView("view-welcome");
    }
}

function switchView(targetId) {
    activeViewId = targetId;

    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    const activeItem = document.querySelector(`.menu-item[data-target="${targetId}"]`);
    if (activeItem && !activeItem.hidden) {
        activeItem.classList.add('active');
    }

    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(targetId);
    if (targetView) {
        targetView.classList.add('active');
    }

    if (targetId === 'view-netview') {
        netViewPage.redraw();
    } else if (targetId === 'view-config') {
        configPage.handleShown();
    } else if (targetId === 'view-terminal') {
        terminalPage.handleShown();
    }
}

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

init().catch(error => {
    debugLog("init failed", error);
    console.error("Initialization failed:", error);
    statusMessage.innerText = `Status: initialization failed - ${error.message}`;
});
