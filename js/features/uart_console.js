(function () {
const appModules = window.TermPWA || {};

const COPY_WARN_LENGTH = 2000000;
const BUTTON_ICONS = {
    copy: {
        idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7A2 2 0 0 1 10 5H19A2 2 0 0 1 21 7V16A2 2 0 0 1 19 18H17V20A2 2 0 0 1 15 22H6A2 2 0 0 1 4 20V11A2 2 0 0 1 6 9H8V7ZM10 7V16H19V7H10ZM6 11V20H15V18H10A2 2 0 0 1 8 16V11H6Z"></path></svg>',
        success: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 8.75 6.5 11.5 12.25 4.5"></path></svg>',
        empty: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M8 4.4v4.1"></path><circle cx="8" cy="11.4" r="0.8" fill="currentColor"></circle></svg>',
        failed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"></path></svg>',
    },
    export: {
        idle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L17 8H14V14H10V8H7L12 3ZM5 16H7V19H17V16H19V19A2 2 0 0 1 17 21H7A2 2 0 0 1 5 19V16Z"></path></svg>',
        success: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 8.75 6.5 11.5 12.25 4.5"></path></svg>',
        empty: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" d="M8 4.4v4.1"></path><circle cx="8" cy="11.4" r="0.8" fill="currentColor"></circle></svg>',
        failed: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"></path></svg>',
    },
};

function createUartConsole({
    outputElement,
    copyButton,
    exportButton,
    clearButton,
    noticeElement,
    themeApi,
    autoScrollToggle,
    maxNodes = Infinity,
    getExportFileName = () => "uart-log.txt",
    getExportText = () => outputElement ? outputElement.textContent : "",
    onClear = () => {},
    clearNotice = "",
    debugLog = () => {},
} = {}) {
    let disposed = false;
    let noticeTimer = null;
    const buttonTimers = new Map();

    const handleCopyClick = () => copyText().catch(error => debugLog("UART output copy failed", error));
    const handleExportClick = () => exportText().catch(error => debugLog("UART output export failed", error));
    const handleClearClick = () => clear().catch(error => debugLog("UART output clear failed", error));

    if (copyButton) copyButton.addEventListener("click", handleCopyClick);
    if (exportButton) exportButton.addEventListener("click", handleExportClick);
    if (clearButton) clearButton.addEventListener("click", handleClearClick);

    function appendText(text, className = "") {
        if (disposed || !outputElement || !text) return;
        const span = document.createElement("span");
        span.className = className;
        span.appendChild(document.createTextNode(text));
        outputElement.appendChild(span);
        trimNodes();
        scrollToBottom();
    }

    function appendFragment(fragment) {
        if (disposed || !outputElement || !fragment) return;
        outputElement.appendChild(fragment);
        trimNodes();
        scrollToBottom();
    }

    function appendRawText(text) {
        if (disposed || !outputElement || !text) return;
        outputElement.appendChild(document.createTextNode(text));
        trimNodes();
        scrollToBottom();
    }

    function scrollToBottom({ force = false } = {}) {
        if (!outputElement || (!force && autoScrollToggle && !autoScrollToggle.checked)) return;
        outputElement.scrollTop = outputElement.scrollHeight;
    }

    function setTheme(theme) {
        if (!outputElement) return theme || "bright-dark";
        if (themeApi && typeof themeApi.apply === "function") {
            return themeApi.apply(outputElement, theme);
        }
        const nextTheme = theme || "bright-dark";
        outputElement.dataset.theme = nextTheme;
        return nextTheme;
    }

    async function copyText() {
        const text = outputElement ? outputElement.textContent : "";
        if (!text) {
            setButtonState(copyButton, "copy", "empty");
            return;
        }
        if (text.length > COPY_WARN_LENGTH && !confirm("UART output is large. Copying may freeze the page. Continue?")) return;
        try {
            await navigator.clipboard.writeText(text);
            setButtonState(copyButton, "copy", "success");
        } catch (error) {
            setButtonState(copyButton, "copy", "failed");
            throw error;
        }
    }

    async function exportText() {
        try {
            const text = await getExportText();
            if (!text) {
                setButtonState(exportButton, "export", "empty");
                return;
            }
            const filename = getExportFileName();
            const picker = appModules.filePicker;
            if (picker) {
                picker.downloadTextFile({ suggestedName: filename, text, type: "text/plain" });
            } else {
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
                link.download = filename;
                link.click();
                URL.revokeObjectURL(link.href);
            }
            setButtonState(exportButton, "export", "success");
        } catch (error) {
            setButtonState(exportButton, "export", "failed");
            throw error;
        }
    }

    async function clear() {
        if (disposed) return;
        if (outputElement) {
            outputElement.replaceChildren();
            outputElement.scrollTop = 0;
        }
        await onClear();
        if (clearNotice) showNotice(clearNotice);
    }

    function trimNodes() {
        if (!outputElement || !Number.isFinite(maxNodes)) return;
        while (outputElement.childNodes.length > maxNodes) outputElement.removeChild(outputElement.firstChild);
    }

    function showNotice(message) {
        if (!noticeElement || !message) return;
        noticeElement.textContent = message;
        noticeElement.classList.add("visible");
        if (noticeTimer) clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => noticeElement.classList.remove("visible"), 2000);
    }

    function setButtonState(button, type, state) {
        if (!button) return;
        const labels = type === "copy"
            ? { success: "Copied", empty: "Nothing to copy", failed: "Copy failed", idle: "Copy UART output" }
            : { success: "Exported", empty: "No log to export", failed: "Export failed", idle: "Export UART log" };
        button.classList.remove("copy-state-success", "copy-state-empty", "copy-state-failed");
        if (state !== "idle") button.classList.add(`copy-state-${state}`);
        button.innerHTML = BUTTON_ICONS[type][state] || BUTTON_ICONS[type].idle;
        button.title = labels[state];
        button.setAttribute("aria-label", labels[state]);
        const timer = buttonTimers.get(button);
        if (timer) clearTimeout(timer);
        if (state !== "idle") {
            buttonTimers.set(button, setTimeout(() => setButtonState(button, type, "idle"), 900));
        }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        if (copyButton) copyButton.removeEventListener("click", handleCopyClick);
        if (exportButton) exportButton.removeEventListener("click", handleExportClick);
        if (clearButton) clearButton.removeEventListener("click", handleClearClick);
        if (noticeTimer) clearTimeout(noticeTimer);
        buttonTimers.forEach(timer => clearTimeout(timer));
        buttonTimers.clear();
    }

    return { appendText, appendFragment, appendRawText, scrollToBottom, clear, setTheme, exportText, showNotice, dispose };
}

window.TermPWA = { ...appModules, createUartConsole };
})();
