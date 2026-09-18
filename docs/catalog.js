(function (root) {
    root.TermPWA = root.TermPWA || {};
    root.TermPWA.DOCUMENTATION_HELP = {
        id: "help",
        title: "Web Configurator User Guide",
        path: "help/README.md",
        assets: [
            "help/assets/connection-overview.png",
            "help/assets/serial-port-picker.png",
            "help/assets/connected-status.png",
            "help/assets/device-detected.png",
            "help/assets/automatic-connection.png",
            "help/assets/terminal-overview.png",
            "help/assets/terminal-command-controls.png",
            "help/assets/terminal-command-response.png",
            "help/assets/terminal-direct-input.png",
            "help/assets/terminal-hex.png",
            "help/assets/terminal-interval.png",
            "help/assets/terminal-toolbar.png",
            "help/assets/quick-send-overview.png",
            "help/assets/quick-send-command-row.png",
            "help/assets/quick-send-add-item.png",
            "help/assets/quick-send-management.png",
            "help/assets/quick-send-layout-controls.png",
            "help/assets/quick-send-collapsed.png",
            "help/assets/configuration-overview.png",
            "help/assets/configuration-toolbar.png",
            "help/assets/configuration-field-types.png",
            "help/assets/configuration-changed-value.png",
            "help/assets/configuration-field-help.png",
            "help/assets/configuration-file-actions.png",
            "help/assets/firmware-update-overview.png",
            "help/assets/firmware-update-warning.png",
            "help/assets/firmware-update-console.png",
            "help/assets/firmware-update-actions.png",
            "help/assets/firmware-update-file-selected.png",
        ],
    };
    root.TermPWA.DOCUMENTATION_GROUPS = [
        {
            id: "wf88",
            title: "WF88",
            documents: [
                {
                    id: "wf88-api-guide",
                    title: "WLAN API Reference Guide",
                    path: "WF88/README.md",
                    assets: [],
                },
                {
                    id: "wf88-app-demo-quick-start",
                    title: "app_demo Quick Start",
                    path: "WF88/Quick_Start.md",
                    assets: [],
                },
                {
                    id: "wf88-app-demo-build-guide",
                    title: "WF88 app_demo Build and Complete Firmware Package Guide",
                    path: "WF88/wf88_app_demo_build_guide.md",
                    assets: [],
                },
                {
                    id: "wf88-bootloader-guide",
                    title: "WF88 Bootloader User Guide",
                    path: "WF88/wf88_bootloader_guide.md",
                    assets: [],
                },
                {
                    id: "wf88-bootloader-upgrade-guide",
                    title: "WF88 Bootloader Upgrade Guide",
                    path: "WF88/wf88_bootloader_upgrade_guide.md",
                    assets: [],
                },
            ],
        },
        {
            id: "lr71",
            title: "LR71",
            documents: [],
        },
    ];
})(typeof self !== "undefined" ? self : globalThis);
