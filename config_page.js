(function () {
const CONFIG_HARDWARE_TIMEOUT_MS = 3000;
const CONFIG_READ_IDLE_MS = 900;
const CONFIG_PROFILES = {
LR71: {
    format: "lr71-config-v1",
    groups: ["System", "UART", "Mesh", "LoRa Radio", "Timing", "Bypass / Sleep", "Advanced"],
    items: [
    { varNo: 1, name: "BuildVersion", group: "System", control: "readonly", ro: true, defaultValue: "", range: "Read only", description: "Firmware build version." },
    { varNo: 2, name: "DeviceName", group: "System", control: "text", defaultValue: "ART 0001", range: "Text", description: "Device display name. Firmware may render it from NodeAddr." },
    { varNo: 3, name: "MACADDR", group: "System", control: "readonly", ro: true, defaultValue: "00043e2600a2", range: "Read only", description: "Production MAC address." },
    { varNo: 4, name: "MeshName", group: "Mesh", control: "text", defaultValue: "Amp'ed LoRa!", range: "Text", description: "Mesh network name." },
    { varNo: 5, name: "MeshKey", group: "Mesh", control: "text", defaultValue: "12345678", range: "Text", description: "Mesh network key." },
    { varNo: 6, name: "AuthType", group: "Mesh", control: "select", defaultValue: "0", options: [["0", "NONE"], ["1", "AES-128"]], range: "0=NONE, 1=AES-128", description: "Authentication mode." },
    { varNo: 7, name: "UartBaudrate", group: "UART", control: "select", defaultValue: "115200", options: ["300", "1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"], range: "300 - 921600", description: "Main UART baud rate." },
    { varNo: 8, name: "UartParity", group: "UART", control: "select", defaultValue: "none", options: ["none", "even", "odd"], range: "none, even, odd", description: "Main UART parity." },
    { varNo: 9, name: "UartDataBits", group: "UART", control: "select", defaultValue: "8", options: ["5", "6", "7", "8"], range: "5, 6, 7, 8", description: "Main UART data bits." },
    { varNo: 10, name: "UartStopBits", group: "UART", control: "select", defaultValue: "1", options: ["1", "2"], range: "1, 2", description: "Main UART stop bits." },
    { varNo: 11, name: "UartFlowControl", group: "UART", control: "bool", defaultValue: "false", range: "true, false, 1, 0", description: "Enable UART hardware flow control." },
    { varNo: 12, name: "UartTimeout", group: "UART", control: "number", defaultValue: "16", min: 0, max: 65535, range: "0 - 65535", description: "UART character timeout." },
    { varNo: 13, name: "CpuMHz", group: "System", control: "select", defaultValue: "50", options: ["16", "32", "48", "50", "64", "80", "96", "100", "112", "128", "144", "150", "160", "176", "192", "200"], range: "Supported CPU clocks", description: "CPU clock in MHz." },
    { varNo: 15, name: "MeshRelay", group: "Mesh", control: "bool", defaultValue: "false", range: "bool", description: "Enable this device as a Mesh relay node." },
    { varNo: 16, name: "MeshProxy", group: "Mesh", control: "bool", defaultValue: "true", range: "bool", description: "Enable Mesh proxy feature." },
    { varNo: 17, name: "MeshFriend", group: "Mesh", control: "bool", defaultValue: "false", range: "bool", description: "Enable Mesh friend feature." },
    { varNo: 18, name: "MeshLPN", group: "Mesh", control: "bool", defaultValue: "false", range: "bool", description: "Enable low power node mode." },
    { varNo: 19, name: "ProvisionStatus", group: "Mesh", control: "bool", defaultValue: "false", range: "bool", description: "Provisioning status." },
    { varNo: 20, name: "LoraTxPower", group: "LoRa Radio", control: "number", defaultValue: "6", min: 0, max: 15, range: "0 - 15", description: "LoRa transmit power setting." },
    { varNo: 21, name: "LoraChannel", group: "LoRa Radio", control: "number", defaultValue: "29", min: 0, max: 60, range: "0 - 60", description: "LoRa RF channel index." },
    { varNo: 22, name: "LoraCADInterval", group: "LoRa Radio", control: "number", defaultValue: "500", min: 0, max: 65535, range: "0 - 65535 ms", description: "Legacy CAD interval in milliseconds." },
    { varNo: 23, name: "LoraLoraBand", group: "LoRa Radio", control: "readonly", ro: true, defaultValue: "EU915", range: "Read only", description: "LoRa band/frequency display." },
    { varNo: 24, name: "LoraRfOffset", group: "LoRa Radio", control: "number", defaultValue: "0", range: "-2147483648 - 2147483647", description: "RF frequency offset." },
    { varNo: 26, name: "LoraAirDataRate", group: "LoRa Radio", control: "select", defaultValue: "4800", options: ["4800", "9600", "19200", "38400"], range: "300 - 62500", description: "LoRa air data rate. Common LR71 values are listed." },
    { varNo: 27, name: "LoraSF", group: "LoRa Radio", control: "select", defaultValue: "9", options: [["6", "6:64"], ["7", "7:128"], ["8", "8:256"], ["9", "9:512"], ["10", "10:1024"], ["11", "11:2048"], ["12", "12:4096"]], range: "6 - 12", description: "LoRa spreading factor." },
    { varNo: 30, name: "LoraPANID", group: "LoRa Radio", control: "number", defaultValue: "255", min: 255, max: 65280, range: "255 - 65280", description: "LoRa PAN ID." },
    { varNo: 31, name: "LoraPayloadLen", group: "LoRa Radio", control: "number", defaultValue: "128", min: 0, max: 255, range: "0 - 255", description: "LoRa payload length." },
    { varNo: 32, name: "HostEvents", group: "Bypass / Sleep", control: "bool", defaultValue: "true", range: "bool", description: "Enable host event output strings." },
    { varNo: 35, name: "Hardware", group: "System", control: "readonly", ro: true, defaultValue: "LR71", range: "Read only", description: "Hardware model." },
    { varNo: 36, name: "OutMtuSize", group: "System", control: "number", defaultValue: "400", range: "UDP:1-1472, TCP:1-1460", description: "Output MTU size." },
    { varNo: 37, name: "MaxTTL", group: "Mesh", control: "number", defaultValue: "2", min: 0, max: 255, range: "0 - 255", description: "Maximum Mesh TTL." },
    { varNo: 38, name: "HostShallowSleepEn", group: "Bypass / Sleep", control: "bool", defaultValue: "false", range: "bool", description: "Enable host shallow sleep." },
    { varNo: 39, name: "HostDeepSleepEn", group: "Bypass / Sleep", control: "bool", defaultValue: "false", range: "bool", description: "Enable host deep sleep." },
    { varNo: 40, name: "NodeAddr", group: "Mesh", control: "hex", defaultValue: "0000", range: "0000 - FFFF", description: "Local node address." },
    { varNo: 41, name: "PublishAddr", group: "Mesh", control: "hex", defaultValue: "C001", range: "0000 - FFFF", description: "Publish address." },
    { varNo: 42, name: "SubscribeAddr", group: "Mesh", control: "text", defaultValue: "C001", range: "0000 - FFFF, space separated", description: "Subscribe address list." },
    { varNo: 43, name: "DefaultDstAddr", group: "Mesh", control: "hex", defaultValue: "0000", range: "0000 - FFFF", description: "Default destination address." },
    { varNo: 45, name: "AckTimeout", group: "Timing", control: "text", defaultValue: "auto", range: "auto, 1 - 254, disabled", description: "ACK timeout. Use auto for computed timeout or disabled to disable." },
    { varNo: 46, name: "LoraTxRpt", group: "Timing", control: "number", defaultValue: "1", min: 1, max: 5, range: "1 - 5", description: "LoRa transmit repeat count." },
    { varNo: 48, name: "LoraScanRpt", group: "Timing", control: "number", defaultValue: "4", min: 0, max: 255, range: "0 - 255", description: "LoraDiscovery/LoraNet scan repeat count." },
    { varNo: 49, name: "LoraScanInterval", group: "Timing", control: "number", defaultValue: "7", min: 0, max: 255, range: "0 - 255", description: "Scan interval multiplier. Runtime interval is this value times mesh_LoraTxInterval()." },
    { varNo: 50, name: "LoRaRmtPin", group: "System", control: "text", defaultValue: "123456", range: "000000 - ffffff", description: "Remote command PIN, six hex characters." },
    { varNo: 51, name: "LoRaRxPeriod", group: "Bypass / Sleep", control: "number", defaultValue: "100", min: 0, range: "0 - 4294967295", description: "Sniff RX period." },
    { varNo: 52, name: "LoRaSleepPeriod", group: "Bypass / Sleep", control: "number", defaultValue: "900", min: 0, range: "0 - 4294967295", description: "Sniff sleep period." },
    { varNo: 53, name: "GPIO_Wakeup", group: "Bypass / Sleep", control: "select", defaultValue: "none", options: ["none", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], range: "none, 0 - 15", description: "GPIO wakeup pin." },
    { varNo: 54, name: "GrpAckWindow", group: "Timing", control: "number", defaultValue: "4", min: 1, max: 8, range: "1 - 8", description: "Group ACK random window." },
    { varNo: 55, name: "AckEn", group: "Mesh", control: "bool", defaultValue: "true", range: "bool", description: "Enable ACK handling." },
    { varNo: 56, name: "MeshEn", group: "Mesh", control: "bool", defaultValue: "false", range: "bool", description: "Enable Mesh behavior." },
    { varNo: 57, name: "CpaXta", group: "Advanced", control: "number", defaultValue: "12", min: 0, max: 255, range: "0 - 255", description: "LR71 crystal capacitor XTA trim." },
    { varNo: 58, name: "CpaXtb", group: "Advanced", control: "number", defaultValue: "12", min: 0, max: 255, range: "0 - 255", description: "LR71 crystal capacitor XTB trim." },
    { varNo: 59, name: "EnableEncryption", group: "Mesh", control: "bool", defaultValue: "true", range: "bool", description: "Enable encryption." },
    { varNo: 60, name: "WTDEnable", group: "System", control: "bool", defaultValue: "true", range: "bool", description: "Enable watchdog." },
    { varNo: 61, name: "LoraMsgMax", group: "LoRa Radio", control: "number", defaultValue: "200", min: 0, max: 255, range: "0 - 255", description: "Maximum LoRa message length when no ACK is required." },
    { varNo: 62, name: "TermChar", group: "Bypass / Sleep", control: "number", defaultValue: "126", min: 0, max: 255, range: "0 - 255", description: "Bypass terminal character. 126 is '~'." },
    { varNo: 63, name: "EscSeq", group: "Bypass / Sleep", control: "text", defaultValue: "^#^$^%", range: "Text, max 6 recommended", description: "Escape sequence for bypass/hex mode." },
    { varNo: 64, name: "BypassMode", group: "Bypass / Sleep", control: "bool", defaultValue: "false", range: "bool", description: "Enable bypass mode." },
    { varNo: 65, name: "BypassTimeout", group: "Bypass / Sleep", control: "number", defaultValue: "5", min: 0, max: 255, range: "0 - 255", description: "Bypass send timeout." },
    { varNo: 66, name: "MeshRelayDelay", group: "Timing", control: "number", defaultValue: "2", min: 2, max: 5, range: "2 - 5", description: "Legacy Mesh relay delay parameter." },
    { varNo: 67, name: "RelayAckEn", group: "Timing", control: "bool", defaultValue: "false", range: "bool", description: "Enable relay ACK mechanism." },
    { varNo: 68, name: "RelayRptMax", group: "Timing", control: "number", defaultValue: "3", min: 0, max: 255, range: "0 - 255", description: "Maximum relay repeat count." },
    { varNo: 69, name: "CadMode", group: "LoRa Radio", control: "select", defaultValue: "1", options: [["0", "Disabled"], ["1", "Dynamic Delay"]], range: "0 - 1", description: "CAD mode. 0 disables CAD-assisted timing; 1 enables dynamic CAD delay." },
    ],
},
WF88: {
    format: "wf88-config-v1",
    groups: [],
    items: [],
},
};

function createConfigPage({
    serialManager,
    serialSession,
    writeTerminal = () => {},
    debugLog = () => {},
    rootSelector = "#configPage",
} = {}) {
    const root = document.querySelector(rootSelector);
    let activeProfileContext = null;
    let itemByVar = new Map();
    let itemByName = new Map();
    let values = new Map();
    const deviceValues = new Map();
    const loaded = new Set();
    const dirty = new Set();
    let connected = false;
    let readBuffer = "";
    let readTimer = null;
    let readMode = null;
    let autoReadDone = false;
    let sessionToken = null;
    let pendingImport = null;
    let activeTooltipAnchor = null;

    if (!root) {
        return emptyConfigPage();
    }

    const floatingTooltip = createFloatingTooltip();

    render();

    function render() {
        root.innerHTML = `
            <div class="config-toolbar">
                <div>
                    <h2>Configuration</h2>
                    <div id="configStatus" class="config-status">Connect serial and click Read From Device.</div>
                </div>
                <div class="config-actions">
                    <button id="configReadBtn" type="button">Read From Device</button>
                    <button id="configApplyBtn" type="button">Apply Changed</button>
                    <button id="configExportBtn" type="button">Export JSON</button>
                    <button id="configImportBtn" type="button">Import JSON</button>
                    <input id="configImportInput" type="file" accept="application/json,.json" hidden>
                </div>
            </div>
            <div id="configGrid" class="config-grid"></div>
        `;

        const grid = root.querySelector("#configGrid");
        const columns = [];
        for (let i = 0; i < 3; i++) {
            const column = document.createElement("div");
            column.className = "config-column";
            grid.appendChild(column);
            columns.push(column);
        }

        getActiveGroups().forEach((group, index) => {
            const items = getActiveItems().filter(item => item.group === group);
            const card = document.createElement("section");
            card.className = "config-card";
            card.innerHTML = `<h3>${escapeHtml(group)}</h3>`;
            for (const item of items) {
                card.appendChild(createRow(item));
            }
            columns[index % columns.length].appendChild(card);
        });

        root.querySelector("#configReadBtn").addEventListener("click", () => probeHardwareThenRead().catch(handleError));
        root.querySelector("#configApplyBtn").addEventListener("click", () => applyChanged().catch(handleError));
        root.querySelector("#configExportBtn").addEventListener("click", () => exportJson().catch(handleError));
        root.querySelector("#configImportBtn").addEventListener("click", () => chooseImportJson().catch(handleError));
        root.querySelector("#configImportInput").addEventListener("change", event => importJson(event).catch(handleError));

        updateButtons();
    }

    function createRow(item) {
        const row = document.createElement("div");
        row.className = "config-row";
        row.dataset.varNo = String(item.varNo);
        row.innerHTML = `
            <label class="config-label" for="config-var-${item.varNo}">${escapeHtml(item.name)}</label>
            <div class="config-diff-area">
                <span class="config-original-value"></span>
                <span class="config-diff-arrow" tabindex="0">--&gt;</span>
            </div>
            <div class="config-control"></div>
            <span class="config-help" tabindex="0">?
                <span class="config-tooltip" id="config-tip-${item.varNo}">
                    <strong>var${String(item.varNo).padStart(2, "0")} ${escapeHtml(item.name)}</strong><br>
                    ${escapeHtml(item.description || "")}<br>
                    <em>Range: ${escapeHtml(item.range || "")}</em><br>
                    <em>Set: at+ab config var${item.varNo}=value</em>
                </span>
            </span>
        `;
        row.querySelector(".config-control").appendChild(createControl(item));
        bindHelpTooltip(row);
        return row;
    }

    function bindHelpTooltip(row) {
        const help = row.querySelector(".config-help");
        if (!help) return;

        help.addEventListener("mouseenter", () => showFloatingTooltip(help));
        help.addEventListener("focus", () => showFloatingTooltip(help));
        help.addEventListener("mouseleave", hideFloatingTooltip);
        help.addEventListener("blur", hideFloatingTooltip);
    }

    function createControl(item) {
        if (item.control === "bool") {
            const label = document.createElement("label");
            label.className = "switch config-switch";
            label.innerHTML = `<input id="config-var-${item.varNo}" type="checkbox"><span class="slider"></span>`;
            const input = label.querySelector("input");
            input.addEventListener("change", () => setValue(item, input.checked ? "true" : "false", true));
            return label;
        }

        if (item.control === "select") {
            const select = document.createElement("select");
            select.id = `config-var-${item.varNo}`;
            for (const option of item.options || []) {
                const value = Array.isArray(option) ? option[0] : option;
                const label = Array.isArray(option) ? option[1] : option;
                select.appendChild(new Option(label, value));
            }
            select.addEventListener("change", () => setValue(item, select.value, true));
            return select;
        }

        const input = document.createElement("input");
        input.id = `config-var-${item.varNo}`;
        input.type = item.control === "password" ? "password" : item.control === "number" ? "number" : "text";
        if (item.min !== undefined) input.min = item.min;
        if (item.max !== undefined) input.max = item.max;
        input.addEventListener("input", () => setValue(item, normalizeInput(item, input.value), true));
        return input;
    }

    function setValue(item, value, userChanged) {
        const normalized = normalizeValue(item, value);
        values.set(item.varNo, normalized);
        if (userChanged && !isReadonlyItem(item) && loaded.has(item.varNo)) {
            if (normalized === (deviceValues.get(item.varNo) || "")) {
                dirty.delete(item.varNo);
            } else {
                dirty.add(item.varNo);
            }
        }
        updateControl(item);
        updateRowState(item);
        updateButtons();
    }

    function updateControl(item) {
        const control = root.querySelector(`#config-var-${item.varNo}`);
        if (!control) return;
        const value = values.get(item.varNo) || "";
        control.disabled = isItemDisabled(item);
        if (item.control === "bool") {
            control.checked = value === "true" || value === "1";
        } else if (item.control === "select") {
            ensureSelectOption(control, value);
            control.value = value;
        } else {
            control.value = value;
        }
    }

    function updateRowState(item) {
        const row = root.querySelector(`.config-row[data-var-no="${item.varNo}"]`);
        if (!row) return;
        const isReadonly = isReadonlyItem(item);
        const isMissing = connected && !isReading() && !loaded.has(item.varNo);
        row.classList.toggle("readonly", isReadonly);
        row.classList.toggle("missing", isMissing);
        row.classList.toggle("changed", dirty.has(item.varNo));
        updateInlineDiff(item);
        updateTooltip(item);
    }

    function updateButtons() {
        const readBtn = root.querySelector("#configReadBtn");
        const applyBtn = root.querySelector("#configApplyBtn");
        const exportBtn = root.querySelector("#configExportBtn");
        const importBtn = root.querySelector("#configImportBtn");
        const canUseSession = connected && serialSession.canWrite("config");
        if (readBtn) readBtn.disabled = !canUseSession || isReading();
        if (applyBtn) applyBtn.disabled = !canUseSession || isReading() || !hasActiveProfile() || dirty.size === 0;
        if (exportBtn) exportBtn.disabled = isReading() || !hasActiveProfile() || loaded.size === 0;
        if (importBtn) importBtn.disabled = isReading() || !hasActiveProfile() || loaded.size === 0;
    }

    async function probeHardwareThenRead() {
        ensureConnected();
        beginSession();
        readMode = "hardware";
        readBuffer = "";
        clearDeviceState();
        setActiveProfile(null);
        setStatus("Detecting hardware...");
        updateButtons();
        await serialSession.writeATCommand("config", "at+ab config Hardware");
        writeTerminal("> [Configuration] at+ab config Hardware\n");
        armHardwareTimer();
    }

    async function readFromDevice() {
        ensureConnected();
        if (!hasActiveProfile()) {
            throw new Error("hardware profile is not selected");
        }
        readMode = "config";
        readBuffer = "";
        loaded.clear();
        dirty.clear();
        deviceValues.clear();
        getActiveItems().forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        setStatus("Reading configuration...");
        updateButtons();
        await serialSession.writeATCommand("config", "at+ab config");
        writeTerminal("> [Configuration] at+ab config\n");
        armConfigReadTimer();
    }

    async function applyChanged() {
        ensureConnected();
        const pending = Array.from(dirty).sort((a, b) => a - b);
        if (pending.length === 0) return;

        beginSession();
        setStatus(`Applying ${pending.length} changed item(s)...`);
        for (const varNo of pending) {
            const item = itemByVar.get(varNo);
            if (!item || isReadonlyItem(item) || !loaded.has(varNo)) continue;
            const value = normalizeForCommand(item, values.get(varNo) || "");
            const cmd = `at+ab config var${varNo}=${value}`;
            await serialSession.writeATCommand("config", cmd);
            writeTerminal(`> [Configuration] ${cmd}\n`);
            await sleep(120);
        }
        dirty.clear();
        getActiveItems().forEach(updateRowState);
        updateButtons();
        setStatus("Apply complete. Refreshing from device...");
        await sleep(300);
        await probeHardwareThenRead();
    }

    function handleSerialData(text) {
        if (!isReading()) return;
        readBuffer += text;
        if (readMode === "hardware") {
            const hardware = parseHardwareName(readBuffer);
            if (hardware) {
                finishHardwareProbe(hardware);
            }
            return;
        }
        armConfigReadTimer();
    }

    function armHardwareTimer() {
        clearTimeout(readTimer);
        readTimer = setTimeout(() => finishHardwareProbe(null), CONFIG_HARDWARE_TIMEOUT_MS);
    }

    function armConfigReadTimer() {
        clearTimeout(readTimer);
        readTimer = setTimeout(finishRead, CONFIG_READ_IDLE_MS);
    }

    function finishHardwareProbe(hardware) {
        if (readMode !== "hardware") return;

        clearTimeout(readTimer);
        readTimer = null;
        readMode = null;

        if (!hardware) {
            clearPendingImport();
            setActiveProfile(null);
            setStatus("Failed to detect hardware. Configuration is disabled.");
            updateButtons();
            endSession();
            return;
        }

        const profileName = findProfileName(hardware);
        if (!profileName || !CONFIG_PROFILES[profileName].items.length) {
            clearPendingImport();
            setActiveProfile(null);
            setStatus(`Unsupported hardware: ${hardware}. Configuration is disabled.`);
            updateButtons();
            endSession();
            return;
        }

        setActiveProfile(profileName);
        setStatus(`Detected hardware: ${profileName}. Reading configuration...`);
        readFromDevice().catch(handleError);
    }

    function finishRead() {
        if (readMode !== "config") return;

        let count = 0;
        const re = /^var(\d+)\s+(.+?)\s*=\s*(.*)$/gm;
        let match;
        while ((match = re.exec(readBuffer)) !== null) {
            const varNo = Number(match[1]);
            const name = match[2].trim();
            const value = match[3].trim();
            const item = itemByVar.get(varNo) || itemByName.get(name.toLowerCase());
            if (!item) continue;
            const normalized = normalizeValue(item, value);
            loaded.add(item.varNo);
            values.set(item.varNo, normalized);
            deviceValues.set(item.varNo, normalized);
            dirty.delete(item.varNo);
            updateControl(item);
            updateRowState(item);
            count++;
        }
        readMode = null;
        getActiveItems().forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        const missing = getActiveItems().length - loaded.size;
        setStatus(count ? `Loaded ${loaded.size} item(s). ${missing} item(s) not returned.` : "No config rows parsed.");
        updateButtons();
        endSession();
        try {
            applyPendingImport();
        } catch (error) {
            handleError(error);
        }
    }

    async function exportJson() {
        const data = {
            hardware: getActiveProfileName(),
            format: getActiveProfile().format,
            exportedAt: new Date().toISOString(),
            items: getActiveItems().map(item => ({
                varNo: item.varNo,
                name: item.name,
                value: values.get(item.varNo) || "",
                loaded: loaded.has(item.varNo),
                readonly: isReadonlyItem(item),
            })),
        };
        const text = JSON.stringify(data, null, 2);
        const suggestedName = `${getActiveProfileName().toLowerCase()}-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        const picker = window.TermPWA.filePicker;
        if (picker && picker.supportsSavePicker()) {
            const saved = await picker.saveConfigJson({ suggestedName, text });
            if (saved) {
                setStatus(`Exported ${suggestedName}.`);
            }
            return;
        }

        if (picker) {
            picker.downloadTextFile({
                suggestedName,
                text,
                type: "application/json",
            });
            setStatus(`Exported ${suggestedName}.`);
        } else {
            const blob = new Blob([text], { type: "application/json" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = suggestedName;
            link.click();
            URL.revokeObjectURL(link.href);
            setStatus(`Exported ${suggestedName}.`);
        }
    }

    async function chooseImportJson() {
        const picker = window.TermPWA.filePicker;
        if (picker && picker.supportsOpenPicker()) {
            const picked = await picker.openConfigJson();
            if (!picked) {
                return;
            }
            await importJsonText(picked.text, picked.name);
            return;
        }

        const input = root.querySelector("#configImportInput");
        input.value = "";
        input.click();
    }

    async function importJson(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        await importJsonText(await file.text(), file.name);
    }

    async function importJsonText(text, fileName) {
        const data = JSON.parse(text);
        validateImportShape(data);

        ensureConnected();
        if (isReading()) {
            throw new Error("Configuration is busy. Try again after current read completes.");
        }

        pendingImport = createPendingImport(data, fileName);
        setStatus(`Import selected: ${fileName}. Reading current device configuration before diff...`);
        await probeHardwareThenRead();
    }

    function handleConnected() {
        connected = true;
        setStatus("Connected. Open Configuration or click Read From Device.");
        updateButtons();
    }

    function handleDisconnected() {
        connected = false;
        readMode = null;
        autoReadDone = false;
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        clearDeviceState();
        setActiveProfile(null);
        setStatus("Disconnected.");
        updateButtons();
    }

    function handleUnavailable(message) {
        connected = false;
        readMode = null;
        autoReadDone = false;
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        clearDeviceState();
        setActiveProfile(null);
        setStatus(message);
        updateButtons();
    }

    function handleShown() {
        if (connected && !autoReadDone && !isReading()) {
            autoReadDone = true;
            probeHardwareThenRead().catch(handleError);
        }
    }

    function handleDeviceChanged(isConfigVisible = false) {
        readMode = null;
        autoReadDone = false;
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        clearDeviceState();
        setActiveProfile(null);
        setStatus("Device changed. Configuration must be read again.");
        updateButtons();
        if (connected && isConfigVisible) {
            autoReadDone = true;
            probeHardwareThenRead().catch(handleError);
        }
    }

    function handleSessionChanged() {
        updateButtons();
        if (connected && !isReading() && serialSession.isBusy() && !serialSession.canWrite("config")) {
            setStatus(serialSession.getStatusText());
        } else if (connected && !isReading() && !hasActiveProfile()) {
            setStatus("Connected. Open Configuration or click Read From Device.");
        }
    }

    function setStatus(message) {
        const el = root.querySelector("#configStatus");
        if (el) el.textContent = message;
    }

    function handleError(error) {
        readMode = null;
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        setStatus(`Error: ${error.message}`);
        updateButtons();
        debugLog("config page error", error);
    }

    function ensureConnected() {
        if (!connected || !serialManager.isConnected()) {
            throw new Error("serial is not connected");
        }
    }

    function beginSession() {
        if (!sessionToken) {
            sessionToken = serialSession.acquire("config", "Configuration");
        }
    }

    function endSession() {
        if (!sessionToken) {
            return;
        }
        sessionToken.release();
        sessionToken = null;
    }

    function isReadonlyItem(item) {
        return item.ro || item.control === "readonly";
    }

    function isItemDisabled(item) {
        return !connected || isReading() || !hasActiveProfile() || isReadonlyItem(item) || !loaded.has(item.varNo);
    }

    function updateTooltip(item) {
        const tip = root.querySelector(`#config-tip-${item.varNo}`);
        if (!tip) return;

        let status = "Writable";
        if (isReadonlyItem(item)) {
            status = "Read only";
        } else if (!loaded.has(item.varNo)) {
            status = "Not returned by at+ab config";
        }

        tip.innerHTML = `
            <strong>var${String(item.varNo).padStart(2, "0")} ${escapeHtml(item.name)}</strong><br>
            ${escapeHtml(item.description || "")}<br>
            <em>Range: ${escapeHtml(item.range || "")}</em><br>
            <em>Status: ${escapeHtml(status)}</em><br>
            <em>Set: at+ab config var${item.varNo}=value</em>
        `;
        if (activeTooltipAnchor && activeTooltipAnchor.contains(tip)) {
            showFloatingTooltip(activeTooltipAnchor);
        }
    }

    function createFloatingTooltip() {
        const tooltip = document.createElement("div");
        tooltip.className = "config-floating-tooltip";
        document.body.appendChild(tooltip);

        window.addEventListener("resize", hideFloatingTooltip);
        window.addEventListener("scroll", hideFloatingTooltip, true);
        return tooltip;
    }

    function showFloatingTooltip(anchor) {
        const tip = anchor.querySelector(".config-tooltip");
        if (!tip) return;

        activeTooltipAnchor = anchor;
        floatingTooltip.innerHTML = tip.innerHTML;
        floatingTooltip.classList.add("visible");
        positionFloatingTooltip(anchor);
    }

    function hideFloatingTooltip() {
        activeTooltipAnchor = null;
        floatingTooltip.classList.remove("visible");
    }

    function positionFloatingTooltip(anchor) {
        const rect = anchor.getBoundingClientRect();
        const tipRect = floatingTooltip.getBoundingClientRect();
        const margin = 8;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        let left = rect.right - tipRect.width;
        let top = rect.bottom + 5;

        left = Math.max(margin, Math.min(left, viewportWidth - tipRect.width - margin));
        if (top + tipRect.height + margin > viewportHeight) {
            top = Math.max(margin, rect.top - tipRect.height - 5);
        }

        floatingTooltip.style.left = `${left}px`;
        floatingTooltip.style.top = `${top}px`;
    }

    function updateInlineDiff(item) {
        const row = root.querySelector(`.config-row[data-var-no="${item.varNo}"]`);
        if (!row) return;

        const originalEl = row.querySelector(".config-original-value");
        const arrowEl = row.querySelector(".config-diff-arrow");
        if (!originalEl || !arrowEl) return;

        const isChanged = dirty.has(item.varNo);
        if (!isChanged) {
            originalEl.textContent = "";
            originalEl.removeAttribute("title");
            arrowEl.removeAttribute("title");
            return;
        }

        const deviceValue = getDeviceValue(item);
        const pendingValue = getPendingValue(item);
        originalEl.textContent = formatConfigValueForDiff(deviceValue);
        originalEl.title = deviceValue;
        arrowEl.title = `Device value: ${deviceValue}\nPending value: ${pendingValue}`;
    }

    function getDeviceValue(item) {
        return deviceValues.get(item.varNo) || "";
    }

    function getPendingValue(item) {
        return values.get(item.varNo) || "";
    }

    function formatConfigValueForDiff(value) {
        return String(value || "");
    }

    function clearDeviceState() {
        loaded.clear();
        dirty.clear();
        deviceValues.clear();
        values = new Map(getActiveItems().map(item => [item.varNo, item.defaultValue || ""]));
    }

    function validateImportShape(data) {
        if (!data || typeof data !== "object" || !data.format || !Array.isArray(data.items)) {
            throw new Error("Invalid config JSON");
        }
    }

    function createPendingImport(data, fileName) {
        return {
            data,
            fileName: fileName || "config.json",
        };
    }

    function clearPendingImport() {
        pendingImport = null;
    }

    function applyPendingImport() {
        if (!pendingImport) {
            return;
        }

        const request = pendingImport;
        pendingImport = null;
        applyImportedJson(request.data, request.fileName);
    }

    function applyImportedJson(data, fileName) {
        if (!hasActiveProfile() || data.format !== getActiveProfile().format) {
            throw new Error(`Invalid ${getActiveProfileName()} config JSON`);
        }

        const summary = buildImportSummary(data);
        applyImportSummary(summary);
        setStatus(summary.changed
            ? `Imported ${summary.changed} changed writable item(s) from ${fileName}. Click Apply Changed to write them.`
            : `Imported ${fileName}; JSON matches current device configuration.`);
    }

    function buildImportSummary(data) {
        const summary = {
            changed: 0,
            unchanged: 0,
            skippedReadonly: 0,
            skippedMissing: 0,
            skippedUnsupported: 0,
            skippedNameMismatch: 0,
            changes: [],
        };

        for (const imported of data.items) {
            const item = itemByVar.get(Number(imported.varNo));
            if (!item) {
                summary.skippedUnsupported++;
                continue;
            }
            if (imported.name && imported.name !== item.name) {
                summary.skippedNameMismatch++;
                continue;
            }
            if (isReadonlyItem(item)) {
                summary.skippedReadonly++;
                continue;
            }
            if (!loaded.has(item.varNo)) {
                summary.skippedMissing++;
                continue;
            }

            const currentValue = values.get(item.varNo) || "";
            const importedValue = normalizeValue(item, String(imported.value ?? ""));
            if (importedValue === currentValue) {
                summary.unchanged++;
                continue;
            }

            summary.changed++;
            summary.changes.push({
                item,
                value: importedValue,
                previousValue: currentValue,
            });
        }

        return summary;
    }

    function applyImportSummary(summary) {
        for (const change of summary.changes) {
            setValue(change.item, change.value, true);
        }
    }

    function setActiveProfile(profileName) {
        const profile = profileName ? CONFIG_PROFILES[profileName] : null;
        activeProfileContext = profile ? { name: profileName, profile } : null;
        const items = getActiveItems();
        itemByVar = new Map(items.map(item => [item.varNo, item]));
        itemByName = new Map(items.map(item => [item.name.toLowerCase(), item]));
        values = new Map(items.map(item => [item.varNo, item.defaultValue || ""]));
        render();
    }

    function getActiveProfile() {
        return activeProfileContext ? activeProfileContext.profile : null;
    }

    function getActiveProfileName() {
        return activeProfileContext ? activeProfileContext.name : "";
    }

    function getActiveItems() {
        const profile = getActiveProfile();
        return profile ? profile.items : [];
    }

    function getActiveGroups() {
        const profile = getActiveProfile();
        return profile ? profile.groups : [];
    }

    function hasActiveProfile() {
        return Boolean(activeProfileContext);
    }

    function isReading() {
        return readMode !== null;
    }

    getActiveItems().forEach(item => {
        updateControl(item);
        updateRowState(item);
    });

    return {
        handleSerialData,
        handleConnected,
        handleDisconnected,
        handleUnavailable,
        handleShown,
        handleDeviceChanged,
        handleSessionChanged,
    };
}

function normalizeInput(item, value) {
    return item.control === "hex" ? value.toUpperCase() : value;
}

function parseHardwareName(text) {
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^var\d+\s+Hardware\s*=\s*(.+)$/i);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

function findProfileName(hardwareName) {
    const normalized = String(hardwareName || "").trim().toUpperCase();
    return Object.keys(CONFIG_PROFILES).find(name => name.toUpperCase() === normalized) || null;
}

function normalizeValue(item, value) {
    if (item.control === "bool") {
        return value === "1" || value === "true" ? "true" : "false";
    }
    if (item.control === "hex") {
        return value.toUpperCase();
    }
    return value;
}

function normalizeForCommand(item, value) {
    if (item.control === "bool") {
        return value === "true" || value === "1" ? "true" : "false";
    }
    return value;
}

function ensureSelectOption(select, value) {
    if (value === "") return;
    for (const option of select.options) {
        if (option.value === value) {
            return;
        }
    }
    select.appendChild(new Option(`${value} (current)`, value));
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function emptyConfigPage() {
    return {
        handleSerialData() {},
        handleConnected() {},
        handleDisconnected() {},
        handleUnavailable() {},
        handleShown() {},
        handleDeviceChanged() {},
        handleSessionChanged() {},
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createConfigPage = createConfigPage;
window.TermPWA.CONFIG_PROFILES = CONFIG_PROFILES;
})();
