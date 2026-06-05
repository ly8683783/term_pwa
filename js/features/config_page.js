(function () {
const CONFIG_HARDWARE_TIMEOUT_MS = 3000;
const CONFIG_READ_IDLE_MS = 900;

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
    let configUnavailableStatus = "";
    let disposed = false;

    if (!root) {
        return emptyConfigPage();
    }

    const handleTooltipWindowResize = () => hideFloatingTooltip();
    const handleTooltipWindowScroll = () => hideFloatingTooltip();
    const floatingTooltip = createFloatingTooltip();

    render();

    function render() {
        root.innerHTML = `
            <div class="page-shell config-shell" aria-labelledby="configTitle">
                <div class="config-toolbar page-shell-header">
                    <div class="config-heading-group page-shell-heading-group">
                        <h2 id="configTitle" class="config-heading page-shell-title">Configuration</h2>
                        <div id="configStatus" class="config-status page-shell-status ui-status">Connect serial and click Read From Device.</div>
                    </div>
                    <div class="config-actions page-shell-actions ui-action-bar">
                        <button id="configReadBtn" class="ui-btn ui-btn-success" type="button">Read From Device</button>
                        <button id="configApplyBtn" class="ui-btn ui-btn-success" type="button">Apply Changed</button>
                        <button id="configExportBtn" class="ui-btn ui-btn-muted" type="button">Export JSON</button>
                        <button id="configImportBtn" class="ui-btn ui-btn-muted" type="button">Import JSON</button>
                        <input id="configImportInput" type="file" accept="application/json,.json" hidden>
                    </div>
                </div>
                <div id="configGrid" class="config-grid page-shell-content"></div>
            </div>
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
            card.className = "config-card ui-section";
            card.innerHTML = `<h3 class="ui-section-label">${escapeHtml(group)}</h3>`;
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
        row.className = "config-row ui-form-row";
        row.dataset.varNo = String(item.varNo);
        row.innerHTML = `
            <label class="config-label" for="config-var-${item.varNo}">${escapeHtml(item.name)}</label>
            <div class="config-diff-area">
                <span class="config-original-value"></span>
            </div>
            <span class="config-diff-arrow" tabindex="0">--&gt;</span>
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
            label.className = "switch config-switch ui-toggle";
            label.innerHTML = `<input id="config-var-${item.varNo}" type="checkbox"><span class="slider"></span>`;
            const input = label.querySelector("input");
            input.addEventListener("change", () => setValue(item, input.checked ? "true" : "false", true));
            return label;
        }

        if (item.control === "select") {
            const select = document.createElement("select");
            select.className = "ui-select";
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
        input.className = "ui-input";
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
            if (normalized === (deviceValues.get(item.varNo) ?? "")) {
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
        const value = values.get(item.varNo) ?? "";
        control.disabled = isItemDisabled(item);
        if (item.control === "bool") {
            control.checked = value === true || value === "true" || value === "1";
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
        if (disposed) {
            return;
        }
        ensureConnected();
        beginSession();
        readMode = "hardware";
        readBuffer = "";
        configUnavailableStatus = "";
        clearDeviceState();
        setActiveProfile(null);
        setStatus("Detecting hardware...");
        updateButtons();
        await serialSession.writeATCommand("config", "at+ab config Hardware");
        writeTerminal("> [Configuration] at+ab config Hardware\n");
        armHardwareTimer();
    }

    async function readFromDevice() {
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
        ensureConnected();
        const pending = Array.from(dirty).sort((a, b) => a - b);
        if (pending.length === 0) return;

        beginSession();
        setStatus(`Applying ${pending.length} changed item(s)...`);
        for (const varNo of pending) {
            const item = itemByVar.get(varNo);
            if (!item || isReadonlyItem(item) || !loaded.has(varNo)) continue;
            const value = normalizeForCommand(item, values.get(varNo) ?? "");
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
        if (disposed || !isReading()) return;
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
            configUnavailableStatus = "Failed to detect hardware. Configuration is disabled.";
            setStatus(configUnavailableStatus);
            updateButtons();
            endSession();
            return;
        }

        const profileName = findProfileName(hardware);
        if (!profileName || !window.TermPWA.CONFIG_PROFILES[profileName].items.length) {
            clearPendingImport();
            setActiveProfile(null);
            configUnavailableStatus = `Unsupported hardware: ${hardware}. Configuration is disabled.`;
            setStatus(configUnavailableStatus);
            updateButtons();
            endSession();
            return;
        }

        configUnavailableStatus = "";
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
        if (disposed) {
            return;
        }
        const data = {
            hardware: getActiveProfileName(),
            format: getActiveProfile().format,
            exportedAt: new Date().toISOString(),
            items: getActiveItems().map(item => ({
                varNo: item.varNo,
                name: item.name,
                value: values.get(item.varNo) ?? "",
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
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;

        await importJsonText(await file.text(), file.name);
    }

    async function importJsonText(text, fileName) {
        if (disposed) {
            return;
        }
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
        if (disposed) {
            return;
        }
        connected = true;
        setStatus("Connected. Open Configuration or click Read From Device.");
        updateButtons();
    }

    function handleDisconnected() {
        if (disposed) {
            return;
        }
        connected = false;
        readMode = null;
        autoReadDone = false;
        configUnavailableStatus = "";
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        clearDeviceState();
        setActiveProfile(null);
        setStatus("Disconnected.");
        updateButtons();
    }

    function handleUnavailable(message) {
        if (disposed) {
            return;
        }
        connected = false;
        readMode = null;
        autoReadDone = false;
        configUnavailableStatus = "";
        clearTimeout(readTimer);
        endSession();
        clearPendingImport();
        clearDeviceState();
        setActiveProfile(null);
        setStatus(message);
        updateButtons();
    }

    function handleShown() {
        if (disposed) {
            return;
        }
        if (connected && !autoReadDone && !isReading()) {
            autoReadDone = true;
            probeHardwareThenRead().catch(handleError);
        }
    }

    function handleDeviceChanged(isConfigVisible = false) {
        if (disposed) {
            return;
        }
        readMode = null;
        autoReadDone = false;
        configUnavailableStatus = "";
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
        if (disposed) {
            return;
        }
        updateButtons();
        if (connected && !isReading() && serialSession.isBusy() && !serialSession.canWrite("config")) {
            setStatus(serialSession.getStatusText());
        } else if (connected && !isReading() && configUnavailableStatus) {
            setStatus(configUnavailableStatus);
        } else if (connected && !isReading() && !hasActiveProfile()) {
            setStatus("Connected. Open Configuration or click Read From Device.");
        }
    }

    function setStatus(message) {
        if (disposed) {
            return;
        }
        const el = root.querySelector("#configStatus");
        if (el) el.textContent = message;
    }

    function handleError(error) {
        if (disposed) {
            return;
        }
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

        window.addEventListener("resize", handleTooltipWindowResize);
        window.addEventListener("scroll", handleTooltipWindowScroll, true);
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
        return deviceValues.get(item.varNo) ?? "";
    }

    function getPendingValue(item) {
        return values.get(item.varNo) ?? "";
    }

    function formatConfigValueForDiff(value) {
        return String(value ?? "");
    }

    function clearDeviceState() {
        loaded.clear();
        dirty.clear();
        deviceValues.clear();
        values = new Map(getActiveItems().map(item => [item.varNo, item.defaultValue ?? ""]));
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

            const currentValue = values.get(item.varNo) ?? "";
            const importedValue = normalizeValue(item, String(imported.value ?? ""));
            if (String(importedValue ?? "") === String(currentValue ?? "")) {
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
        const profile = profileName ? window.TermPWA.CONFIG_PROFILES[profileName] : null;
        activeProfileContext = profile ? { name: profileName, profile } : null;
        const items = getActiveItems();
        itemByVar = new Map(items.map(item => [item.varNo, item]));
        itemByName = new Map(items.map(item => [item.name.toLowerCase(), item]));
        values = new Map(items.map(item => [item.varNo, item.defaultValue ?? ""]));
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

    function dispose() {
        if (disposed) {
            return;
        }
        disposed = true;
        clearTimeout(readTimer);
        readTimer = null;
        readMode = null;
        endSession();
        clearPendingImport();
        hideFloatingTooltip();
        window.removeEventListener("resize", handleTooltipWindowResize);
        window.removeEventListener("scroll", handleTooltipWindowScroll, true);
        if (floatingTooltip.parentNode) {
            floatingTooltip.parentNode.removeChild(floatingTooltip);
        }
        activeTooltipAnchor = null;
        root.replaceChildren();
    }

    return {
        handleSerialData,
        handleConnected,
        handleDisconnected,
        handleUnavailable,
        handleShown,
        handleDeviceChanged,
        handleSessionChanged,
        dispose,
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
    const profileName = window.TermPWA.normalizeDeviceProfileName
        ? window.TermPWA.normalizeDeviceProfileName(hardwareName)
        : null;
    const deviceProfile = profileName ? window.TermPWA.getDeviceProfile(profileName) : null;
    const configProfile = deviceProfile ? deviceProfile.configProfile : null;
    return configProfile && window.TermPWA.CONFIG_PROFILES[configProfile] ? configProfile : null;
}

function normalizeValue(item, value) {
    if (item.control === "bool") {
        return value === true || value === "1" || value === "true" ? "true" : "false";
    }
    if (item.control === "hex") {
        return value.toUpperCase();
    }
    return value;
}

function normalizeForCommand(item, value) {
    if (item.control === "bool") {
        return value === true || value === "true" || value === "1" ? "true" : "false";
    }
    return value;
}

function ensureSelectOption(select, value) {
    if (value === "") return;
    for (const option of select.options) {
        if (String(option.value) === String(value)) {
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
        dispose() {},
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createConfigPage = createConfigPage;
})();
