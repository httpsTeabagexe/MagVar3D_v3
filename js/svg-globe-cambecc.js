import * as d3 from "d3";
import {
    createMagvarOverlay,
    toggleMagvarOverlay,
    renderMagvarOverlay as updateMagvarOverlay,
    setMagvarResolution
} from './magvar-canvas-overlay.js';

function coordsAtPoint(x, y, projection) {
    // Convert screen coordinates back to geographic coordinates
    const p = projection.invert([x, y]);
    if (p) {
        return p; // Returns [lon, lat]
    }
    return null;
}

export function setupSvgGlobe(container, landGeoJson, options = {}) {
    let magvarOverlayVisible = false;
    let isDragging = false, lastMouse = null, lastRotate;

    const {
        width = 800,
        height = 800,
        landColor = "#72B092",
        oceanColor = "#001D3D",
        landStrokeColor = "#333",
        graticuleColor = "#888",
        graticuleOpacity = 0.7
    } = options;

    d3.select(container).select("svg").remove();

    const projection = d3.geoOrthographic()
        .scale(Math.min(width, height) / 2.1)
        .translate([width / 2, height / 2])
        .clipAngle(90);

    lastRotate = projection.rotate();
    const path = d3.geoPath(projection);

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("class", "earth-svg-cambecc");

    svg.append("path")
        .datum({type: "Sphere"})
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", oceanColor);

    svg.append("path")
        .datum(d3.geoGraticule10())
        .attr("class", "graticule")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", graticuleColor)
        .attr("stroke-width", 1)
        .attr("opacity", graticuleOpacity);

    svg.append("path")
        .datum(landGeoJson)
        .attr("class", "land")
        .attr("d", path)
        .attr("fill", landColor)
        .attr("stroke", landStrokeColor)
        .attr("stroke-width", 0.7);

    // Function to update geographic paths
    function updateGeographicPaths() {
        svg.selectAll(".sphere, .graticule, .land").attr("d", path);
    }

    // Remove the current zoom and drag behaviors
    svg.call(
        d3.zoom()
            .scaleExtent([width / 4, width * 2])
            .filter(event => {
                // Only handle wheel events for zooming, not mouse movements
                return event.type === 'wheel' || event.type === 'mousewheel';
            })
            .on("zoom", (event) => {
                projection.scale(event.transform.k);
                updateGeographicPaths();

                if (magvarOverlayVisible) {
                    updateMagvarOverlay();
                }
            })
    );

    // Set up drag behavior for rotation
    svg.call(
        d3.drag()
            .on("start", (event) => {
                isDragging = true;
                lastMouse = [event.x, event.y];
                lastRotate = projection.rotate();
            })
            .on("drag", (event) => {
                if (!isDragging) return;
                const [dx, dy] = [event.x - lastMouse[0], event.y - lastMouse[1]];
                const rotation = [...lastRotate];
                rotation[0] += dx * 0.5;
                rotation[1] = Math.max(-90, Math.min(90, rotation[1] - dy * 0.5));
                projection.rotate(rotation);

                // Update all path elements
                updateGeographicPaths();

                // Update magvar overlay when dragging if visible
                if (magvarOverlayVisible) {
                    updateMagvarOverlay();
                }
            })
            .on("end", () => {
                isDragging = false;
            })
    );

    return {
        svg: svg,
        projection: projection,
        path: path,
        createMagvarOverlay: function() {
            return createMagvarOverlay(container, projection);
        },
        toggleMagvarOverlay: function(visible) {
            magvarOverlayVisible = visible;
            toggleMagvarOverlay(visible);
        },
        updateMagvarOverlay: function() {
            updateMagvarOverlay();
        },
        setMagvarResolution: function(resolution) {
            setMagvarResolution(resolution);
        }
    };
}