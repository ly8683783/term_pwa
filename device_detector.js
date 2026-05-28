(function () {
const DETECT_OWNER = "device-detect";
const BOOTLOADER_WAIT_MS = 300;
const APPLICATION_WAIT_MS = 3000;

function createDeviceDetector({
    serialSession,
    serialBus,
    debugLog = () => {},
} = {}) {
    if (!serialSession) {
        throw new Error("createDeviceDetector requires serialSession");
    }
    if (!serialBus) {
        throw new Error("createDeviceDetector requires serialBus");
    }

    let rxBuffer = "";
    const unsubscribe = serialBus.subscribeText(DETECT_OWNER, text => {
        rxBuffer += text;
    }, { always: true });

    async function detect() {
        rxBuffer = "";
        return serialSession.runExclusive(DETECT_OWNER, "Device Detection", async () => {
            debugLog("device detect bootloader check start");
            await serialSession.writeText(DETECT_OWNER, "\r");
            await sleep(BOOTLOADER_WAIT_MS);

            if (window.TermPWA.isBootloaderText(rxBuffer)) {
                debugLog("device detect bootloader matched");
                return {
                    profileName: "BOOTLOADER",
                    mode: "bootloader",
                    rawText: rxBuffer,
                };
            }

            rxBuffer = "";
            debugLog("device detect application check start");
            await serialSession.writeATCommand(DETECT_OWNER, "at+ab config Hardware");

            const profileName = await waitForHardwareProfile();
            if (profileName && profileName !== "UNKNOWN") {
                debugLog("device detect application matched", { profileName });
                return {
                    profileName,
                    mode: "application",
                    rawText: rxBuffer,
                };
            }

            debugLog("device detect unknown");
            return {
                profileName: "UNKNOWN",
                mode: "unknown",
                rawText: rxBuffer,
            };
        });
    }

    function dispose() {
        unsubscribe();
    }

    async function waitForHardwareProfile() {
        const deadline = Date.now() + APPLICATION_WAIT_MS;
        while (Date.now() < deadline) {
            const profileName = window.TermPWA.parseHardwareProfile(rxBuffer);
            if (profileName) {
                return profileName;
            }
            await sleep(20);
        }
        return window.TermPWA.parseHardwareProfile(rxBuffer);
    }

    return {
        detect,
        dispose,
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createDeviceDetector = createDeviceDetector;
})();
