(function () {
function hexToBytes(hex) {
    const value = String(hex).replace(/[\s,]+/g, "");
    if (!value || (value.length % 2) !== 0 || /[^0-9a-fA-F]/.test(value)) {
        throw new Error(`invalid HEX: ${hex}`);
    }

    const bytes = new Uint8Array(value.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHexText(bytes) {
    return Array.from(bytes, value => value.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function textToHexText(text) {
    return bytesToHexText(new TextEncoder().encode(String(text)));
}

function hexTextToText(hexText) {
    return new TextDecoder("utf-8", { fatal: false }).decode(hexToBytes(hexText));
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.hexToBytes = hexToBytes;
window.TermPWA.bytesToHexText = bytesToHexText;
window.TermPWA.textToHexText = textToHexText;
window.TermPWA.hexTextToText = hexTextToText;
})();
