(function () {

    const CONFIG = {
        theme: {
            hopColors: {
                0: '#f7b2aa',   // GW (Align with LR71 Local)
                1: '#c8c5ff',   // Layer 1 (Align with LR71 Relay)
                2: '#bfeec6',   // Layer 2 (Align with LR71 Node)
                3: '#e2e8f0',   // Layer 3
                255: '#f1f5f9'  // Unknown
            },
            rssiPalette: {
                good: '#22c55e',
                medium: '#f97316',
                weak: '#ef4444'
            }
        },
        layout: {
            nodeRadius: 40,
            verticalSpacing: 160,
            horizontalSpacing: 200,
            linkDistance: 100,
            collideRadius: 65
        }
    };

    const Utils = {
        getShortMac: (mac) => mac.split(':').slice(-2).join(':'),
        
        getRssiColor: (rssi) => {
            if (rssi >= -50) return CONFIG.theme.rssiPalette.good;
            if (rssi >= -70) return CONFIG.theme.rssiPalette.medium;
            return CONFIG.theme.rssiPalette.weak;
        },
        
        getRssiWidth: (rssi) => {
            return Math.max(1, Math.min(4, (rssi + 90) / 15 + 1)) * 1.5;
        }
    };

    class MeshDataProcessor {
        constructor(rawJson) {
            this.data = JSON.parse(rawJson);
            this.nodesMap = new Map();
            this.links = [];
        }

        process() {
            this._initNodes();
            this._enrichFromEdges();
            this._buildLinks();
            return {
                nodes: Array.from(this.nodesMap.values()),
                links: this.links,
                originator: this.data.originator,
                responses: this.data.responses
            };
        }

        _initNodes() {
            (this.data.nodes || []).forEach(n => {
                this.nodesMap.set(n.mac, { ...n, id: n.mac });
            });
        }

        _enrichFromEdges() {
            (this.data.edges || []).forEach(e => {
                ['from', 'to'].forEach(key => {
                    const mac = e[key];
                    if (!this.nodesMap.has(mac)) {
                        this.nodesMap.set(mac, { mac, id: mac, hop: 255, links: 1 });
                    }
                });
            });
        }

        _buildLinks() {
            this.links = (this.data.edges || []).map(e => ({
                source: e.from,
                target: e.to,
                rssi: e.rssi,
                state: e.state
            }));
        }
    }

    class TreeLayoutEngine {
        static compute(nodes, width, height) {
            const { verticalSpacing: vSpace, horizontalSpacing: hSpace } = CONFIG.layout;
            
            const validHops = nodes.filter(n => n.hop !== 255).map(n => n.hop);
            const maxKnownHop = validHops.length ? Math.max(...validHops) : 0;
            
            const levels = new Map();
            nodes.forEach(n => {
                n.level = n.hop === 255 ? maxKnownHop + 1 : n.hop;
                if (!levels.has(n.level)) levels.set(n.level, []);
                levels.get(n.level).push(n);
            });

            const maxLevel = levels.size ? Math.max(...levels.keys()) : 0;
            const treeHeight = maxLevel * vSpace;
            const vOffset = Math.max(100, (height - treeHeight) / 2);

            levels.forEach((levelNodes, level) => {
                levelNodes.sort((a, b) => a.mac.localeCompare(b.mac));
                const total = levelNodes.length;
                
                levelNodes.forEach((n, idx) => {
                    n.targetX = width / 2 + (idx - (total - 1) / 2) * hSpace;
                    n.targetY = vOffset + level * vSpace;
                    n.x = n.targetX;
                    n.y = n.targetY;
                });
            });
        }
    }

    class MeshRenderer {
        constructor(svgElement, tooltipElement, statsElement, statusElement) {
            this.svg = d3.select(svgElement);
            this.tooltip = d3.select(tooltipElement);
            this.statsTag = statsElement;
            this.statusText = statusElement;
            this.simulation = null;
        }

        render(processedData) {
            const { nodes, links, originator, responses } = processedData;
            const root = this.svg.node();
            const width = root.clientWidth || 900;
            const height = root.clientHeight || 600;

            if (this.simulation) {
                this.simulation.stop();
            }

            this.svg.selectAll("*").remove();
            this.svg.attr("viewBox", `0 0 ${width} ${height}`);

            TreeLayoutEngine.compute(nodes, width, height);
            this._updateStats(processedData, nodes.length, links.length);
            this.simulation = this._setupSimulation(nodes, links);

            const linkLayer = this._drawLinks(links);
            const edgeLabelLayer = this._drawEdgeLabels(links);
            const nodeLayer = this._drawNodes(nodes, originator, this.simulation);

            this._bindTick(this.simulation, nodes, linkLayer, edgeLabelLayer, nodeLayer, width, height);
        }

        _updateStats(data, nodeCount, linkCount) {
            const expected = nodeCount > 0 ? nodeCount - 1 : 0;
            let warnings = [];
            if (data.responses < expected) {
                warnings.push(`Responses missing (${data.responses}/${expected})`);
            }
            
            let warningsText = warnings.length 
                ? ` | Warning: ${warnings.join(", ")}` 
                : "";
            
            this.statsTag.innerHTML = `Originator: ${Utils.getShortMac(data.originator || '--')}`;
            this.statusText.textContent = `Status: Topology updated. Nodes: ${nodeCount}, Links: ${linkCount}${warningsText}`;
        }

        _setupSimulation(nodes, links) {
            const { linkDistance, collideRadius } = CONFIG.layout;
            return d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(linkDistance).strength(0.3))
                .force("charge", d3.forceManyBody().strength(-500))
                .force("x", d3.forceX(d => d.targetX).strength(0.5))
                .force("y", d3.forceY(d => d.targetY).strength(0.8))
                .force("collide", d3.forceCollide(collideRadius));
        }

        _drawLinks(links) {
            return this.svg.append("g")
                .selectAll("line")
                .data(links)
                .join("line")
                .attr("stroke", d => Utils.getRssiColor(d.rssi))
                .attr("stroke-width", d => Utils.getRssiWidth(d.rssi))
                .attr("stroke-dasharray", d => d.state === "ESTAB" ? "none" : "5,5")
                .attr("opacity", d => d.state === "IDLE" ? 0.2 : d.state === "HOLDING" ? 0.3 : 0.8)
                .on("mouseover", (event, d) => {
                    this.tooltip.style("opacity", 1)
                        .html(`链路: ${Utils.getShortMac(d.source.id)} ↔ ${Utils.getShortMac(d.target.id)}\nRSSI: ${d.rssi} dBm\n状态: ${d.state}`);
                })
                .on("mousemove", (event) => {
                    this.tooltip.style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY + 10) + "px");
                })
                .on("mouseout", () => this.tooltip.style("opacity", 0));
        }

        _drawEdgeLabels(links) {
            const group = this.svg.append("g")
                .selectAll("g")
                .data(links)
                .join("g")
                .attr("class", "wf88-edge-label");

            group.append("rect")
                .attr("x", -18).attr("y", -8).attr("width", 36).attr("height", 16);

            group.append("text")
                .attr("text-anchor", "middle").attr("dominant-baseline", "central")
                .text(d => `${d.rssi}`);
            
            return group;
        }

        _drawNodes(nodes, originator, simulation) {
            const { nodeRadius } = CONFIG.layout;
            const { hopColors } = CONFIG.theme;

            const group = this.svg.append("g")
                .selectAll("g")
                .data(nodes)
                .join("g")
                .attr("class", "wf88-node")
                .call(this._drag(simulation))
                .on("mouseover", (event, d) => {
                    const isOrigin = d.id === originator ? "\n(Originator)" : "";
                    this.tooltip.style("opacity", 1)
                        .html(`MAC: ${d.id}${isOrigin}\nHop: ${d.hop}\nLinks: ${d.links}`);
                })
                .on("mousemove", (event) => {
                    this.tooltip.style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY + 10) + "px");
                })
                .on("mouseout", () => this.tooltip.style("opacity", 0));

            group.append("circle")
                .attr("r", nodeRadius)
                .attr("fill", d => hopColors[d.hop] || hopColors[255])
                .attr("stroke-width", d => d.id === originator ? 4 : 2)
                .attr("stroke", d => d.id === originator ? "#000" : "#334155");

            group.append("text")
                .attr("class", "mac")
                .attr("text-anchor", "middle").attr("y", -2)
                .text(d => Utils.getShortMac(d.id));

            group.append("text")
                .attr("class", "role")
                .attr("text-anchor", "middle").attr("y", 14)
                .text(d => d.hop === 0 ? "GW" : `Hop ${d.hop}`);
            
            return group;
        }

        _bindTick(sim, nodes, link, edgeLabel, node, width, height) {
            const r = CONFIG.layout.nodeRadius;
            sim.on("tick", () => {
                nodes.forEach(d => {
                    d.x = Math.max(r, Math.min(width - r, d.x));
                    d.y = Math.max(r, Math.min(height - r, d.y));
                });

                link
                    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);

                edgeLabel.attr("transform", d => {
                    const x = (d.source.x + d.target.x) / 2;
                    const y = (d.source.y + d.target.y) / 2;
                    return `translate(${x},${y})`;
                });

                node.attr("transform", d => `translate(${d.x},${d.y})`);
            });
        }

        _drag(simulation) {
            return d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x; d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null; d.fy = null;
                });
        }

        showError(msg) {
            this.statusText.textContent = "Status: Parse failed - " + msg;
            this.statusText.style.color = "var(--error)";
        }
        
        clearError() {
            this.statusText.style.color = "";
        }

        dispose() {
            if (this.simulation) {
                this.simulation.stop();
                this.simulation = null;
            }
            if (!this.tooltip.empty()) {
                this.tooltip.style("opacity", 0);
            }
        }
    }

    function createNetViewWF88Page({
        selectors = {}
    } = {}) {
        const inputArea = document.querySelector(selectors.inputArea || "#wf88Input");
        const drawButton = document.querySelector(selectors.drawButton || "#wf88DrawBtn");
        const statusElement = document.querySelector(selectors.status || "#wf88Status");
        const statsElement = document.querySelector(selectors.statsTag || "#wf88StatsTag");
        const svgElement = document.querySelector(selectors.topology || "#wf88Topology");
        const tooltipElement = document.querySelector(selectors.tooltip || "#wf88Tooltip");

        let renderer = null;
        let resizeTimer = null;
        let initTimer = null;
        let disposed = false;
        const handleDrawClick = () => run();
        const handleWindowResize = () => {
            if (disposed) {
                return;
            }
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => run(), 150);
        };

        function init() {
            if (!svgElement || !window.d3) {
                return;
            }
            renderer = new MeshRenderer(svgElement, tooltipElement, statsElement, statusElement);
            
            if (drawButton) {
                drawButton.addEventListener("click", handleDrawClick);
            }

            window.addEventListener("resize", handleWindowResize);

            // If there's default data, try drawing once initialized
            initTimer = setTimeout(() => {
                initTimer = null;
                run();
            }, 100);
        }

        function run() {
            if (disposed || !renderer || !inputArea) return;
            
            try {
                renderer.clearError();
                const rawInput = inputArea.value;
                if (!rawInput.trim()) {
                    renderer.statusText.textContent = "Status: Waiting for JSON data...";
                    return;
                }
                const processor = new MeshDataProcessor(rawInput);
                const data = processor.process();
                renderer.render(data);
            } catch (e) {
                console.error(e);
                renderer.showError(e.message);
            }
        }

        init();

        return {
            redraw: run,
            dispose() {
                if (disposed) {
                    return;
                }
                disposed = true;
                if (drawButton) {
                    drawButton.removeEventListener("click", handleDrawClick);
                }
                window.removeEventListener("resize", handleWindowResize);
                clearTimeout(resizeTimer);
                clearTimeout(initTimer);
                resizeTimer = null;
                initTimer = null;
                if (renderer) {
                    renderer.dispose();
                    renderer = null;
                }
            },
        };
    }

    window.TermPWA = window.TermPWA || {};
    window.TermPWA.createNetViewWF88Page = createNetViewWF88Page;
})();
