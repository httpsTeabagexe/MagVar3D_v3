// Earth Globe Renderer
// Created for httpsTeabagexe on 2025-03-21 15:05:23
// Based on cambecc/earth repository

document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const config = {
        width: window.innerWidth,
        height: window.innerHeight,
        sensitivity: 75,
        defaultScale: 250,
        defaultRotation: [0, 0],
        maxScale: 1000,
        minScale: 150,
        defaultTilt: 0,
        topoJsonUrl: './earth-topo.json'
    };

    // Create the SVG container
    const svg = d3.select('#globe')
        .append('svg')
        .attr('width', config.width)
        .attr('height', config.height);

    // Add a background circle representing the Earth's outline
    svg.append('circle')
        .attr('cx', config.width / 2)
        .attr('cy', config.height / 2)
        .attr('r', config.defaultScale)
        .attr('fill', '#183059');

    // Create a group for the globe
    const globeGroup = svg.append('g')
        .attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

    // Initialize the projection
    const projection = d3.geoOrthographic()
        .scale(config.defaultScale)
        .translate([0, 0])
        .rotate(config.defaultRotation);

    // Create a path generator
    const pathGenerator = d3.geoPath()
        .projection(projection);

    // Load the TopoJSON data
    d3.json(config.topoJsonUrl).then(topojsonData => {
        // Convert TopoJSON to GeoJSON
        const land = topojson.feature(topojsonData, topojsonData.objects.coastline_50m);
        const lakes = topojson.feature(topojsonData, topojsonData.objects.lakes_50m);
        // Draw the land
        globeGroup.selectAll('.land')
            .data(land.features)
            .enter()
            .append('path')
            .attr('class', 'land')
            .attr('d', pathGenerator)
            .attr('fill', '#2A9D8F')
            .attr('stroke', '#264653')
            .attr('stroke-width', 0.5);

        // Draw the lakes
        globeGroup.selectAll('.lakes')
            .data(lakes.features)
            .enter()
            .append('path')
            .attr('class', 'lakes')
            .attr('d', pathGenerator)
            .attr('fill', '#183059')
            .attr('stroke', '#264653')
            .attr('stroke-width', 0.5);

        // Add graticule (grid lines)
        const graticule = d3.geoGraticule();
        globeGroup.append('path')
            .datum(graticule)
            .attr('class', 'graticule')
            .attr('d', pathGenerator)
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.2)
            .attr('stroke-opacity', 0.3);

        // Handle drag to rotate
        const dragBehavior = d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged);

        svg.call(dragBehavior);

        // Handle zoom
        svg.call(d3.zoom()
            .on('zoom', zoomed));

        // Resize handler
        window.addEventListener('resize', () => {
            config.width = window.innerWidth;
            config.height = window.innerHeight;

            svg.attr('width', config.width)
                .attr('height', config.height);

            svg.select('circle')
                .attr('cx', config.width / 2)
                .attr('cy', config.height / 2);

            globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);
        });

        // Initial render animation
        animateIn();

        // Drag handlers
        let dragRotation = [...config.defaultRotation];

        function dragStarted(event) {
            event.sourceEvent.stopPropagation();
        }

        function dragged(event) {
            const x = event.dx;
            const y = event.dy;

            dragRotation[0] += x / config.sensitivity * 10;
            dragRotation[1] -= y / config.sensitivity * 10;

            // Limit the vertical rotation
            dragRotation[1] = Math.max(-90, Math.min(90, dragRotation[1]));

            projection.rotate(dragRotation);

            // Update all paths and labels with the new projection
            globeGroup.selectAll('path').attr('d', pathGenerator);
        }

        // Zoom handler
        function zoomed(event) {
            const newScale = event.transform.k * config.defaultScale;

            // Enforce min/max scale
            const scale = Math.min(Math.max(newScale, config.minScale), config.maxScale);

            projection.scale(scale);

            // Update the Earth outline circle
            svg.select('circle').attr('r', scale);

            // Update all paths with the new projection
            globeGroup.selectAll('path').attr('d', pathGenerator);
        }

        // Initial animation
        function animateIn() {
            const startRotation = [-120, 0];
            const endRotation = config.defaultRotation;

            // Animate rotation from start to end
            d3.transition()
                .duration(1500)
                .tween("rotate", () => {
                    const i = d3.interpolate(startRotation, endRotation);
                    return t => {
                        projection.rotate(i(t));

                        // Update all paths with the new projection
                        globeGroup.selectAll('path').attr('d', pathGenerator);
                    };
                });
        }
    });
});