(function () {
const NETVIEW_RESPONSE_IDLE_MS = 1500;
const NETVIEW_REFRESH_DELAY_MS = 10000;
const NETVIEW_INFO_TIMEOUT_MS = 5000;
const NETVIEW_RESPONSE_TIMEOUT_MS = 20000;
const NETVIEW_DRAW_DEBOUNCE_MS = 500;
const NETVIEW_RESIZE_DEBOUNCE_MS = 120;
const parseATInfo = window.TermPWA.parseATInfo;
const clearTopology = window.TermPWA.clearTopology;
const renderTopology = window.TermPWA.renderTopology;

function createNetViewPage({
    serialManager,
    serialSession,
    writeTerminal = () => {},
    selectors = {},
} = {}) {
    const startButton = document.querySelector(selectors.startButton || "#btnStartNetView");
    const stopButton = document.querySelector(selectors.stopButton || "#btnStopNetView");
    const clearButton = document.querySelector(selectors.clearButton || "#btnClearNetView");
    const statusElement = document.querySelector(selectors.status || "#netViewStatus");
    const groupTag = document.querySelector(selectors.groupTag || "#netViewGroupTag");
    const svgSelector = selectors.topology || "#topology";

    let isCollecting = false;
    let state = "idle";
    let infoBuffer = "";
    let topologyBuffer = "";
    let localNode = null;
    let groupAddr = null;
    let drawTimer = null;
    let infoTimer = null;
    let responseIdleTimer = null;
    let responseTimeoutTimer = null;
    let refreshTimer = null;
    let sessionToken = null;

    startButton.addEventListener("click", () => {
        start().catch(error => {
            console.error("Failed to start NetView", error);
            stop();
            setStatus(`Status: failed to start NetView - ${error.message}`);
        });
    });

    stopButton.addEventListener("click", () => {
        stop();
        redraw();
        writeTerminal("> [NetView Stopped]\n");
    });

    clearButton.addEventListener("click", () => {
        clear();
        writeTerminal("> [NetView Cleared]\n");
    });

    window.addEventListener("resize", () => {
        clearTimeout(drawTimer);
        drawTimer = setTimeout(redraw, NETVIEW_RESIZE_DEBOUNCE_MS);
    });

    function handleSerialData(data) {
        if (!isCollecting) {
            return;
        }

        if (state === "reading_info") {
            infoBuffer += data;
            const info = parseATInfo(infoBuffer);
            if (info) {
                startTopology(info).catch(error => {
                    console.error("Failed to start topology collection", error);
                    stop(`Status: failed to start loranet - ${error.message}`);
                });
            }
            return;
        }

        if (state === "collecting_topology" || state === "waiting_refresh") {
            if (state === "waiting_refresh") {
                clearTimeout(refreshTimer);
                refreshTimer = null;
                state = "collecting_topology";
            }
            topologyBuffer += data;
            clearTimeout(drawTimer);
            drawTimer = setTimeout(redraw, NETVIEW_DRAW_DEBOUNCE_MS);
            armResponseIdleTimer();
        }
    }

    function handleConnected() {
        if (!isCollecting) {
            startButton.disabled = !canStart();
            stopButton.disabled = true;
            setStatus(canStart() ? "Status: ready." : `Status: ${serialSession.getStatusText()}.`);
        }
    }

    function handleDisconnected(message = "Status: connect a serial device to start NetView.") {
        isCollecting = false;
        state = "idle";
        clearAllTimers();
        releaseSession();
        startButton.disabled = true;
        stopButton.disabled = true;
        setStatus(message);
    }

    function handleUnavailable(message) {
        handleDisconnected(message);
    }

    async function start() {
        if (!serialManager.isConnected()) {
            setStatus("Status: connect a serial device before starting NetView.");
            return;
        }
        sessionToken = serialSession.acquire("netview", "NetView");

        isCollecting = true;
        state = "reading_info";
        infoBuffer = "";
        topologyBuffer = "";
        localNode = null;
        groupAddr = null;
        clearAllTimers();

        startButton.disabled = true;
        stopButton.disabled = false;
        groupTag.innerText = "Group --";
        setStatus("Status: reading device info...");
        clearTopology(svgSelector);

        await serialSession.writeATCommand("netview", "at+ab info");
        infoTimer = setTimeout(() => {
            if (isCollecting && state === "reading_info") {
                stop("Status: failed to parse at+ab info; missing Node Addr or Publish Addr.");
            }
        }, NETVIEW_INFO_TIMEOUT_MS);
        writeTerminal("> [NetView Started] at+ab info\n");
    }

    function stop(message = null) {
        isCollecting = false;
        state = "idle";
        clearAllTimers();
        releaseSession();
        if (serialManager.isConnected()) {
            startButton.disabled = false;
        }
        stopButton.disabled = true;
        setStatus(message || (topologyBuffer.trim()
            ? "Status: stopped. Showing latest topology data."
            : "Status: stopped. No topology rows received."));
    }

    function clear() {
        isCollecting = false;
        state = "idle";
        infoBuffer = "";
        topologyBuffer = "";
        localNode = null;
        groupAddr = null;
        clearAllTimers();
        releaseSession();
        groupTag.innerText = "Group --";
        clearTopology(svgSelector);
        if (serialManager.isConnected()) {
            startButton.disabled = false;
        }
        stopButton.disabled = true;
        setStatus("Status: topology cleared.");
    }

    async function startTopology(info) {
        if (!isCollecting || state !== "reading_info") {
            return;
        }

        localNode = info.localNode;
        groupAddr = info.groupAddr;
        state = "collecting_topology";
        clearTimeout(infoTimer);
        infoTimer = null;
        groupTag.innerText = `Group ${groupAddr}`;
        setStatus(`Status: Local ${localNode}, starting group ${groupAddr} refresh...`);

        writeTerminal(`> [NetView] Local=${localNode} Group=${groupAddr}\n`);
        await sendLoraNetCommand();
    }

    async function sendLoraNetCommand() {
        if (!isCollecting || !serialManager.isConnected() || !groupAddr) {
            return;
        }

        clearCycleTimers();
        state = "collecting_topology";
        topologyBuffer = "";
        setStatus(`Status: collecting group ${groupAddr} from Local ${localNode}...`);

        const cmd = `at+ab loranet ${groupAddr}`;
        await serialSession.writeATCommand("netview", cmd);
        responseTimeoutTimer = setTimeout(() => {
            if (isCollecting && state === "collecting_topology") {
                stop("Status: no response from at+ab loranet. Please check whether the device is normal.");
            }
        }, NETVIEW_RESPONSE_TIMEOUT_MS);
        writeTerminal(`> [NetView Refresh] ${cmd}\n`);
    }

    function armResponseIdleTimer() {
        clearTimeout(responseIdleTimer);
        responseIdleTimer = setTimeout(() => {
            finishResponseCycle();
        }, NETVIEW_RESPONSE_IDLE_MS);
    }

    function finishResponseCycle() {
        if (!isCollecting || state !== "collecting_topology") {
            return;
        }

        clearTimeout(responseIdleTimer);
        responseIdleTimer = null;
        clearTimeout(responseTimeoutTimer);
        responseTimeoutTimer = null;
        state = "waiting_refresh";
        redraw();
        setStatus(`Status: refresh complete. Next refresh in ${NETVIEW_REFRESH_DELAY_MS / 1000}s.`);

        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            sendLoraNetCommand().catch(error => {
                console.error("NetView refresh failed", error);
                stop(`Status: refresh failed - ${error.message}`);
            });
        }, NETVIEW_REFRESH_DELAY_MS);
    }

    function redraw() {
        const result = renderTopology({
            svgSelector,
            buffer: topologyBuffer,
            localNode,
        });

        if (!result.d3Ready) {
            setStatus("Status: D3 failed to load; topology cannot be drawn.");
            return result;
        }

        if (!result.visible) {
            return result;
        }

        if (result.empty) {
            if (isCollecting) {
                setStatus(state === "reading_info"
                    ? "Status: reading device info..."
                    : `Status: collecting group ${groupAddr || "--"} from Local ${localNode || "--"}...`);
            }
            return result;
        }

        setStatus(isCollecting
            ? `Status: collecting group ${groupAddr || "--"} from Local ${result.localNode}. Parsed ${result.nodesCount} nodes and ${result.linksCount} links.`
            : `Status: showing group ${groupAddr || "--"} from Local ${result.localNode}. ${result.nodesCount} nodes and ${result.linksCount} links.`);
        return result;
    }

    function clearCycleTimers() {
        clearTimeout(responseIdleTimer);
        clearTimeout(responseTimeoutTimer);
        clearTimeout(refreshTimer);
        responseIdleTimer = null;
        responseTimeoutTimer = null;
        refreshTimer = null;
    }

    function clearAllTimers() {
        clearTimeout(drawTimer);
        clearTimeout(infoTimer);
        clearCycleTimers();
        drawTimer = null;
        infoTimer = null;
    }

    function setStatus(message) {
        statusElement.innerText = message;
    }

    function handleSessionChanged() {
        if (isCollecting) {
            return;
        }
        startButton.disabled = !canStart();
        if (serialManager.isConnected() && !canStart()) {
            setStatus(`Status: ${serialSession.getStatusText()}.`);
        } else if (serialManager.isConnected()) {
            setStatus("Status: ready.");
        }
    }

    function canStart() {
        return serialManager.isConnected() && serialSession.canWrite("netview");
    }

    function releaseSession() {
        if (!sessionToken) {
            return;
        }
        sessionToken.release();
        sessionToken = null;
    }

    return {
        handleSerialData,
        handleConnected,
        handleDisconnected,
        handleUnavailable,
        handleSessionChanged,
        redraw,
        stop,
        clear,
        isCollecting: () => isCollecting,
    };
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.createNetViewPage = createNetViewPage;
})();
