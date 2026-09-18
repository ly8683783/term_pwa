(function () {
    function createManualDeviceSelector({
        select,
        button,
        appModules = window.TermPWA || {},
        getProfiles = () => [],
        getSelection = () => ({ profileName: "UNKNOWN", source: "unknown" }),
        isConnected = () => false,
        isBusy = () => false,
        onApply = () => {},
    } = {}) {
        if (!select || !button) {
            return { render() {}, dispose() {} };
        }

        const profiles = getProfiles();
        const profileNames = new Set(profiles.map(profile => profile.profileName));

        select.replaceChildren(new Option("Select device type...", ""));
        profiles.forEach(profile => {
            select.appendChild(new Option(profile.name, profile.profileName));
        });

        function normalizeProfileName(value) {
            return typeof appModules.normalizeDeviceProfileName === "function"
                ? appModules.normalizeDeviceProfileName(value)
                : String(value || "").trim().toUpperCase();
        }

        function render({ syncSelection = true } = {}) {
            const selection = getSelection() || {};
            const connected = Boolean(isConnected());
            const busy = Boolean(isBusy());
            if (!connected) {
                select.value = "";
            } else if (syncSelection) {
                select.value = selection.source === "manual" && profileNames.has(selection.profileName)
                    ? selection.profileName
                    : "";
            }

            const selectedProfileName = normalizeProfileName(select.value);
            const validProfile = profileNames.has(selectedProfileName);
            const selectionApplied = selection.source === "manual" &&
                selection.profileName === selectedProfileName;
            select.disabled = !connected || busy;
            button.disabled = !connected || busy || !validProfile || selectionApplied;
            button.textContent = selectionApplied ? "Applied" : "Use This Type";
        }

        function handleChange() {
            render({ syncSelection: false });
        }

        function handleApply() {
            const profileName = normalizeProfileName(select.value);
            const profile = profiles.find(item => item.profileName === profileName);
            if (!profile || button.disabled) {
                render();
                return;
            }
            onApply(profile);
            render();
        }

        select.addEventListener("change", handleChange);
        button.addEventListener("click", handleApply);
        render();

        return {
            render,
            dispose() {
                select.removeEventListener("change", handleChange);
                button.removeEventListener("click", handleApply);
            },
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createManualDeviceSelector = createManualDeviceSelector;
})();
