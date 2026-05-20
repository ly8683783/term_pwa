(function () {
const CONFIG_ITEMS = [
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
    { varNo: 14, name: "ATReply", group: "Advanced", control: "text", hidden: true, defaultValue: "AT-AB ", range: "Text", description: "AT reply prefix." },
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
    { varNo: 25, name: "LoraPreambleLength", group: "Advanced", control: "number", hidden: true, defaultValue: "8", min: 6, max: 5000, range: "6 - 5000", description: "LoRa preamble length." },
    { varNo: 26, name: "LoraAirDataRate", group: "LoRa Radio", control: "select", defaultValue: "4800", options: ["4800", "9600", "19200", "38400"], range: "300 - 62500", description: "LoRa air data rate. Common LR71 values are listed." },
    { varNo: 27, name: "LoraSF", group: "LoRa Radio", control: "select", defaultValue: "9", options: [["6", "6:64"], ["7", "7:128"], ["8", "8:256"], ["9", "9:512"], ["10", "10:1024"], ["11", "11:2048"], ["12", "12:4096"]], range: "6 - 12", description: "LoRa spreading factor." },
    { varNo: 28, name: "LoraBW", group: "Advanced", control: "select", hidden: true, defaultValue: "4", options: [["0", "7.8K"], ["1", "10.4K"], ["2", "15.6K"], ["3", "20.8K"], ["4", "31.2K"], ["5", "41.6K"], ["6", "62.5K"], ["7", "125K"], ["8", "250K"], ["9", "500K"]], range: "0 - 9", description: "LoRa bandwidth." },
    { varNo: 29, name: "LoraCodeRate", group: "Advanced", control: "select", hidden: true, defaultValue: "4", options: [["1", "4/5"], ["2", "4/6"], ["3", "4/7"], ["4", "4/8"]], range: "1 - 4", description: "LoRa coding rate." },
    { varNo: 30, name: "LoraPANID", group: "LoRa Radio", control: "number", defaultValue: "255", min: 255, max: 65280, range: "255 - 65280", description: "LoRa PAN ID." },
    { varNo: 31, name: "LoraPayloadLen", group: "LoRa Radio", control: "number", defaultValue: "128", min: 0, max: 255, range: "0 - 255", description: "LoRa payload length." },
    { varNo: 32, name: "HostEvents", group: "Bypass / Sleep", control: "bool", defaultValue: "true", range: "bool", description: "Enable host event output strings." },
    { varNo: 33, name: "DebugInfo", group: "Advanced", control: "bool", hidden: true, defaultValue: "0", range: "bool", description: "Enable debug information." },
    { varNo: 34, name: "TestMode", group: "Advanced", control: "bool", hidden: true, defaultValue: "0", range: "bool", description: "Enable test mode." },
    { varNo: 35, name: "Hardware", group: "System", control: "readonly", ro: true, defaultValue: "LR71", range: "Read only", description: "Hardware model." },
    { varNo: 36, name: "OutMtuSize", group: "System", control: "number", defaultValue: "400", range: "UDP:1-1472, TCP:1-1460", description: "Output MTU size." },
    { varNo: 37, name: "MaxTTL", group: "Mesh", control: "number", defaultValue: "2", min: 0, max: 255, range: "0 - 255", description: "Maximum Mesh TTL." },
    { varNo: 38, name: "HostShallowSleepEn", group: "Bypass / Sleep", control: "bool", defaultValue: "false", range: "bool", description: "Enable host shallow sleep." },
    { varNo: 39, name: "HostDeepSleepEn", group: "Bypass / Sleep", control: "bool", defaultValue: "false", range: "bool", description: "Enable host deep sleep." },
    { varNo: 40, name: "NodeAddr", group: "Mesh", control: "hex", defaultValue: "0000", range: "0000 - FFFF", description: "Local node address." },
    { varNo: 41, name: "PublishAddr", group: "Mesh", control: "hex", defaultValue: "C001", range: "0000 - FFFF", description: "Publish address." },
    { varNo: 42, name: "SubscribeAddr", group: "Mesh", control: "text", defaultValue: "C001", range: "0000 - FFFF, space separated", description: "Subscribe address list." },
    { varNo: 43, name: "DefaultDstAddr", group: "Mesh", control: "hex", defaultValue: "0000", range: "0000 - FFFF", description: "Default destination address." },
    { varNo: 44, name: "MeshDbgLevel", group: "Advanced", control: "number", hidden: true, defaultValue: "0", min: 0, max: 255, range: "0 - 255", description: "Mesh debug level." },
    { varNo: 45, name: "AckTimeout", group: "Timing", control: "text", defaultValue: "auto", range: "auto, 1 - 254, disabled", description: "ACK timeout. Use auto for computed timeout or disabled to disable." },
    { varNo: 46, name: "LoraTxRpt", group: "Timing", control: "number", defaultValue: "1", min: 1, max: 5, range: "1 - 5", description: "LoRa transmit repeat count." },
    { varNo: 47, name: "LoraTxInt", group: "Advanced", control: "text", hidden: true, defaultValue: "auto", range: "auto, 1 - 65535", description: "LoRa TX interval." },
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
];

const GROUP_ORDER = ["System", "UART", "Mesh", "LoRa Radio", "Timing", "Bypass / Sleep", "Advanced"];

function createConfigPage({
    serialManager,
    writeTerminal = () => {},
    debugLog = () => {},
    rootSelector = "#configPage",
} = {}) {
    const root = document.querySelector(rootSelector);
    const itemByVar = new Map(CONFIG_ITEMS.map(item => [item.varNo, item]));
    const itemByName = new Map(CONFIG_ITEMS.map(item => [item.name.toLowerCase(), item]));
    const values = new Map(CONFIG_ITEMS.map(item => [item.varNo, item.defaultValue || ""]));
    const loaded = new Set();
    const dirty = new Set();
    let connected = false;
    let readBuffer = "";
    let readTimer = null;
    let reading = false;
    let autoReadDone = false;

    if (!root) {
        return emptyConfigPage();
    }

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

        GROUP_ORDER.forEach((group, index) => {
            const items = CONFIG_ITEMS.filter(item => item.group === group);
            const card = document.createElement("section");
            card.className = "config-card";
            card.innerHTML = `<h3>${escapeHtml(group)}</h3>`;
            for (const item of items) {
                card.appendChild(createRow(item));
            }
            columns[index % columns.length].appendChild(card);
        });

        root.querySelector("#configReadBtn").addEventListener("click", () => readFromDevice().catch(handleError));
        root.querySelector("#configApplyBtn").addEventListener("click", () => applyChanged().catch(handleError));
        root.querySelector("#configExportBtn").addEventListener("click", exportJson);
        root.querySelector("#configImportBtn").addEventListener("click", () => root.querySelector("#configImportInput").click());
        root.querySelector("#configImportInput").addEventListener("change", event => importJson(event).catch(handleError));

        updateButtons();
    }

    function createRow(item) {
        const row = document.createElement("div");
        row.className = "config-row";
        row.dataset.varNo = String(item.varNo);
        row.innerHTML = `
            <label class="config-label" for="config-var-${item.varNo}">${escapeHtml(item.name)}</label>
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
        return row;
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
        if (userChanged && !item.ro && item.control !== "readonly") {
            dirty.add(item.varNo);
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
        const isMissing = connected && !reading && !loaded.has(item.varNo);
        row.classList.toggle("readonly", isReadonly);
        row.classList.toggle("missing", isMissing);
        row.classList.toggle("changed", dirty.has(item.varNo));
        updateTooltip(item);
    }

    function updateButtons() {
        const readBtn = root.querySelector("#configReadBtn");
        const applyBtn = root.querySelector("#configApplyBtn");
        const importBtn = root.querySelector("#configImportBtn");
        if (readBtn) readBtn.disabled = !connected || reading;
        if (applyBtn) applyBtn.disabled = !connected || reading || dirty.size === 0;
        if (importBtn) importBtn.disabled = reading || loaded.size === 0;
    }

    async function readFromDevice() {
        ensureConnected();
        reading = true;
        readBuffer = "";
        loaded.clear();
        dirty.clear();
        CONFIG_ITEMS.forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        setStatus("Reading configuration...");
        updateButtons();
        await serialManager.writeATCommand("at+ab config");
        writeTerminal("> [Configuration] at+ab config\n");
        armReadTimer();
    }

    async function applyChanged() {
        ensureConnected();
        const pending = Array.from(dirty).sort((a, b) => a - b);
        if (pending.length === 0) return;

        setStatus(`Applying ${pending.length} changed item(s)...`);
        for (const varNo of pending) {
            const item = itemByVar.get(varNo);
            if (!item || isReadonlyItem(item) || !loaded.has(varNo)) continue;
            const value = normalizeForCommand(item, values.get(varNo) || "");
            const cmd = `at+ab config var${varNo}=${value}`;
            await serialManager.writeATCommand(cmd);
            writeTerminal(`> [Configuration] ${cmd}\n`);
            await sleep(120);
        }
        dirty.clear();
        CONFIG_ITEMS.forEach(updateRowState);
        updateButtons();
        setStatus("Apply complete. Refreshing from device...");
        await sleep(300);
        await readFromDevice();
    }

    function handleSerialData(text) {
        if (!reading) return;
        readBuffer += text;
        armReadTimer();
    }

    function armReadTimer() {
        clearTimeout(readTimer);
        readTimer = setTimeout(finishRead, 900);
    }

    function finishRead() {
        let count = 0;
        const re = /^var(\d+)\s+(.+?)\s*=\s*(.*)$/gm;
        let match;
        while ((match = re.exec(readBuffer)) !== null) {
            const varNo = Number(match[1]);
            const name = match[2].trim();
            const value = match[3].trim();
            const item = itemByVar.get(varNo) || itemByName.get(name.toLowerCase());
            if (!item) continue;
            loaded.add(item.varNo);
            values.set(item.varNo, normalizeValue(item, value));
            dirty.delete(item.varNo);
            updateControl(item);
            updateRowState(item);
            count++;
        }
        reading = false;
        CONFIG_ITEMS.forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        const missing = CONFIG_ITEMS.length - loaded.size;
        setStatus(count ? `Loaded ${loaded.size} item(s). ${missing} item(s) not returned.` : "No config rows parsed.");
        updateButtons();
    }

    function exportJson() {
        const data = {
            format: "lr71-config-v1",
            exportedAt: new Date().toISOString(),
            items: CONFIG_ITEMS.map(item => ({
                varNo: item.varNo,
                name: item.name,
                value: values.get(item.varNo) || "",
                loaded: loaded.has(item.varNo),
                readonly: isReadonlyItem(item),
            })),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `lr71-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function importJson(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        if (loaded.size === 0) {
            setStatus("Read configuration from device before importing JSON.");
            return;
        }

        const data = JSON.parse(await file.text());
        if (!data || data.format !== "lr71-config-v1" || !Array.isArray(data.items)) {
            throw new Error("Invalid LR71 config JSON");
        }

        let count = 0;
        for (const imported of data.items) {
            const item = itemByVar.get(Number(imported.varNo));
            if (!item || isReadonlyItem(item) || !loaded.has(item.varNo)) continue;
            if (imported.name && imported.name !== item.name) continue;
            setValue(item, String(imported.value ?? ""), true);
            count++;
        }
        setStatus(`Imported ${count} writable item(s). Click Apply Changed to write them.`);
    }

    function handleConnected() {
        connected = true;
        setStatus("Connected. Open Configuration or click Read From Device.");
        updateButtons();
    }

    function handleDisconnected() {
        connected = false;
        reading = false;
        autoReadDone = false;
        clearTimeout(readTimer);
        loaded.clear();
        dirty.clear();
        CONFIG_ITEMS.forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        setStatus("Disconnected.");
        updateButtons();
    }

    function handleUnavailable(message) {
        connected = false;
        loaded.clear();
        dirty.clear();
        CONFIG_ITEMS.forEach(item => {
            updateControl(item);
            updateRowState(item);
        });
        setStatus(message);
        updateButtons();
    }

    function handleShown() {
        if (connected && !autoReadDone && !reading) {
            autoReadDone = true;
            readFromDevice().catch(handleError);
        }
    }

    function setStatus(message) {
        const el = root.querySelector("#configStatus");
        if (el) el.textContent = message;
    }

    function handleError(error) {
        setStatus(`Error: ${error.message}`);
        debugLog("config page error", error);
    }

    function ensureConnected() {
        if (!connected || !serialManager.isConnected()) {
            throw new Error("serial is not connected");
        }
    }

    function isReadonlyItem(item) {
        return item.ro || item.control === "readonly";
    }

    function isItemDisabled(item) {
        return !connected || reading || isReadonlyItem(item) || !loaded.has(item.varNo);
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
    }

    CONFIG_ITEMS.forEach(item => {
        updateControl(item);
        updateRowState(item);
    });

    return {
        handleSerialData,
        handleConnected,
        handleDisconnected,
        handleUnavailable,
        handleShown,
    };
}

function normalizeInput(item, value) {
    return item.control === "hex" ? value.toUpperCase() : value;
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
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createConfigPage = createConfigPage;
window.TermPWA.CONFIG_ITEMS = CONFIG_ITEMS;
})();
