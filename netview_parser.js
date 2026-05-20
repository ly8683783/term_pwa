(function () {
function parseATInfo(text) {
    const nodeMatch = text.match(/^\s*Node\s+Addr\s+([0-9A-Fa-f]{4})\s*$/m);
    const groupMatch = text.match(/^\s*Publish\s+Addr\s+([0-9A-Fa-f]{4})\s*$/m);

    if (!nodeMatch || !groupMatch) {
        return null;
    }

    return {
        localNode: nodeMatch[1].toUpperCase(),
        groupAddr: groupMatch[1].toUpperCase(),
    };
}

function parseLoraNet(text, localNode) {
    if (!localNode) {
        return { nodes: [], links: [], localNode: "----" };
    }
    localNode = localNode.toUpperCase();

    const rows = [];
    const lineRe = /^(\d+):([0-9A-Fa-f]{4})\s+(-?\d+)\s+([0-9A-Fa-f]{4})$/;

    for (const line of text.split("\n")) {
        const match = line.trim().match(lineRe);
        if (!match) continue;
        rows.push({
            hop: Number(match[1]),
            relay: match[2].toUpperCase(),
            rssi: Number(match[3]),
            node: match[4].toUpperCase(),
        });
    }

    if (rows.length === 0) {
        return { nodes: [], links: [], localNode };
    }

    const bestByNode = new Map();
    const reverseRssiByEdge = new Map();
    const inferredRelays = new Set();

    for (const row of rows) {
        const old = bestByNode.get(row.node);
        if (!old || row.hop < old.hop || (row.hop === old.hop && isBetterRssi(row.rssi, old.rssi))) {
            bestByNode.set(row.node, row);
        }
        if (row.relay !== localNode) {
            inferredRelays.add(row.relay);
        }
        const edgeKey = `${row.node}->${row.relay}`;
        const oldReverse = reverseRssiByEdge.get(edgeKey);
        if (oldReverse === undefined || isBetterRssi(row.rssi, oldReverse)) {
            reverseRssiByEdge.set(edgeKey, row.rssi);
        }
    }

    const nodes = new Map();
    const links = [];
    const linkKeys = new Set();

    function addNode(id, role, depth) {
        const old = nodes.get(id);
        if (!old) {
            nodes.set(id, { id, role, depth });
            return;
        }
        if (old.role !== "Local" && role === "Relay") old.role = "Relay";
        if (depth < old.depth) old.depth = depth;
    }

    addNode(localNode, "Local", 0);

    for (const row of bestByNode.values()) {
        if (row.node === localNode) continue;
        addNode(row.relay, row.relay === localNode ? "Local" : "Relay", row.hop);
        addNode(row.node, inferredRelays.has(row.node) ? "Relay" : "Node", row.hop + 1);

        linkKeys.add(`${row.relay}->${row.node}`);
        links.push({
            source: row.relay,
            target: row.node,
            forwardRssi: row.rssi,
            reverseRssi: reverseRssiByEdge.get(`${row.relay}->${row.node}`),
            hop: row.hop,
            kind: "primary",
        });
    }

    for (const row of rows) {
        if (row.node === localNode) continue;
        const linkKey = `${row.relay}->${row.node}`;
        if (linkKeys.has(linkKey)) continue;

        addNode(row.relay, row.relay === localNode ? "Local" : "Relay", row.hop);
        addNode(row.node, inferredRelays.has(row.node) ? "Relay" : "Node", row.hop + 1);
        linkKeys.add(linkKey);

        links.push({
            source: row.relay,
            target: row.node,
            forwardRssi: row.rssi,
            reverseRssi: undefined,
            hop: row.hop,
            kind: "observed",
        });
    }

    return { nodes: Array.from(nodes.values()), links, localNode };
}

function formatRssi(rssi) {
    return isValidRssi(rssi) ? `${rssi} dB` : "-- dB";
}

function isValidRssi(rssi) {
    return rssi !== 0;
}

function isBetterRssi(candidate, current) {
    if (isValidRssi(candidate) && !isValidRssi(current)) {
        return true;
    }
    if (!isValidRssi(candidate) && isValidRssi(current)) {
        return false;
    }
    return candidate > current;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.parseATInfo = parseATInfo;
window.TermPWA.parseLoraNet = parseLoraNet;
window.TermPWA.formatRssi = formatRssi;
})();
