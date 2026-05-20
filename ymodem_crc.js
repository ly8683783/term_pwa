(function () {
const SOH = 0x01;
const STX = 0x02;
const EOT = 0x04;
const ACK = 0x06;
const NAK = 0x15;
const CAN = 0x18;
const CRC_REQUEST = 0x43;
const PACKET_SIZE = 1024;
const PACKET_TOTAL_SIZE = 3 + PACKET_SIZE + 2;
const DEFAULT_WAIT_MS = 10000;
const INITIAL_C_WAIT_MS = 15000;
const MAX_RETRIES = 5;

function createYModemSender({
    writeBytes,
    waitByte,
    onProgress = () => {},
    onLog = () => {},
} = {}) {
    if (typeof writeBytes !== "function") {
        throw new TypeError("createYModemSender requires writeBytes");
    }
    if (typeof waitByte !== "function") {
        throw new TypeError("createYModemSender requires waitByte");
    }

    let cancelled = false;

    async function sendFile({ name, bytes }) {
        if (!name) {
            throw new Error("YMODEM filename is required");
        }
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError("YMODEM bytes must be Uint8Array");
        }
        if (bytes.length === 0) {
            throw new Error("YMODEM file must not be empty");
        }

        cancelled = false;
        onProgress({ phase: "waiting-c", sentBytes: 0, totalBytes: bytes.length, percent: 0 });
        onLog("Waiting for receiver CRC request");
        await waitForByte(CRC_REQUEST, INITIAL_C_WAIT_MS, "C");

        onProgress({ phase: "header", sentBytes: 0, totalBytes: bytes.length, percent: 0 });
        await sendPacketWithRetry(0, createHeaderPayload(name, bytes.length), "header");
        // sendPacketWithRetry() already waits for ACK. The LR71 flashloader then
        // sends 'C' to request the first data packet.
        await waitForByte(CRC_REQUEST, DEFAULT_WAIT_MS, "C after header");
        onLog("Header accepted, receiver requested data");

        let seq = 1;
        let offset = 0;
        while (offset < bytes.length) {
            throwIfCancelled();
            const payload = createDataPayload(bytes, offset);
            await sendPacketWithRetry(seq & 0xff, payload, `data #${seq}`);

            offset += Math.min(PACKET_SIZE, bytes.length - offset);
            onProgress({
                phase: "data",
                sentBytes: offset,
                totalBytes: bytes.length,
                percent: bytes.length === 0 ? 100 : Math.floor((offset * 100) / bytes.length),
            });
            seq++;
        }

        onProgress({ phase: "finish", sentBytes: bytes.length, totalBytes: bytes.length, percent: 100 });
        await writeBytes(new Uint8Array([EOT]));
        await waitForByte(NAK, DEFAULT_WAIT_MS, "NAK after first EOT");
        await writeBytes(new Uint8Array([EOT]));
        await waitForByte(ACK, DEFAULT_WAIT_MS, "ACK after second EOT");

        await ignoreOptionalAck();
        onProgress({ phase: "done", sentBytes: bytes.length, totalBytes: bytes.length, percent: 100 });
        onLog("YMODEM transfer finished");
    }

    function cancel() {
        cancelled = true;
        return writeBytes(new Uint8Array([CAN, CAN]));
    }

    async function sendPacketWithRetry(seq, payload, label) {
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            throwIfCancelled();
            onLog(`Send ${label}, attempt ${attempt}`);
            await writeBytes(createPacket(seq, payload));

            const response = await waitAnyByte([ACK, NAK, CAN], DEFAULT_WAIT_MS, `${label} response`);
            if (response === ACK) {
                return;
            }
            if (response === CAN) {
                throw new Error(`Receiver cancelled during ${label}`);
            }
            onLog(`Receiver requested retry for ${label}`);
        }
        throw new Error(`Retry limit exceeded for ${label}`);
    }

    async function waitForByte(expected, timeoutMs, label) {
        const byte = await waitAnyByte([expected, CAN], timeoutMs, label);
        if (byte === CAN) {
            throw new Error(`Receiver cancelled while waiting for ${label}`);
        }
        return byte;
    }

    async function waitAnyByte(expectedBytes, timeoutMs, label) {
        throwIfCancelled();
        const expected = new Set(expectedBytes);
        const byte = await waitByte({
            timeoutMs,
            accept: value => expected.has(value),
        });
        throwIfCancelled();
        return byte;
    }

    async function ignoreOptionalAck() {
        try {
            await waitByte({
                timeoutMs: 200,
                accept: value => value === ACK,
            });
        } catch (error) {
            // The LR71 flashloader may send an extra ACK at finish, but not always.
        }
    }

    function throwIfCancelled() {
        if (cancelled) {
            throw new Error("YMODEM transfer cancelled");
        }
    }

    return {
        sendFile,
        cancel,
    };
}

function createHeaderPayload(name, size) {
    const payload = new Uint8Array(PACKET_SIZE);
    const encoder = new TextEncoder();
    const nameBytes = encoder.encode(name);
    const sizeBytes = encoder.encode(String(size));
    const maxNameLength = PACKET_SIZE - sizeBytes.length - 2;

    if (maxNameLength < 1) {
        throw new Error("YMODEM filename is too long");
    }

    // Block 0 format is "filename\0filesize\0..."; keep room for both NUL bytes
    // so the LR71 flashloader can always parse the decimal file size.
    const clippedName = nameBytes.slice(0, maxNameLength);
    payload.set(clippedName, 0);
    payload.set(sizeBytes, clippedName.length + 1);
    return payload;
}

function createDataPayload(bytes, offset) {
    const payload = new Uint8Array(PACKET_SIZE);
    payload.fill(0x1a);
    payload.set(bytes.slice(offset, offset + PACKET_SIZE), 0);
    return payload;
}

function createPacket(seq, payload) {
    if (!(payload instanceof Uint8Array) || payload.length !== PACKET_SIZE) {
        throw new TypeError("YMODEM packet payload must be 1024 bytes");
    }

    const packet = new Uint8Array(PACKET_TOTAL_SIZE);
    packet[0] = STX;
    packet[1] = seq & 0xff;
    packet[2] = 0xff - packet[1];
    packet.set(payload, 3);

    const crc = crc16Xmodem(payload);
    packet[PACKET_TOTAL_SIZE - 2] = (crc >> 8) & 0xff;
    packet[PACKET_TOTAL_SIZE - 1] = crc & 0xff;
    return packet;
}

function crc16Xmodem(bytes) {
    let crc = 0x0000;
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff;
            } else {
                crc = (crc << 1) & 0xffff;
            }
        }
    }
    return crc & 0xffff;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createYModemSender = createYModemSender;
window.TermPWA.ymodemCrc16Xmodem = crc16Xmodem;
window.TermPWA.ymodemCreatePacket = createPacket;
})();
