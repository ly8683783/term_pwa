export class SerialPortManager {
    constructor(onDataReceived, onDisconnect) {
        this.port = null;
        this.reader = null;
        this.onDataReceived = onDataReceived;
        this.onDisconnectCallback = onDisconnect;
        this.keepReading = false;
        this.readPromise = null;
        this.decoder = new TextDecoder();
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
        this.port = portObj;

        await this.port.open({ baudRate });

        this.keepReading = true;
        this.readPromise = this.readLoop();
        return this.port;
    }

    async disconnect() {
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

        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    async write(data) {
        if (!this.port || !this.port.writable) {
            throw new Error("Port not connected or not writable");
        }

        const encoder = new TextEncoder();
        const writer = this.port.writable.getWriter();
        try {
            await writer.write(encoder.encode(data));
        } finally {
            writer.releaseLock();
        }
    }

    async writeATCommand(cmd) {
        await this.write(cmd + "\r\n");
    }

    async readLoop() {
        while (this.port && this.port.readable && this.keepReading) {
            this.reader = this.port.readable.getReader();
            try {
                while (this.keepReading) {
                    const { value, done } = await this.reader.read();
                    if (done) break;
                    if (value && this.onDataReceived) {
                        this.onDataReceived(this.decoder.decode(value, { stream: true }));
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

    isConnected() {
        return this.port !== null;
    }
}
