(function () {
let simulation = null;
const nodePositions = new Map();
const formatRssi = window.TermPWA.formatRssi;

function clearTopology(svgSelector = "#topology") {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
    nodePositions.clear();

    if (window.d3) {
        d3.select(svgSelector).selectAll("*").remove();
    }
}

function renderTopology({
    svgSelector = "#topology",
    topology = null,
    localNode = null,
} = {}) {
    if (!window.d3) {
        return result(false, true, true, 0, 0, localNode);
    }

    const svg = d3.select(svgSelector);
    const root = svg.node();
    if (!root || root.clientWidth === 0) {
        return result(true, false, true, 0, 0, localNode);
    }

    const width = root.clientWidth;
    const height = root.clientHeight;
    const nodes = cloneNodes((topology && topology.nodes) || []);
    const links = cloneLinks((topology && topology.links) || []);
    const topologyLocalNode = (topology && topology.localNode) || localNode || "----";

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    ensureLayers(svg);

    if (nodes.length === 0) {
        stopSimulation();
        svg.select(".empty-layer")
            .selectAll("text")
            .data([0])
            .join("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#667085")
            .text("Waiting for data...");
        svg.select(".link-layer").selectAll("*").remove();
        svg.select(".label-layer").selectAll("*").remove();
        svg.select(".reverse-label-layer").selectAll("*").remove();
        svg.select(".node-layer").selectAll("*").remove();
        return result(true, true, true, 0, 0, topologyLocalNode);
    }

    svg.select(".empty-layer").selectAll("*").remove();
    seedNodePositions(nodes, width, height);

    const linkSelection = svg.select(".link-layer")
        .selectAll("line")
        .data(links, d => linkKey(d))
        .join(
            enter => enter.append("line"),
            update => update,
            exit => exit.remove()
        )
        .attr("stroke", d => d.kind === "primary" ? "#30313f" : "#8b95a7")
        .attr("stroke-width", d => d.kind === "primary" ? 1.5 : 1.2)
        .attr("opacity", d => d.kind === "primary" ? 1 : 0.72);

    const edgeLabel = svg.select(".label-layer")
        .selectAll("g")
        .data(links, d => linkKey(d))
        .join(
            enter => {
                const g = enter.append("g").attr("class", "edge-label");
                g.append("rect").attr("x", -23).attr("y", -9).attr("width", 46).attr("height", 18);
                g.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central");
                return g;
            },
            update => update,
            exit => exit.remove()
        );
    edgeLabel.select("text").text(d => formatRssi(d.forwardRssi));

    const reverseLabel = svg.select(".reverse-label-layer")
        .selectAll("g")
        .data(links.filter(d => d.reverseRssi !== undefined), d => linkKey(d))
        .join(
            enter => {
                const g = enter.append("g").attr("class", "edge-label");
                g.append("rect").attr("x", -23).attr("y", -9).attr("width", 46).attr("height", 18);
                g.append("text").attr("text-anchor", "middle").attr("dominant-baseline", "central");
                return g;
            },
            update => update,
            exit => exit.remove()
        );
    reverseLabel.select("text").text(d => formatRssi(d.reverseRssi));

    const nodeSelection = svg.select(".node-layer")
        .selectAll("g")
        .data(nodes, d => d.id)
        .join(
            enter => {
                const g = enter.append("g").attr("class", "node")
                    .call(d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended));
                g.append("circle").attr("r", 40).attr("stroke", "#2a2c35").attr("stroke-width", 1.5);
                g.append("text").attr("class", "addr").attr("text-anchor", "middle").attr("y", -4);
                g.append("text").attr("class", "role").attr("text-anchor", "middle").attr("y", 15);
                return g;
            },
            update => update,
            exit => exit.remove()
        );

    nodeSelection.select("circle")
        .attr("fill", d => d.role === "Local" ? "var(--nv-local)" : d.role === "Relay" ? "var(--nv-relay)" : "var(--nv-node)");
    nodeSelection.select(".addr").text(d => d.id);
    nodeSelection.select(".role").text(d => d.role);

    if (!simulation) {
        simulation = d3.forceSimulation(nodes);
    } else {
        simulation.nodes(nodes);
    }

    simulation
        .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.hop === 0 ? 260 : 220).strength(0.85))
        .force("charge", d3.forceManyBody().strength(-950))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(d => 110 + d.depth * 230).strength(0.12))
        .force("y", d3.forceY(height / 2).strength(0.08))
        .force("collide", d3.forceCollide(58))
        .on("tick", ticked)
        .alpha(0.45)
        .restart();

    ticked();

    function ticked() {
        for (const n of nodes) {
            n.x = Math.max(55, Math.min(width - 55, n.x));
            n.y = Math.max(55, Math.min(height - 55, n.y));
            nodePositions.set(n.id, {
                x: n.x,
                y: n.y,
                fx: n.fx,
                fy: n.fy,
            });
        }
        linkSelection
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        edgeLabel.attr("transform", d => `translate(${d.source.x * 0.58 + d.target.x * 0.42},${d.source.y * 0.58 + d.target.y * 0.42})`);
        reverseLabel.attr("transform", d => `translate(${d.source.x * 0.42 + d.target.x * 0.58},${d.source.y * 0.42 + d.target.y * 0.58})`);
        nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    return result(true, true, false, nodes.length, links.length, topologyLocalNode);
}

function ensureLayers(svg) {
    for (const className of ["empty-layer", "link-layer", "label-layer", "reverse-label-layer", "node-layer"]) {
        svg.selectAll(`g.${className}`)
            .data([0])
            .join("g")
            .attr("class", className);
    }
}

function cloneNodes(nodes) {
    return nodes.map(node => ({ ...node }));
}

function cloneLinks(links) {
    return links.map(link => ({ ...link }));
}

function seedNodePositions(nodes, width, height) {
    const depthCounts = new Map();

    for (const n of nodes) {
        const old = nodePositions.get(n.id);
        const index = depthCounts.get(n.depth) || 0;
        depthCounts.set(n.depth, index + 1);

        if (old) {
            n.x = old.x;
            n.y = old.y;
            n.fx = old.fx;
            n.fy = old.fy;
            continue;
        }

        n.x = Math.max(55, Math.min(width - 55, 110 + n.depth * 230));
        n.y = Math.max(55, Math.min(height - 55, height / 2 + (index - 0.5) * 120));
    }
}

function stopSimulation() {
    if (simulation) {
        simulation.stop();
        simulation = null;
    }
}

function linkKey(link) {
    return link.key || `${idOf(link.source)}->${idOf(link.target)}`;
}

function idOf(value) {
    return typeof value === "object" ? value.id : value;
}

function result(d3Ready, visible, empty, nodesCount, linksCount, localNode) {
    return {
        rendered: d3Ready && visible,
        d3Ready,
        visible,
        empty,
        nodesCount,
        linksCount,
        localNode: localNode || "----",
    };
}

function dragstarted(event, d) {
    if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event, d) {
    if (!event.active && simulation) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

window.TermPWA = window.TermPWA || {};
window.TermPWA.clearTopology = clearTopology;
window.TermPWA.renderTopology = renderTopology;
})();
