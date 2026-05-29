(function () {
function createFirmwareUpdateDialog({
    serialManager,
    serialSession,
    writeTerminal = () => {},
    debugLog = () => {},
    selectors = {},
} = {}) {
    const updateButton = document.querySelector(selectors.updateButton || "#firmwareUpdateBtn");
    const overlay = document.querySelector(selectors.overlay || "#firmwareUpdateOverlay");
    const closeButton = document.querySelector(selectors.closeButton || "#firmwareUpdateClose");
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

    updateButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", event => {
        if ((event.target === overlay) && !isLoading) {
            close();
        }
    });

    enterButton.addEventListener("click", () => {
        enterFlashloader().catch(error => {
            setStatus(`Enter Flashloader failed: ${error.message}`);
            debugLog("firmware enter flashloader failed", error);
        });
    });

    selectButton.addEventListener("click", () => {
        chooseFirmwareFile().catch(error => {
            selectedFile = null;
            selectedFileBytes = null;
            fileInfo.textContent = "No file selected";
            setStatus(`File read failed: ${error.message}`);
            debugLog("firmware file read failed", error);
        });
    });

    fileInput.addEventListener("change", () => {
        handleFileSelected().catch(error => {
            selectedFile = null;
            selectedFileBytes = null;
            fileInfo.textContent = "No file selected";
            setStatus(`File read failed: ${error.message}`);
            debugLog("firmware file read failed", error);
        });
    });

    async function chooseFirmwareFile() {
        const picker = window.TermPWA.filePicker;
        if (picker && picker.supportsOpenPicker()) {
            const picked = await picker.openFirmwareBin();
            if (!picked) {
                setStatus("No firmware file selected.");
                return;
            }
            setSelectedFirmware(picked);
            return;
        }

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

    loadButton.addEventListener("click", () => {
        handleLoad().catch(error => {
            showFirmwareError(error);
            debugLog("firmware load failed", error);
        });
    });

    cancelButton.addEventListener("click", () => {
        handleCancel().catch(error => {
            setStatus(`Cancel failed: ${error.message}`, "error");
            debugLog("firmware cancel failed", error);
        });
    });

    document.addEventListener("keydown", event => {
        if (!overlay.classList.contains("active")) {
            return;
        }
        if (isLoading) {
            event.preventDefault();
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }
        if (event.target === fileInput) {
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
    });

    function open() {
        overlay.classList.add("active");
        setStatus(serialManager.isConnected()
            ? "Ready. Press number keys, Space, or Enter to control Flashloader."
            : "Connect serial before using firmware update.");
        debugLog("firmware dialog opened");
    }

    function close() {
        overlay.classList.remove("active");
        debugLog("firmware dialog closed");
    }

    async function enterFlashloader() {
        ensureConnected();
        await serialSession.writeATCommand("firmware", "at+ab flashloaderstart");
        appendOutput("> at+ab flashloaderstart\r\n");
        writeTerminal("> [Firmware] at+ab flashloaderstart\n");
        setStatus("Flashloader start command sent.");
    }

    async function sendKeyText(text) {
        ensureConnected();
        await serialSession.writeText("firmware", text);
        appendOutput(formatSentKey(text));
    }

    async function handleLoad() {
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
        if (!isLoading || !currentSender) {
            return;
        }

        cancelRequested = true;
        setStatus("Cancelling firmware update...", "running");
        appendOutput("[YMODEM] Cancel requested\r\n");
        await currentSender.cancel();
    }

    function handleSerialText(text) {
        if (!overlay.classList.contains("active")) {
            return;
        }
        appendOutput(text);
    }

    function appendOutput(text) {
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
        statusElement.textContent = message;
        statusElement.classList.remove("running", "success", "error");
        if (state) {
            statusElement.classList.add(state);
        }
    }

    function setProgress(percent) {
        const clamped = Math.max(0, Math.min(100, percent));
        progressBar.value = clamped;
        progressText.textContent = `${clamped}%`;
    }

    function handleYModemProgress(progress) {
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
        isLoading = busy;
        enterButton.disabled = busy;
        selectButton.disabled = busy;
        loadButton.disabled = busy;
        closeButton.disabled = busy;
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

    return {
        open,
        close,
        handleSerialText,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createFirmwareUpdateDialog = createFirmwareUpdateDialog;
})();
