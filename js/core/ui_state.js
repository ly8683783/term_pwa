(function () {
    function createUiState({
        appModules = window.TermPWA || {},
        serialManager,
        serialSession,
        statusMessage,
        welcomeDeviceName,
        welcomeDeviceStatus,
        welcomeDetectDeviceBtn,
        onDeviceProfileChanged = () => {},
    } = {}) {
        let activeDeviceProfileName = "UNKNOWN";
        let welcomeStatusText = "Connect a device, then detect it.";

        function setStatusMessageText(text) {
            if (!statusMessage) {
                return;
            }
            statusMessage.textContent = text;
        }

        function setStatusMessageValue(value, tone = "") {
            if (!statusMessage) {
                return;
            }
            statusMessage.textContent = "";
            statusMessage.append(document.createTextNode("Status: "));

            const valueSpan = document.createElement("span");
            valueSpan.className = tone
                ? `terminal-status-value terminal-status-value-${tone}`
                : "terminal-status-value";
            valueSpan.textContent = value;
            statusMessage.append(valueSpan);
        }

        function setActiveDeviceProfile(profileName, statusText = "") {
            activeDeviceProfileName = appModules.normalizeDeviceProfileName(profileName) || "UNKNOWN";
            if (statusText) {
                welcomeStatusText = statusText;
            }
            onDeviceProfileChanged(activeDeviceProfileName);
            renderWelcomeDevice();
        }

        function setWelcomeStatus(statusText) {
            welcomeStatusText = statusText;
            renderWelcomeDevice();
        }

        function renderWelcomeDevice(statusOverride = "") {
            const profile = appModules.getDeviceProfile
                ? appModules.getDeviceProfile(activeDeviceProfileName)
                : { name: "Unknown", capabilities: ["terminal", "firmwareUpdate"] };
            const connected = serialManager && serialManager.isConnected();
            const busy = serialManager && serialManager.isBusy();

            if (welcomeDeviceName) {
                welcomeDeviceName.textContent = profile.name || "Unknown";
            }
            if (welcomeDeviceStatus) {
                welcomeDeviceStatus.textContent = statusOverride || welcomeStatusText ||
                    (connected ? "Device connected. Click Detect Device." : "Connect a device, then detect it.");
            }
            if (welcomeDetectDeviceBtn) {
                welcomeDetectDeviceBtn.disabled = !connected || busy;
                welcomeDetectDeviceBtn.textContent = busy && serialSession.getActiveOwner() === "device-detect"
                    ? "Detecting..."
                    : "Detect Device";
            }
        }

        function hasActiveCapability(capability) {
            return appModules.hasDeviceCapability
                ? appModules.hasDeviceCapability(activeDeviceProfileName, capability)
                : false;
        }

        return {
            getActiveDeviceProfileName: () => activeDeviceProfileName,
            hasActiveCapability,
            renderWelcomeDevice,
            setActiveDeviceProfile,
            setStatusMessageText,
            setStatusMessageValue,
            setWelcomeStatus,
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createUiState = createUiState;
})();
