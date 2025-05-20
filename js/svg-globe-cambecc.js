import * as d3 from "d3";
import {
    createMagvarOverlay,
    toggleMagvarOverlay,
    updateMagvarOverlay,
    setMagvarResolution
} from './magvar-canvas-overlay.js';

export function setupSvgGlobe(container, landGeoJson, options = {}) {
    const {
        width = 800,
        height = 800,
        landColor = "#72B092",
        oceanColor = "#001D3D",
        landStrokeColor = "#333",
        graticuleColor = "#888",
        graticuleOpacity = 0.7
    } = options;

    // Remove any existing SVG
    d3.select(container).select("svg").remove();

    // Create projection and path
    const projection = d3.geoOrthographic()
        .scale(Math.min(width, height) / 2.1)
        .translate([width / 2, height / 2])
        .clipAngle(90);

    const path = d3.geoPath(projection);

    // Create SVG and append base layers
    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("class", "earth-svg-cambecc");

    // Add sphere (ocean)
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "sphere")
        .attr("d", path)
        .attr("fill", oceanColor);

    // Add graticule (grid lines)
    svg.append("path")
        .datum(d3.geoGraticule10())
        .attr("class", "graticule")
        .attr("d", path)
        .attr("fill", "none")
        .attr("stroke", graticuleColor)
        .attr("stroke-width", 1)
        .attr("opacity", graticuleOpacity);

    // Add land masses
    svg.append("path")
        .datum(landGeoJson)
        .attr("class", "land")
        .attr("d", path)
        .attr("fill", landColor)
        .attr("stroke", landStrokeColor)
        .attr("stroke-width", 0.7);

    // Helper function to update paths when projection changes
    function updateGeographicPaths() {
        svg.selectAll(".sphere, .graticule, .land").attr("d", path);
    }

    // Add zoom behavior
    svg.call(
        d3.zoom()
            .scaleExtent([width / 4, width * 2])
            .filter(event => event.type === 'wheel')
            .on("zoom", event => {
                projection.scale(event.transform.k);
                updateGeographicPaths();
                updateMagvarOverlay();
            })
    );

    // Add drag behavior
    svg.call(
        d3.drag()
            .on("start", event => {
                container.__dragStartPos = [event.x, event.y];
                container.__dragStartRotate = projection.rotate();
            })
            .on("drag", event => {
                const dx = event.x - container.__dragStartPos[0];
                const dy = event.y - container.__dragStartPos[1];
                const rotation = [...container.__dragStartRotate];

                rotation[0] += dx * 0.5;
                rotation[1] = Math.max(-90, Math.min(90, rotation[1] - dy * 0.5));

                projection.rotate(rotation);
                updateGeographicPaths();
                updateMagvarOverlay();
            })
    );

    // Create globe wrapper with API for external use
    container.__globeWrapper = {
        svg,
        projection,
        path,
        createMagvarOverlay: () => createMagvarOverlay(container, projection),
        toggleMagvarOverlay: visible => toggleMagvarOverlay(visible),
        setMagvarResolution: resolution => setMagvarResolution(resolution)
    };

    // Initialize magnetic variation overlay
    container.__globeWrapper.createMagvarOverlay();

    return container.__globeWrapper;
}