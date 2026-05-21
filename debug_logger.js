(function initDebugLog() {
    const entries = [];
    const panel = document.getElementById("debugLogPanel");
    const output = document.getElementById("debugLogOutput");
    const toggle = document.getElementById("debugLogToggle");
    const close = document.getElementById("debugLogClose");
    const clear = document.getElementById("debugLogClear");

    function stringify(value) {
        if (value === undefined) return "";
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        if (typeof value === "string") return value;
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }

    function append(level, message, detail) {
        const time = new Date().toLocaleTimeString();
        const line = `[${time}] ${level}: ${message}${detail === undefined ? "" : " " + stringify(detail)}`;
        entries.push(line);
        if (entries.length > 300) entries.shift();
        output.textContent = entries.join("\n");
        output.scrollTop = output.scrollHeight;
    }

    window.appDebugLog = (message, detail) => append("LOG", message, detail);
    window.addEventListener("error", event => {
        append("ERROR", `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`);
    });
    window.addEventListener("unhandledrejection", event => {
        append("REJECT", stringify(event.reason));
    });

    toggle.addEventListener("click", () => panel.classList.toggle("active"));
    close.addEventListener("click", () => panel.classList.remove("active"));
    clear.addEventListener("click", () => {
        entries.length = 0;
        output.textContent = "";
    });

    append("LOG", "debug logger ready");
})();
