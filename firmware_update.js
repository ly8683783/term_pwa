(function () {
function createFirmwareUpdateDialog({
    serialManager,
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
    const fileInput = document.querySelector(selectors.fileInput || "#firmwareFileInput");
    const terminalOutput = document.querySelector(selectors.terminalOutput || "#firmwareUartOutput");
    const statusElement = document.querySelector(selectors.status || "#firmwareUpdateStatus");
    const fileInfo = document.querySelector(selectors.fileInfo || "#firmwareFileInfo");
    const progressBar = document.querySelector(selectors.progress || "#firmwareProgress");
    const progressText = document.querySelector(selectors.progressText || "#firmwareProgressText");

    let selectedFile = null;
    let isLoading = false;

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
        fileInput.click();
    });

    fileInput.addEventListener("change", () => {
        selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (selectedFile) {
            fileInfo.textContent = `${selectedFile.name} (${selectedFile.size} bytes)`;
            setStatus("Firmware file selected.");
        } else {
            fileInfo.textContent = "No file selected";
            setStatus("No firmware file selected.");
        }
        setProgress(0);
    });

    loadButton.addEventListener("click", () => {
        handleLoad().catch(error => {
            setStatus(`Load failed: ${error.message}`);
            debugLog("firmware load failed", error);
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
        await serialManager.writeATCommand("at+ab flashloaderstart");
        appendOutput("> at+ab flashloaderstart\r\n");
        writeTerminal("> [Firmware] at+ab flashloaderstart\n");
        setStatus("Flashloader start command sent.");
    }

    async function sendKeyText(text) {
        ensureConnected();
        await serialManager.writeText(text);
        appendOutput(formatSentKey(text));
    }

    async function handleLoad() {
        ensureConnected();
        if (!selectedFile) {
            setStatus("Select a firmware binary before Load.");
            return;
        }
        if (!window.TermPWA.createYModemSender) {
            throw new Error("YMODEM sender is unavailable");
        }

        setBusy(true);
        setProgress(0);
        setStatus(`Loading ${selectedFile.name} by YMODEM-CRC...`);

        try {
            const bytes = new Uint8Array(await selectedFile.arrayBuffer());
            serialManager.clearByteQueue();

            const sender = window.TermPWA.createYModemSender({
                writeBytes: data => serialManager.writeBytes(data),
                waitByte: options => serialManager.waitByte(options),
                onProgress: handleYModemProgress,
                onLog: message => {
                    appendOutput(`[YMODEM] ${message}\r\n`);
                    debugLog("ymodem", message);
                },
            });

            await sender.sendFile({
                name: selectedFile.name,
                bytes,
            });

            setStatus("Firmware load finished.");
        } finally {
            setBusy(false);
        }
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

    function setStatus(message) {
        statusElement.textContent = message;
    }

    function setProgress(percent) {
        const clamped = Math.max(0, Math.min(100, percent));
        progressBar.value = clamped;
        progressText.textContent = `${clamped}%`;
    }

    function handleYModemProgress(progress) {
        setProgress(progress.percent);
        if (progress.phase === "waiting-c") {
            setStatus("Waiting for Flashloader 'C'. Select Application/Executable if needed.");
        } else if (progress.phase === "header") {
            setStatus("Sending YMODEM header...");
        } else if (progress.phase === "data") {
            setStatus(`Sending firmware ${progress.sentBytes}/${progress.totalBytes} bytes...`);
        } else if (progress.phase === "finish") {
            setStatus("Finishing YMODEM transfer...");
        } else if (progress.phase === "done") {
            setStatus("Firmware load finished.");
        }
    }

    function setBusy(busy) {
        isLoading = busy;
        enterButton.disabled = busy;
        selectButton.disabled = busy;
        loadButton.disabled = busy;
        closeButton.disabled = busy;
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
