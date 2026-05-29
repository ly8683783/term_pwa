(function () {
class SerialPortStore {
    constructor() {
        this.metadata = new WeakMap();
    }

    isSupported() {
        return Boolean(navigator.serial);
    }

    assertSupported() {
        if (!this.isSupported()) {
            throw new Error("Web Serial is unavailable. Use Chrome or Chromium over localhost or HTTPS.");
        }
    }

    async getPorts() {
        const entries = await this.getEntries();
        return entries.map(entry => entry.port);
    }

    async getEntries() {
        this.assertSupported();
        return this.buildEntries(await navigator.serial.getPorts());
    }

    async requestPort() {
        this.assertSupported();
        return await navigator.serial.requestPort();
    }

    async requestPortEntry() {
        const port = await this.requestPort();
        if (!port) {
            return null;
        }

        const entries = await this.getEntries();
        return entries.find(entry => entry.port === port) || null;
    }

    async getEntryForPort(port) {
        if (!port) {
            return null;
        }

        const entries = await this.getEntries();
        return entries.find(entry => entry.port === port) || null;
    }

    setMetadata(port, metadata) {
        if (!port || !metadata) {
            return;
        }

        this.metadata.set(port, {
            ...this.getMetadata(port),
            ...metadata,
        });
    }

    getMetadata(port) {
        return this.metadata.get(port) || {};
    }

    buildEntries(ports) {
        return ports
            .map((port, originalIndex) => this.createEntry(port, originalIndex))
            .sort(comparePortEntries)
            .map((entry, index) => ({
                ...entry,
                index,
                displayName: this.formatDisplayName(entry, index),
            }));
    }

    createEntry(port, originalIndex) {
        const info = port.getInfo();
        const metadata = this.getMetadata(port);

        return {
            port,
            originalIndex,
            index: originalIndex,
            usbVendorId: info.usbVendorId,
            usbProductId: info.usbProductId,
            metadata,
            displayName: "",
        };
    }

    formatDisplayName(entry, index) {
        const vid = formatUsbId(entry.usbVendorId);
        const pid = formatUsbId(entry.usbProductId);
        const nodeAddr = entry.metadata.nodeAddr;
        const hardware = entry.metadata.hardware;

        if (hardware || nodeAddr) {
            return `${hardware || "Device"} ${nodeAddr || ""} (VID:${vid} PID:${pid})`.replace(/\s+\(/, " (");
        }

        return `Device ${index + 1} (VID:${vid} PID:${pid})`;
    }
}

function comparePortEntries(a, b) {
    return compareNullableNumber(a.usbVendorId, b.usbVendorId) ||
           compareNullableNumber(a.usbProductId, b.usbProductId) ||
           (a.originalIndex - b.originalIndex);
}

function compareNullableNumber(a, b) {
    const av = Number.isInteger(a) ? a : Number.MAX_SAFE_INTEGER;
    const bv = Number.isInteger(b) ? b : Number.MAX_SAFE_INTEGER;
    return av - bv;
}

function formatUsbId(value) {
    if (!Number.isInteger(value)) {
        return "????";
    }

    return value.toString(16).toUpperCase().padStart(4, "0");
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.SerialPortStore = SerialPortStore;
})();
