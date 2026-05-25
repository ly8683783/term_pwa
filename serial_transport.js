(function () {
class SerialTransport {
    constructor({
        onData = () => {},
        onError = () => {},
    } = {}) {
        this.port = null;
        this.reader = null;
        this.keepReading = false;
        this.readPromise = null;
        this.onData = onData;
        this.onError = onError;
    }

    async open(port, options = {}) {
        if (!port) {
            throw new Error("serial port is required");
        }
        if (this.port) {
            throw new Error("serial port is already open");
        }

        await port.open(options);
        this.port = port;
        this.keepReading = true;
        this.readPromise = this.readLoop();
        return this.port;
    }

    async close() {
        this.keepReading = false;

        if (this.reader) {
            await this.reader.cancel();
        }

        if (this.readPromise) {
            await this.readPromise;
            this.readPromise = null;
        }

        if (this.port) {
            const port = this.port;
            this.port = null;
            await port.close();
        }
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

    isOpen() {
        return this.port !== null;
    }

    async readLoop() {
        while (this.port && this.port.readable && this.keepReading) {
            this.reader = this.port.readable.getReader();
            try {
                while (this.keepReading) {
                    const { value, done } = await this.reader.read();
                    if (done) {
                        this.keepReading = false;
                        break;
                    }
                    if (value) {
                        this.onData(value);
                    }
                }
            } catch (error) {
                if (this.keepReading) {
                    this.onError(error);
                }
            } finally {
                if (this.reader) {
                    this.reader.releaseLock();
                    this.reader = null;
                }
            }
        }
    }
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.SerialTransport = SerialTransport;
})();
