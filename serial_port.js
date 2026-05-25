(function () {
const appModules = window.TermPWA || {};

const SERIAL_STATE_DISCONNECTED  = "disconnected";
const SERIAL_STATE_CONNECTING    = "connecting";
const SERIAL_STATE_CONNECTED     = "connected";
const SERIAL_STATE_DISCONNECTING = "disconnecting";

class SerialPortManager {
    constructor(onDataReceived, onDisconnect) {
        if (!appModules.SerialTransport || !appModules.SerialPortStore) {
            throw new Error("Serial transport scripts failed to load.");
        }

        this.port = null;
        this.state = SERIAL_STATE_DISCONNECTED;
        this.onDataReceived = onDataReceived;
        this.onDisconnectCallback = onDisconnect;
        this.decoder = new TextDecoder();
        this.rawListeners = new Set();
        this.byteQueue = [];
        this.byteWaiters = [];
        this.maxByteQueueLength = 4096;
        this.portStore = new appModules.SerialPortStore();
        this.transport = new appModules.SerialTransport({
            onData: bytes => this.handleIncomingBytes(bytes),
            onError: error => console.error("Read error:", error),
        });
        this.writeQueue = Promise.resolve();
    }

    isSupported() {
        return this.portStore.isSupported();
    }

    assertSupported() {
        this.portStore.assertSupported();
    }

    async getAuthorizedPorts() {
        return await this.portStore.getPorts();
    }

    async getPortEntries() {
        return await this.portStore.getEntries();
    }

    async getCurrentPortEntry() {
        return await this.portStore.getEntryForPort(this.port);
    }

    async requestNewPort() {
        return await this.portStore.requestPort();
    }

    async requestNewPortEntry() {
        return await this.portStore.requestPortEntry();
    }

    setPortMetadata(port, metadata) {
        this.portStore.setMetadata(port, metadata);
    }

    async connect(portObj = null, baudRate = 115200) {
        this.assertSupported();
        if (this.state !== SERIAL_STATE_DISCONNECTED) {
            throw new Error(`serial port is ${this.state}`);
        }

        this.state = SERIAL_STATE_CONNECTING;
        if (!portObj) {
            try {
                portObj = await this.requestNewPort();
            } catch (error) {
                this.state = SERIAL_STATE_DISCONNECTED;
                throw error;
            }
        }

        this.resetByteState();
        this.resetWriteQueue();

        try {
            await this.transport.open(portObj, { baudRate });
            this.port = portObj;
            this.state = SERIAL_STATE_CONNECTED;
            return this.port;
        } catch (error) {
            this.port = null;
            this.state = SERIAL_STATE_DISCONNECTED;
            this.resetByteState(error);
            this.resetWriteQueue();
            throw error;
        }
    }

    async disconnect({ notify = true } = {}) {
        let disconnectError = null;

        if (this.state === SERIAL_STATE_DISCONNECTED) {
            return;
        }

        if (this.state === SERIAL_STATE_CONNECTING ||
            this.state === SERIAL_STATE_DISCONNECTING) {
            throw new Error(`serial port is ${this.state}`);
        }

        this.state = SERIAL_STATE_DISCONNECTING;
        try {
            await this.writeQueue.catch(() => {});
            await this.transport.close();
        } catch (error) {
            disconnectError = error;
        } finally {
            this.port = null;
            this.state = SERIAL_STATE_DISCONNECTED;
            this.resetByteState(new Error("Serial port disconnected"));
            this.resetWriteQueue();

            if (notify && this.onDisconnectCallback) {
                this.onDisconnectCallback();
            }
        }

        if (disconnectError) {
            throw disconnectError;
        }
    }

    async write(data) {
        await this.writeText(data);
    }

    async writeText(text) {
        if (typeof text !== "string") {
            throw new TypeError("writeText expects a string");
        }

        await this.writeBytes(new TextEncoder().encode(text));
    }

    async writeBytes(bytes) {
        if (this.state !== SERIAL_STATE_CONNECTED) {
            throw new Error("Port not connected");
        }

        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError("writeBytes expects a Uint8Array");
        }

        const writeTask = this.writeQueue
            .catch(() => {})
            .then(() => {
                if (this.state !== SERIAL_STATE_CONNECTED) {
                    throw new Error("Port not connected");
                }

                return this.transport.writeBytes(bytes);
            });

        this.writeQueue = writeTask.catch(() => {});
        await writeTask;
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

    handleIncomingBytes(bytes) {
        this.handleRawBytes(bytes);
        if (this.onDataReceived) {
            this.onDataReceived(this.decoder.decode(bytes, { stream: true }), bytes);
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

    resetByteState(error = null) {
        this.byteQueue = [];
        for (const waiter of this.byteWaiters) {
            clearTimeout(waiter.timer);
            waiter.reject(error || new Error("Serial byte queue reset"));
        }
        this.byteWaiters = [];
    }

    resetWriteQueue() {
        this.writeQueue = Promise.resolve();
    }

    getState() {
        return this.state;
    }

    isBusy() {
        return (this.state === SERIAL_STATE_CONNECTING) ||
               (this.state === SERIAL_STATE_DISCONNECTING);
    }

    isConnected() {
        return this.state === SERIAL_STATE_CONNECTED &&
               this.port !== null &&
               this.transport.isOpen();
    }
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.SerialPortManager = SerialPortManager;
})();
