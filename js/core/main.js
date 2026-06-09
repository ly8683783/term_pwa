const debugLog = (message, detail) => window.appDebugLog && window.appDebugLog(message, detail);
debugLog("main script start");
const appModules = window.TermPWA || {};
const APP_CACHE_NAME = appModules.APP_VERSION || "unknown";

if (!appModules.SerialPortManager || !appModules.createSerialEventBus || !appModules.createSerialSession || !appModules.createPageRuntime || !appModules.buildPageDefinitions || !appModules.createUiState) {
    debugLog("core globals missing", {
        SerialPortManager: Boolean(appModules.SerialPortManager),
        createSerialEventBus: Boolean(appModules.createSerialEventBus),
        createSerialSession: Boolean(appModules.createSerialSession),
        createPageRuntime: Boolean(appModules.createPageRuntime),
        buildPageDefinitions: Boolean(appModules.buildPageDefinitions),
        createUiState: Boolean(appModules.createUiState),
    });
    throw new Error("Required core scripts failed to load.");
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

let uiState = null;
let waitingServiceWorker = null;
let serviceWorkerRefreshing = false;
let appDisposed = false;
const pageRegistry = new Map();
const serviceRegistry = new Map();
const pageRuntime = appModules.createPageRuntime({
    pageRegistry,
    hasCapability: hasActiveCapability,
    debugLog,
});
const switchView = pageRuntime.switchView;
const dispatchPageLifecycle = pageRuntime.dispatchPageLifecycle;
const updateFeatureVisibility = pageRuntime.updateFeatureVisibility;

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

pageRuntime.bindMenuNavigation();

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
    uiState.setActiveDeviceProfile("UNKNOWN", "Serial disconnected.");
    dispatchPageLifecycle("onSerialDisconnect");
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
uiState = appModules.createUiState({
    appModules,
    serialManager,
    serialSession,
    statusMessage,
    welcomeDeviceName,
    welcomeDeviceStatus,
    welcomeDetectDeviceBtn,
    onDeviceProfileChanged: updateFeatureVisibility,
});
debugLog("ui state created");
updateFeatureVisibility();
initializePages();
serviceRegistry.set("deviceDetector", createDeviceDetectorSafely());
registerPageSubscriptions();
updateFeatureVisibility();
uiState.renderWelcomeDevice();
window.addEventListener("beforeunload", disposeApp);

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

function initializePages() {
    appModules.buildPageDefinitions({
        appModules,
        serialManager,
        serialSession,
        serialBus,
        debugLog,
        getPage,
        switchView,
        isPageActive: viewId => pageRuntime.getActiveViewId() === viewId,
    }).forEach(definition => {
        const page = createPageSafely(definition);
        definition.page = page;
        definition.unsubscribers = [];
        pageRegistry.set(definition.viewId, definition);
    });
}

function createPageSafely(definition) {
    try {
        const page = definition.create();
        debugLog(`${definition.key} page created`);
        return page || definition.fallback();
    } catch (error) {
        debugLog(`${definition.key} page creation failed`, error);
        console.error(`${definition.key} page creation failed:`, error);
        return definition.fallback();
    }
}

function registerPageSubscriptions() {
    pageRegistry.forEach(definition => {
        (definition.subscriptions || []).forEach(subscription => {
            try {
                const unsubscribe = serialBus.subscribeText(
                    subscription.channel,
                    subscription.handler(definition.page)
                );
                if (typeof unsubscribe === "function") {
                    definition.unsubscribers.push(unsubscribe);
                }
            } catch (error) {
                debugLog(`${definition.key} subscription failed`, error);
                console.error(`${definition.key} subscription failed:`, error);
            }
        });
    });
}

function getPageDefinition(viewId) {
    return pageRegistry.get(viewId) || null;
}

function getPage(viewId) {
    const definition = getPageDefinition(viewId);
    return definition ? definition.page : null;
}

function getService(key) {
    return serviceRegistry.get(key) || null;
}

function disposePage(viewId) {
    const definition = getPageDefinition(viewId);
    if (!definition) {
        return;
    }

    const unsubscribers = Array.isArray(definition.unsubscribers) ? definition.unsubscribers : [];
    while (unsubscribers.length) {
        const unsubscribe = unsubscribers.pop();
        try {
            unsubscribe();
        } catch (error) {
            debugLog(`${definition.key} unsubscribe failed`, error);
            console.error(`${definition.key} unsubscribe failed:`, error);
        }
    }

    if (definition.page && typeof definition.page.dispose === "function") {
        try {
            definition.page.dispose();
        } catch (error) {
            debugLog(`${definition.key} dispose failed`, error);
            console.error(`${definition.key} dispose failed:`, error);
        }
    }

    definition.page = definition.fallback();
    definition.unsubscribers = [];
}

function disposeAllPages() {
    pageRegistry.forEach((definition, viewId) => {
        disposePage(viewId);
    });
}

function disposeService(key) {
    const service = getService(key);
    if (!service) {
        return;
    }

    if (typeof service.dispose === "function") {
        try {
            service.dispose();
        } catch (error) {
            debugLog(`${key} service dispose failed`, error);
            console.error(`${key} service dispose failed:`, error);
        }
    }

    serviceRegistry.delete(key);
}

function disposeAllServices() {
    Array.from(serviceRegistry.keys()).forEach(key => {
        disposeService(key);
    });
}

function disposeApp() {
    if (appDisposed) {
        return;
    }
    appDisposed = true;
    disposeAllPages();
    disposeAllServices();
}

function createDeviceDetectorSafely() {
    try {
        const detector = appModules.createDeviceDetector({
            serialSession,
            serialBus,
            debugLog,
        });
        if (detector) {
            debugLog("device detector created");
            return detector;
        }
        throw new Error("createDeviceDetector returned falsy value");
    } catch (error) {
        debugLog("device detector creation failed", error);
        console.error("device detector creation failed:", error);
        return {
            async detect() {
                return { profileName: "UNKNOWN", mode: "unknown" };
            },
            dispose() {},
        };
    }
}

async function updatePortList() {
    debugLog("updatePortList start", { supported: serialManager.isSupported() });
    if (!serialManager.isSupported()) {
        portSelect.innerHTML = '<option value="unsupported">Web Serial unavailable</option>';
        portSelect.disabled = true;
        autoConnectToggle.disabled = true;
        uiState.setStatusMessageText("Status: Web Serial unavailable");
        dispatchPageLifecycle("onUnavailable", "Status: Web Serial requires Chrome/Chromium over localhost or HTTPS.");
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
    if (selectedValue === 'request_new') {
        try {
            const requestedEntry = await serialManager.requestNewPortEntry();
            const entries = await updatePortList();
            if (requestedEntry) {
                const requestedIndex = entries.findIndex(entry => entry.port === requestedEntry.port);
                if (requestedIndex >= 0) {
                    portSelect.value = String(requestedIndex);
                    await tryConnect(requestedEntry.port);
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

    const entries = await serialManager.getPortEntries();
    const targetPort = entries[selectedValue] && entries[selectedValue].port;
    if (!targetPort) {
        return;
    }

    if (serialManager.isConnected()) {
        if (targetPort === serialManager.port) {
            return;
        }
        await switchConnectedPort(selectedValue);
    } else {
        await tryConnect(targetPort);
    }
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
        dispatchPageLifecycle("beforePortSwitch");
        serialSession.reset();
        uiState.setActiveDeviceProfile("UNKNOWN", "Switching serial device...");
        
        const disconnectPromise = serialManager.disconnect({ notify: false });
        updateUI();
        await disconnectPromise;
        
        await performConnection(nextPort);
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

        await performConnection(portObj);
    } catch (error) {
        debugLog("serial connect failed", error);
        console.error("Connection failed:", error);
        alert("Failed to connect: " + error.message);
        updateUI();
        await updatePortList();
    }
}

async function performConnection(portObj) {
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
        uiState.setActiveDeviceProfile("UNKNOWN", "Detecting device...");
        await detectDevice();
    } else {
        uiState.setActiveDeviceProfile("UNKNOWN", "Device connected. Click Detect Device.");
    }

    dispatchPageLifecycle("afterDeviceConnected", {
        activeViewId: pageRuntime.getActiveViewId(),
        profileName: uiState.getActiveDeviceProfileName(),
    });
}

async function tryDisconnect() {
    if (serialManager.isBusy()) {
        return;
    }

    debugLog("tryDisconnect start");
    try {
        dispatchPageLifecycle("beforeDisconnect");
        uiState.setActiveDeviceProfile("UNKNOWN", "Disconnecting...");
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
        uiState.setStatusMessageText("Status: Connecting...");
        dispatchPageLifecycle("onDisconnected", "Status: serial connection is busy.");
        uiState.renderWelcomeDevice("Connecting...");
        return;
    }

    if (state === "disconnecting") {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnecting...";
        uiState.setStatusMessageText("Status: Disconnecting...");
        dispatchPageLifecycle("onDisconnected", "Status: serial connection is busy.");
        uiState.renderWelcomeDevice("Disconnecting...");
        return;
    }

    if (connected) {
        connectBtn.classList.add('connected');
        connectText.innerText = "Disconnect";
        dispatchPageLifecycle("onConnected");
        updateSessionUI();
        uiState.renderWelcomeDevice();
    } else {
        connectBtn.classList.remove('connected');
        connectText.innerText = "Connect";
        uiState.setStatusMessageValue("Disconnected", "disconnected");
        dispatchPageLifecycle("onDisconnected");
        uiState.renderWelcomeDevice("Connect a device, then detect it.");
    }
}

function updateSessionUI() {
    if (!serialManager || !serialManager.isConnected()) {
        return;
    }

    uiState.setStatusMessageValue("Connected", "connected");
    dispatchPageLifecycle("onSessionChanged");
    uiState.renderWelcomeDevice();
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
            uiState.setWelcomeStatus(`Detect failed: ${error.message}`);
        });
    });
}

async function detectDevice() {
    if (!serialManager.isConnected()) {
        uiState.setWelcomeStatus("Connect a device first.");
        return;
    }
    if (serialManager.isBusy()) {
        uiState.setWelcomeStatus("Serial is busy. Try again later.");
        return;
    }

    uiState.setWelcomeStatus("Checking bootloader...");
    const detector = getService("deviceDetector");
    const result = await detector.detect();
    const profileName = result.profileName || "UNKNOWN";
    const message = result.mode === "bootloader"
        ? "Flashloader detected."
        : result.mode === "application"
            ? `${profileName} application detected.`
            : "Device type is unknown.";

    uiState.setActiveDeviceProfile(profileName, message);
    debugLog("device detect result", { profileName, mode: result.mode });
}

function hasActiveCapability(capability) {
    return uiState ? uiState.hasActiveCapability(capability) : false;
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
    uiState.setStatusMessageText(`Status: initialization failed - ${error.message}`);
});
