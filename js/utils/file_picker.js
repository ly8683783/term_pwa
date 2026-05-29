(function () {
const FIRMWARE_PICKER_ID = "amped-firmware-bin";
const CONFIG_PICKER_ID = "lr71-config-json";

function supportsOpenPicker() {
    return typeof window.showOpenFilePicker === "function";
}

function supportsSavePicker() {
    return typeof window.showSaveFilePicker === "function";
}

function isUserCancel(error) {
    return error && error.name === "AbortError";
}

async function openSingleFile(options) {
    try {
        const handles = await window.showOpenFilePicker(options);
        if (!handles || handles.length === 0) {
            return null;
        }
        return handles[0].getFile();
    } catch (error) {
        if (isUserCancel(error)) {
            return null;
        }
        throw error;
    }
}

async function openFirmwareBin() {
    const file = await openSingleFile({
        id: FIRMWARE_PICKER_ID,
        types: [{
            description: "Firmware binary",
            accept: {
                "application/octet-stream": [".bin"],
            },
        }],
    });
    if (!file) {
        return null;
    }
    return {
        file,
        name: file.name,
        size: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
    };
}

async function openConfigJson() {
    const file = await openSingleFile({
        id: CONFIG_PICKER_ID,
        types: [{
            description: "Configuration JSON",
            accept: {
                "application/json": [".json"],
            },
        }],
    });
    if (!file) {
        return null;
    }
    return {
        file,
        name: file.name,
        size: file.size,
        text: await file.text(),
    };
}

async function saveConfigJson({ suggestedName, text }) {
    try {
        const handle = await window.showSaveFilePicker({
            id: CONFIG_PICKER_ID,
            suggestedName,
            types: [{
                description: "Configuration JSON",
                accept: {
                    "application/json": [".json"],
                },
            }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return true;
    } catch (error) {
        if (isUserCancel(error)) {
            return false;
        }
        throw error;
    }
}

function downloadTextFile({ suggestedName, text, type }) {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(link.href);
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.filePicker = {
    supportsOpenPicker,
    supportsSavePicker,
    openFirmwareBin,
    openConfigJson,
    saveConfigJson,
    downloadTextFile,
};
})();
