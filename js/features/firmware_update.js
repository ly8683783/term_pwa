(function () {
function createFirmwareUpdateDialog({
    serialManager,
    serialSession,
    writeTerminal = () => {},
    debugLog = () => {},
    showPage = () => {},
    isPageActive = () => false,
    selectors = {},
} = {}) {
    const updateButton = document.querySelector(selectors.updateButton || "#firmwareUpdateBtn");
    const enterButton = document.querySelector(selectors.enterButton || "#firmwareEnterFlashloaderBtn");
    const selectButton = document.querySelector(selectors.selectButton || "#firmwareSelectBtn");
    const loadButton = document.querySelector(selectors.loadButton || "#firmwareLoadBtn");
    const cancelButton = document.querySelector(selectors.cancelButton || "#firmwareCancelBtn");
    const fileInput = document.querySelector(selectors.fileInput || "#firmwareFileInput");
    const terminalOutput = document.querySelector(selectors.terminalOutput || "#firmwareUartOutput");
    const statusElement = document.querySelector(selectors.status || "#firmwareUpdateStatus");
    const fileInfo = document.querySelector(selectors.fileInfo || "#firmwareFileInfo");
    const progressBar = document.querySelector(selectors.progress || "#firmwareProgress");
    const progressText = document.querySelector(selectors.progressText || "#firmwareProgressText");

    let selectedFile = null;
    let selectedFileBytes = null;
    let isLoading = false;
    let currentSender = null;
    let cancelRequested = false;
    let disposed = false;
    const handleOpenClick = () => open();
    const handleEnterClick = () => {
        enterFlashloader().catch(error => {
            setStatus(`Enter Flashloader failed: ${error.message}`);
            debugLog("firmware enter flashloader failed", error);
        });
    };
    const handleSelectClick = () => {
        chooseFirmwareFile().catch(error => {
            selectedFile = null;
            selectedFileBytes = null;
            fileInfo.textContent = "No file selected";
            setStatus(`File read failed: ${error.message}`);
            debugLog("firmware file read failed", error);
        });
    };
    const handleFileInputChange = () => {
        handleFileSelected().catch(error => {
            selectedFile = null;
            selectedFileBytes = null;
            fileInfo.textContent = "No file selected";
            setStatus(`File read failed: ${error.message}`);
            debugLog("firmware file read failed", error);
        });
    };
    const handleLoadClick = () => {
        handleLoad().catch(error => {
            showFirmwareError(error);
            debugLog("firmware load failed", error);
        });
    };
    const handleCancelClick = () => {
        handleCancel().catch(error => {
            setStatus(`Cancel failed: ${error.message}`, "error");
            debugLog("firmware cancel failed", error);
        });
    };
    const handleDocumentKeydown = event => {
        if (disposed || !isPageActive()) {
            return;
        }
        if (isLoading) {
            event.preventDefault();
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }
        if (isEditableTarget(event.target)) {
            return;
        }

        const text = keyToSerialText(event);
        if (text === null) {
            return;
        }

        event.preventDefault();
        sendKeyText(text).catch(error => {
            setStatus(`UART send failed: ${error.message}`);
            debugLog("firmware uart send failed", error);
        });
    };

    updateButton.addEventListener("click", handleOpenClick);
    enterButton.addEventListener("click", handleEnterClick);
    selectButton.addEventListener("click", handleSelectClick);
    fileInput.addEventListener("change", handleFileInputChange);

    async function chooseFirmwareFile() {
        const picker = window.TermPWA.filePicker;
        const supportsOpenPicker = Boolean(picker && picker.supportsOpenPicker());
        const pickerContext = getFirmwarePickerContext();

        debugLog("firmware file picker start", {
            supportsOpenPicker,
            pickerId: picker && picker.getFirmwarePickerId ? picker.getFirmwarePickerId() : null,
            context: pickerContext,
        });

        if (supportsOpenPicker) {
            const picked = await picker.openFirmwareBin();
            debugLog("firmware file picker result", {
                via: "showOpenFilePicker",
                picked: Boolean(picked),
                name: picked ? picked.name : null,
                context: pickerContext,
            });
            if (!picked) {
                setStatus("No firmware file selected.");
                return;
            }
            setSelectedFirmware(picked);
            return;
        }

        debugLog("firmware file picker fallback", {
            via: "input[type=file]",
            context: pickerContext,
        });
        fileInput.value = "";
        fileInput.click();
    }

    async function handleFileSelected() {
        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (!file) {
            selectedFile = null;
            selectedFileBytes = null;
            fileInfo.textContent = "No file selected";
            setStatus("No firmware file selected.");
            setProgress(0);
            return;
        }

        setStatus("Reading firmware file...");
        setSelectedFirmware({
            file,
            name: file.name,
            size: file.size,
            bytes: new Uint8Array(await file.arrayBuffer()),
        });
    }

    function setSelectedFirmware({ file, name, size, bytes }) {
        selectedFile = file || { name, size };
        selectedFileBytes = bytes;
        fileInfo.textContent = `${name} (${size} bytes)`;
        setStatus("Firmware file selected.");
        setProgress(0);
    }

    loadButton.addEventListener("click", handleLoadClick);
    cancelButton.addEventListener("click", handleCancelClick);
    document.addEventListener("keydown", handleDocumentKeydown);

    function open() {
        if (disposed) {
            return;
        }
        showPage();
    }

    function handleShown() {
        if (disposed) {
            return;
        }
        debugLog("firmware page shown");
        if (isLoading) {
            return;
        }
        setStatus(serialManager.isConnected()
            ? "Ready. Press number keys, Space, or Enter to control Flashloader."
            : "Connect serial before using firmware update.");
    }

    async function enterFlashloader() {
        if (disposed) {
            return;
        }
        ensureConnected();
        await serialSession.writeATCommand("firmware", "at+ab flashloaderstart");
        appendOutput("> at+ab flashloaderstart\r\n");
        writeTerminal("> [Firmware] at+ab flashloaderstart\n");
        setStatus("Flashloader start command sent.");
    }

    async function sendKeyText(text) {
        if (disposed) {
            return;
        }
        ensureConnected();
        await serialSession.writeText("firmware", text);
        appendOutput(formatSentKey(text));
    }

    async function handleLoad() {
        if (disposed) {
            return;
        }
        ensureConnected();
        if (!selectedFile || !selectedFileBytes) {
            setStatus("Select a firmware binary before Load.");
            return;
        }
        if (!window.TermPWA.createYModemSender) {
            throw new Error("YMODEM sender is unavailable");
        }

        setBusy(true);
        cancelRequested = false;
        setProgress(0);
        setStatus(`Loading ${selectedFile.name} by YMODEM-CRC...`, "running");

        try {
            await serialSession.runExclusive("firmware", "Firmware Update", async () => {
                const bytes = selectedFileBytes;
                // A previous cancelled/failed transfer may have left waitByte()
                // listeners behind. Reset both queued bytes and pending waiters
                // before starting a new YMODEM session.
                serialManager.resetByteState(new Error("YMODEM start reset"));

                currentSender = window.TermPWA.createYModemSender({
                    writeBytes: data => serialSession.writeBytes("firmware", data),
                    waitByte: options => serialManager.waitByte(options),
                    onProgress: handleYModemProgress,
                    onLog: message => {
                        appendOutput(`[YMODEM] ${message}\r\n`);
                        debugLog("ymodem", message);
                    },
                });

                await currentSender.sendFile({
                    name: selectedFile.name,
                    bytes,
                });
            }, {
                hard: true,
            });

            setStatus("Firmware load finished.", "success");
        } catch (error) {
            showFirmwareError(error);
            if (!cancelRequested) {
                await tryCancelCurrentSender();
            }
            debugLog("firmware load failed", error);
        } finally {
            // Always clear queued bytes and pending waiters so the next Load
            // starts from a clean serial-byte state.
            serialManager.resetByteState(new Error("YMODEM cleanup reset"));
            currentSender = null;
            cancelRequested = false;
            setBusy(false);
        }
    }

    async function handleCancel() {
        if (disposed) {
            return;
        }
        if (!isLoading || !currentSender) {
            return;
        }

        cancelRequested = true;
        setStatus("Cancelling firmware update...", "running");
        appendOutput("[YMODEM] Cancel requested\r\n");
        await currentSender.cancel();
    }

    function handleSerialText(text) {
        if (disposed) {
            return;
        }
        if (!isPageActive() && !isLoading) {
            return;
        }
        appendOutput(text);
    }

    function appendOutput(text) {
        if (disposed) {
            return;
        }
        terminalOutput.textContent += text;
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    function keyToSerialText(event) {
        if (event.key === "Enter") {
            return "\r";
        }
        if (event.key === " ") {
            return " ";
        }
        if (event.key.length === 1) {
            return event.key;
        }
        return null;
    }

    function isEditableTarget(target) {
        if (!target) {
            return false;
        }
        const tagName = target.tagName;
        return tagName === "INPUT" ||
            tagName === "TEXTAREA" ||
            tagName === "SELECT" ||
            target.isContentEditable;
    }

    function getFirmwarePickerContext() {
        const displayMode = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches
            ? "standalone"
            : "browser";

        return {
            origin: window.location.origin,
            href: window.location.href,
            protocol: window.location.protocol,
            host: window.location.host,
            pathname: window.location.pathname,
            isSecureContext: window.isSecureContext,
            displayMode,
            serviceWorkerControlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
        };
    }

    function formatSentKey(text) {
        if (text === "\r") {
            return ">\r\n";
        }
        if (text === " ") {
            return "> [space]\r\n";
        }
        return `> ${text}\r\n`;
    }

    function setStatus(message, state = "") {
        if (disposed) {
            return;
        }
        statusElement.textContent = message;
        statusElement.classList.remove("running", "success", "error");
        if (state) {
            statusElement.classList.add(state);
        }
    }

    function setProgress(percent) {
        if (disposed) {
            return;
        }
        const clamped = Math.max(0, Math.min(100, percent));
        progressBar.value = clamped;
        progressText.textContent = `${clamped}%`;
    }

    function handleYModemProgress(progress) {
        if (disposed) {
            return;
        }
        setProgress(progress.percent);
        if (progress.phase === "waiting-c") {
            setStatus("Waiting for Flashloader 'C'. Select Application/Executable if needed.", "running");
        } else if (progress.phase === "header") {
            setStatus("Sending YMODEM header...", "running");
        } else if (progress.phase === "data") {
            setStatus(`Sending firmware ${progress.sentBytes}/${progress.totalBytes} bytes...`, "running");
        } else if (progress.phase === "finish") {
            setStatus("Finishing YMODEM transfer...", "running");
        } else if (progress.phase === "done") {
            setStatus("Firmware load finished.", "success");
        }
    }

    function setBusy(busy) {
        if (disposed) {
            return;
        }
        isLoading = busy;
        enterButton.disabled = busy;
        selectButton.disabled = busy;
        loadButton.disabled = busy;
        cancelButton.disabled = !busy;
    }

    async function tryCancelCurrentSender() {
        if (!currentSender) {
            return;
        }

        try {
            await currentSender.cancel();
            appendOutput("[YMODEM] Sent cancel to receiver after failure\r\n");
        } catch (error) {
            debugLog("firmware failure cancel failed", error);
        }
    }

    function showFirmwareError(error) {
        const info = classifyFirmwareError(error);
        setStatus(info.type === "user-cancelled" ? info.message : `Load failed: ${info.message}`, "error");
        appendOutput(`[ERROR] ${info.message}\r\n`);
        if (info.hint) {
            appendOutput(`[HINT] ${info.hint}\r\n`);
        }
    }

    function classifyFirmwareError(error) {
        const message = error && error.message ? error.message : String(error || "unknown error");

        if (message.includes("YMODEM transfer cancelled")) {
            return {
                type: "user-cancelled",
                message: "Firmware update cancelled.",
                hint: "You can select Load again after the Flashloader is ready.",
            };
        }
        if (message.includes("Timed out waiting for serial byte")) {
            return {
                type: "timeout",
                message: "timeout waiting for Flashloader response.",
                hint: "Check that the Flashloader is in Application/Executable upload mode and still connected.",
            };
        }
        if (message.includes("Receiver cancelled")) {
            return {
                type: "receiver-cancelled",
                message: "receiver cancelled the YMODEM transfer.",
                hint: "Return to the Flashloader upload menu and retry.",
            };
        }
        if (message.includes("Retry limit exceeded")) {
            return {
                type: "retry-limit",
                message: "retry limit exceeded while sending packet.",
                hint: "The serial link or Flashloader rejected packets repeatedly.",
            };
        }
        if (message.includes("Port not connected") ||
            message.includes("serial is not connected") ||
            message.includes("Serial port disconnected")) {
            return {
                type: "serial-disconnected",
                message: "serial port disconnected during firmware update.",
                hint: "Reconnect the device and restart the Flashloader upload flow.",
            };
        }

        return {
            type: "generic",
            message,
            hint: "",
        };
    }

    function ensureConnected() {
        if (!serialManager.isConnected()) {
            throw new Error("serial is not connected");
        }
    }

    function dispose() {
        if (disposed) {
            return;
        }
        updateButton.removeEventListener("click", handleOpenClick);
        enterButton.removeEventListener("click", handleEnterClick);
        selectButton.removeEventListener("click", handleSelectClick);
        fileInput.removeEventListener("change", handleFileInputChange);
        loadButton.removeEventListener("click", handleLoadClick);
        cancelButton.removeEventListener("click", handleCancelClick);
        document.removeEventListener("keydown", handleDocumentKeydown);
        cancelRequested = true;
        if (currentSender) {
            Promise.resolve(currentSender.cancel()).catch(error => {
                debugLog("firmware dispose cancel failed", error);
            });
        }
        serialManager.resetByteState(new Error("Firmware page disposed"));
        currentSender = null;
        setBusy(false);
        disposed = true;
    }

    return {
        open,
        handleShown,
        handleSerialText,
        dispose,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createFirmwareUpdateDialog = createFirmwareUpdateDialog;
})();
