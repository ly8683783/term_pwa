(function () {
    function buildPageDefinitions({
        appModules = window.TermPWA || {},
        serialManager,
        serialSession,
        serialBus,
        debugLog = () => {},
        getPage = () => null,
        switchView = () => {},
        isPageActive = () => false,
    } = {}) {
        return [
            {
                key: "terminal",
                viewId: "view-terminal",
                create: () => appModules.createTerminalPage({
                    rootSelector: "#view-terminal",
                    serialSession,
                    serialBus,
                    debugLog,
                }),
                fallback: () => createNoopPage([
                    "handleConnected",
                    "handleDisconnected",
                    "handleSessionChanged",
                    "handleShown",
                    "writeSystem",
                    "writeError",
                    "writeTxEcho",
                    "clear",
                    "stopIntervalSend",
                ]),
                onShow: page => page.handleShown(),
                onConnected: page => page.handleConnected(),
                onDisconnected: page => page.handleDisconnected(),
                onSessionChanged: page => page.handleSessionChanged(),
                onSerialDisconnect: page => page.handleDisconnected(),
                beforePortSwitch: page => {
                    page.stopIntervalSend();
                    page.handleDisconnected();
                },
                beforeDisconnect: page => page.stopIntervalSend(),
            },
            {
                key: "netview",
                viewId: "view-netview",
                create: () => appModules.createNetViewPage({
                    serialManager,
                    serialSession,
                    writeTerminal: text => {
                        const page = getPage("view-terminal");
                        if (page && typeof page.writeTxEcho === "function") {
                            page.writeTxEcho(text, { hex: false });
                        }
                    },
                }),
                fallback: () => createNoopPage([
                    "handleSerialData",
                    "handleConnected",
                    "handleDisconnected",
                    "handleUnavailable",
                    "handleSessionChanged",
                    "redraw",
                    "stop",
                    "clear",
                    "isCollecting",
                ], {
                    isCollecting: () => false,
                }),
                onShow: page => page.redraw(),
                onHide: (page, toViewId, options = {}) => {
                    const message = options.reason === "unavailable"
                        ? "Status: stopped because NetView is unavailable for this device."
                        : "Status: stopped because NetView page was left.";
                    page.stop(message);
                },
                onConnected: page => page.handleConnected(),
                onDisconnected: (page, message) => page.handleDisconnected(message),
                onUnavailable: (page, message) => page.handleUnavailable(message),
                onSessionChanged: page => page.handleSessionChanged(),
                subscriptions: [
                    { channel: "netview", handler: page => text => page.handleSerialData(text) },
                ],
            },
            {
                key: "netview-wf88",
                viewId: "view-netview-wf88",
                create: () => appModules.createNetViewWF88Page(),
                fallback: () => createNoopPage(["redraw", "stop"]),
                onShow: page => page.redraw(),
                onHide: (page, toViewId, options = {}) => {
                    if (typeof page.stop !== "function") {
                        return;
                    }
                    const message = options.reason === "unavailable"
                        ? "Status: stopped because NetView is unavailable for this device."
                        : "Status: stopped because NetView page was left.";
                    page.stop(message);
                },
            },
            {
                key: "firmware",
                viewId: "view-firmware",
                create: () => appModules.createFirmwareUpdateDialog({
                    serialManager,
                    serialSession,
                    writeTerminal: (...args) => {
                        const page = getPage("view-terminal");
                        if (page && typeof page.writeSystem === "function") {
                            page.writeSystem(...args);
                        }
                    },
                    debugLog,
                    showPage: () => switchView("view-firmware"),
                    isPageActive: () => isPageActive("view-firmware"),
                }),
                fallback: () => createNoopPage(["open", "handleShown", "handleSerialText"]),
                onShow: page => page.handleShown(),
                subscriptions: [
                    { channel: "firmware", handler: page => text => page.handleSerialText(text) },
                ],
            },
            {
                key: "config",
                viewId: "view-config",
                create: () => appModules.createConfigPage({
                    serialManager,
                    serialSession,
                    writeTerminal: (...args) => {
                        const page = getPage("view-terminal");
                        if (page && typeof page.writeSystem === "function") {
                            page.writeSystem(...args);
                        }
                    },
                    debugLog,
                }),
                fallback: () => createNoopPage([
                    "handleSerialData",
                    "handleConnected",
                    "handleDisconnected",
                    "handleUnavailable",
                    "handleShown",
                    "handleDeviceChanged",
                    "handleSessionChanged",
                ]),
                onShow: page => page.handleShown(),
                onConnected: page => page.handleConnected(),
                onDisconnected: page => page.handleDisconnected(),
                onUnavailable: (page, message) => page.handleUnavailable(message),
                onSessionChanged: page => page.handleSessionChanged(),
                afterDeviceConnected: (page, context = {}) => {
                    if (context.activeViewId === "view-config") {
                        page.handleDeviceChanged(true);
                    }
                },
                subscriptions: [
                    { channel: "config", handler: page => text => page.handleSerialData(text) },
                ],
            },
            {
                key: "system-monitor",
                viewId: "view-system-monitor",
                create: () => appModules.createSystemMonitorPage({
                    rootSelector: "#view-system-monitor",
                    debugLog,
                }),
                fallback: () => createNoopPage(["handleShown", "handleHidden", "start", "stop", "clear"]),
                onShow: page => page.handleShown(),
                onHide: page => page.handleHidden(),
            },
        ];
    }

    function createNoopPage(methodNames, methods = {}) {
        const page = { ...methods };
        methodNames.forEach(name => {
            if (typeof page[name] !== "function") {
                page[name] = () => {};
            }
        });
        if (typeof page.dispose !== "function") {
            page.dispose = () => {};
        }
        return page;
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.buildPageDefinitions = buildPageDefinitions;
})();
