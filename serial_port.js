(function () {
class SerialPortManager {
    constructor(onDataReceived, onDisconnect) {
        this.port = null;
        this.reader = null;
        this.onDataReceived = onDataReceived;
        this.onDisconnectCallback = onDisconnect;
        this.keepReading = false;
        this.readPromise = null;
        this.decoder = new TextDecoder();
        this.rawListeners = new Set();
        this.byteQueue = [];
        this.byteWaiters = [];
        this.maxByteQueueLength = 4096;
    }

    isSupported() {
        return Boolean(navigator.serial);
    }

    assertSupported() {
        if (!this.isSupported()) {
            throw new Error("Web Serial is unavailable. Use Chrome or Chromium over localhost or HTTPS.");
        }
    }

    async getAuthorizedPorts() {
        this.assertSupported();
        return await navigator.serial.getPorts();
    }

    async requestNewPort() {
        this.assertSupported();
        return await navigator.serial.requestPort();
    }

    async connect(portObj = null, baudRate = 115200) {
        this.assertSupported();
        if (!portObj) {
            portObj = await this.requestNewPort();
        }
        await portObj.open({ baudRate });

        this.port = portObj;
        this.keepReading = true;
        this.readPromise = this.readLoop();
        return this.port;
    }

    async disconnect({ notify = true } = {}) {
        this.keepReading = false;

        if (this.reader) {
            await this.reader.cancel();
        }

        if (this.readPromise) {
            await this.readPromise;
            this.readPromise = null;
        }

        if (this.port) {
            await this.port.close();
            this.port = null;
        }

        if (notify && this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    async write(data) {
        await this.writeText(data);
    }

    async writeText(text) {
        if (typeof text !== "string") {
            throw new TypeError("writeText expects a string");
        }

        const encoder = new TextEncoder();
        await this.writeBytes(encoder.encode(text));
    }

    async writeBytes(bytes) {
        if (!this.port || !this.port.writable) {
            throw new Error("Port not connected or not writable");
        }

        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError("writeBytes expects a Uint8Array");
        }

        const writer = this.port.writable.getWriter();
        try {
            await writer.write(bytes);
        } finally {
            writer.releaseLock();
        }
    }

    async writeATCommand(cmd) {
        await this.writeText(cmd + "\r\n");
    }

    addRawListener(listener) {
        this.rawListeners.add(listener);
    }

    removeRawListener(listener) {
        this.rawListeners.delete(listener);
    }

    clearByteQueue() {
        this.byteQueue = [];
    }

    waitByte({
        timeoutMs = 10000,
        accept = null,
    } = {}) {
        const found = this.takeQueuedByte(accept);
        if (found !== null) {
            return Promise.resolve(found);
        }

        return new Promise((resolve, reject) => {
            const waiter = {
                accept,
                resolve,
                reject,
                timer: null,
            };

            waiter.timer = setTimeout(() => {
                this.byteWaiters = this.byteWaiters.filter(item => item !== waiter);
                reject(new Error("Timed out waiting for serial byte"));
            }, timeoutMs);

            this.byteWaiters.push(waiter);
        });
    }

    async readLoop() {
        while (this.port && this.port.readable && this.keepReading) {
            this.reader = this.port.readable.getReader();
            try {
                while (this.keepReading) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    if (value) {
                        this.handleRawBytes(value);
                        if (this.onDataReceived) {
                            this.onDataReceived(this.decoder.decode(value, { stream: true }), value);
                        }
                    }
                }
            } catch (error) {
                if (this.keepReading) {
                    console.error("Read error:", error);
                }
            } finally {
                if (this.reader) {
                    this.reader.releaseLock();
                    this.reader = null;
                }
            }
        }
    }

    handleRawBytes(bytes) {
        for (const listener of this.rawListeners) {
            listener(bytes);
        }

        for (const byte of bytes) {
            if (!this.resolveByteWaiter(byte)) {
                this.byteQueue.push(byte);
                if (this.byteQueue.length > this.maxByteQueueLength) {
                    this.byteQueue.shift();
                }
            }
        }
    }

    resolveByteWaiter(byte) {
        for (let i = 0; i < this.byteWaiters.length; i++) {
            const waiter = this.byteWaiters[i];
            if (waiter.accept && !waiter.accept(byte)) {
                continue;
            }

            this.byteWaiters.splice(i, 1);
            clearTimeout(waiter.timer);
            waiter.resolve(byte);
            return true;
        }
        return false;
    }

    takeQueuedByte(accept) {
        for (let i = 0; i < this.byteQueue.length; i++) {
            const byte = this.byteQueue[i];
            if (accept && !accept(byte)) {
                continue;
            }
            this.byteQueue.splice(i, 1);
            return byte;
        }
        return null;
    }

    isConnected() {
        return this.port !== null;
    }
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.SerialPortManager = SerialPortManager;
})();
