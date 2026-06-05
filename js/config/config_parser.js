(function () {
function parseHardwareName(text) {
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^var\d+\s+Hardware\s*=\s*(.+)$/i);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

function findProfileName(hardwareName) {
    const profileName = window.TermPWA.normalizeDeviceProfileName
        ? window.TermPWA.normalizeDeviceProfileName(hardwareName)
        : null;
    const deviceProfile = profileName ? window.TermPWA.getDeviceProfile(profileName) : null;
    const configProfile = deviceProfile ? deviceProfile.configProfile : null;
    return configProfile && window.TermPWA.CONFIG_PROFILES[configProfile] ? configProfile : null;
}

function normalizeValue(item, value) {
    if (item.control === "bool") {
        return value === true || value === "1" || value === "true" ? "true" : "false";
    }
    if (item.control === "hex") {
        return value.toUpperCase();
    }
    return value;
}

function normalizeForCommand(item, value) {
    if (item.control === "bool") {
        return value === true || value === "true" || value === "1" ? "true" : "false";
    }
    return value;
}

function validateImportShape(data) {
    if (!data || typeof data !== "object" || !data.format || !Array.isArray(data.items)) {
        throw new Error("Invalid config JSON");
    }
}

function buildImportSummary(data, { values, itemByVar, loaded, isReadonlyItem }) {
    const summary = {
        changed: 0,
        unchanged: 0,
        skippedReadonly: 0,
        skippedMissing: 0,
        skippedUnsupported: 0,
        skippedNameMismatch: 0,
        changes: [],
    };

    for (const imported of data.items) {
        const item = itemByVar.get(Number(imported.varNo));
        if (!item) {
            summary.skippedUnsupported++;
            continue;
        }
        if (imported.name && imported.name !== item.name) {
            summary.skippedNameMismatch++;
            continue;
        }
        if (isReadonlyItem(item)) {
            summary.skippedReadonly++;
            continue;
        }
        if (!loaded.has(item.varNo)) {
            summary.skippedMissing++;
            continue;
        }

        const currentValue = values.get(item.varNo) ?? "";
        const importedValue = normalizeValue(item, String(imported.value ?? ""));
        if (String(importedValue ?? "") === String(currentValue ?? "")) {
            summary.unchanged++;
            continue;
        }

        summary.changed++;
        summary.changes.push({
            item,
            value: importedValue,
            previousValue: currentValue,
        });
    }

    return summary;
}

function parseConfigList(readBuffer, itemByVar, itemByName) {
    let count = 0;
    const re = /^var(\d+)\s+(.+?)\s*=\s*(.*)$/gm;
    let match;
    const updates = [];
    
    while ((match = re.exec(readBuffer)) !== null) {
        const varNo = Number(match[1]);
        const name = match[2].trim();
        const value = match[3].trim();
        const item = itemByVar.get(varNo) || itemByName.get(name.toLowerCase());
        if (!item) continue;
        const normalized = normalizeValue(item, value);
        
        updates.push({
            item,
            value: normalized
        });
        count++;
    }
    
    return { count, updates };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.parseHardwareName = parseHardwareName;
window.TermPWA.findProfileName = findProfileName;
window.TermPWA.normalizeValue = normalizeValue;
window.TermPWA.normalizeForCommand = normalizeForCommand;
window.TermPWA.validateImportShape = validateImportShape;
window.TermPWA.buildImportSummary = buildImportSummary;
window.TermPWA.parseConfigList = parseConfigList;
})();