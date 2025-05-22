/**
 * svg-globe-cambecc.js - adapted from Cambecc's globe rendering
 */

// Assume d3, µ, and functions from magvar-canvas-overlay.js are available globally
// Removed import statements for global scope approach

// Renamed and exposed globally
window.setupSvgGlobe = function(container, landGeoJson, options = {}) {
    const {
        width = 800,
        height = 800,
        landColor = "#72B092",
        oceanColor = "#001D3D",
        landStrokeColor = "#333",
        graticuleColor = "#888",
        graticuleOpacity = 0.7
    } = options;

    // Use globally available d3
    // Remove any existing SVG
    d3.select(container).select("svg").remove();

    // Create projection and path
    const projection = d3.geo.orthographic()
        .scale(Math.min(width, height) / 2.1)
        .translate([width / 2, height / 2])
        .clipAngle(90);

    const path = d3.geo.path().projection(projection);

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
        d3.behavior.zoom()
            .scaleExtent([width / 4, width * 2])
            .filter(event => event.type === 'wheel')
            .on("zoom", event => {
                projection.scale(event.transform.k);
                updateGeographicPaths();
                // Call the globally available updateMagvarOverlay
                if (window.updateMagvarOverlay) updateMagvarOverlay();
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
                // Call the globally available updateMagvarOverlay
                if (window.updateMagvarOverlay) updateMagvarOverlay();
            })
    );

    // Create globe wrapper with API for external use (exposed on the container)
    container.__globeWrapper = {
        svg,
        projection,
        path,
        // References to globally available magvar functions
        createMagvarOverlay: () => { if (window.createMagvarOverlay) return createMagvarOverlay(container, projection); },
        toggleMagvarOverlay: visible => { if (window.toggleMagvarOverlay) toggleMagvarOverlay(visible); },
        setMagvarResolution: resolution => { if (window.setMagvarResolution) setMagvarResolution(resolution); },
        setMagvarYear: year => { if (window.setMagvarYear) setMagvarYear(year); }
    };

    // This function is now exposed globally
    window.coordsAtPoint = function(x, y, projection) {
        // Use globally available µ if needed, but basic projection.invert is sufficient here
        return projection.invert([x, y]);
    };

    // Placeholder for renderNavigationData - implement this based on your navigation data rendering needs
    // Exposed globally
    window.renderNavigationData = function() {
        console.warn("renderNavigationData not implemented.");
        // Example: You would typically access your navigation data (airports, waypoints, navaids)
        // and draw them on the globe using the projection.
        // The `visibleLayers` object (now global) would tell you which layers are currently toggled on.
    };

    // Placeholder for visibleLayers - initialize this object based on your application state
    // Exposed globally
    window.visibleLayers = {
        airports: false,
        waypoints: false,
        navaids: false
    };

    return container.__globeWrapper; // Return the wrapper
};
