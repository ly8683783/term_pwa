(function () {
const DEVICE_PROFILES = {
    UNKNOWN: {
        name: "Unknown",
        capabilities: ["terminal", "firmwareUpdate"],
    },
    BOOTLOADER: {
        name: "Flashloader",
        capabilities: ["terminal", "firmwareUpdate"],
    },
    LR71: {
        name: "LR71",
        configProfile: "LR71",
        capabilities: ["terminal", "firmwareUpdate", "configuration", "netview"],
    },
    "WF88-M": {
        name: "WF88-M",
        configProfile: "WF88_M",
        capabilities: ["terminal", "firmwareUpdate", "configuration"],
    },
};

function normalizeDeviceProfileName(name) {
    const normalized = String(name || "").trim().toUpperCase();
    return Object.keys(DEVICE_PROFILES).find(key => key.toUpperCase() === normalized) || null;
}

function getDeviceProfile(name) {
    const profileName = normalizeDeviceProfileName(name);
    return profileName ? DEVICE_PROFILES[profileName] : DEVICE_PROFILES.UNKNOWN;
}

function getDefaultDeviceProfile() {
    return DEVICE_PROFILES.UNKNOWN;
}

function hasDeviceCapability(name, capability) {
    const profile = getDeviceProfile(name);
    return Boolean(profile.capabilities && profile.capabilities.includes(capability));
}

function isBootloaderText(text) {
    const source = String(text || "").toLowerCase();
    const markers = [
        "lr71 flashloader",
        "main menu",
        "upload file",
        "run application",
    ];
    const hitCount = markers.reduce((count, marker) => source.includes(marker) ? count + 1 : count, 0);
    return hitCount >= 2;
}

function parseHardwareProfile(text) {
    const lines = String(text || "").split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^var\d+\s+Hardware\s*=\s*(.+)$/i);
        if (!match) {
            continue;
        }
        return normalizeDeviceProfileName(match[1]) || "UNKNOWN";
    }
    return null;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.DEVICE_PROFILES = DEVICE_PROFILES;
window.TermPWA.normalizeDeviceProfileName = normalizeDeviceProfileName;
window.TermPWA.getDeviceProfile = getDeviceProfile;
window.TermPWA.getDefaultDeviceProfile = getDefaultDeviceProfile;
window.TermPWA.hasDeviceCapability = hasDeviceCapability;
window.TermPWA.isBootloaderText = isBootloaderText;
window.TermPWA.parseHardwareProfile = parseHardwareProfile;
})();
