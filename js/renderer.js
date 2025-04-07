// js/renderer.js
import { config, WGS84 } from './config.js';
import { applyProjection, featureToPathData } from './wgs84.js';
import { dataAvailable, extractTopoFeatures } from './data.js';
import { getOverlayValue, formatOverlayValue, getOverlayColor, getVectorAngle, updateOverlayLegend, showDataUnavailableMessage, extractLabelPoints } from './overlayUtils.js'; // Create this new file

let svg, globeGroup, earthBoundary, overlayGroup;
let landFeatures = null; // Store converted land features

export function initializeRenderer(_svg, _globeGroup, _earthBoundary, _overlayGroup) {
    svg = _svg;
    globeGroup = _globeGroup;
    earthBoundary = _earthBoundary;
    overlayGroup = _overlayGroup;
}

/**
 * Draw the main globe elements (land, water, graticule, etc.)
 */
export function renderGlobe(worldTopology, scale, rotation) {
    if (!svg || !globeGroup || !earthBoundary || !overlayGroup) {
        console.error("Renderer not initialized.");
        return;
    }

    // Update Earth boundary/background
    if (config.projection === 'orthographic') {
        earthBoundary
            .attr('rx', scale)
            .attr('ry', scale * (WGS84.b / WGS84.a))
            .attr('cx', 0) // Centered in globeGroup
            .attr('cy', 0)
            .attr('fill', config.oceanColor);
    } else {
        // For 2D projections, determine bounds based on projection
        // This is tricky - let's just use a large rectangle for now
        const projWidth = scale * 2; // Approximation for equirectangular/mercator width
        const projHeight = scale; // Approximation for equirectangular/mercator height
        earthBoundary
            .attr('rx', projWidth) // Use rx/ry as half-width/height for ellipse acting as rect
            .attr('ry', projHeight)
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('fill', config.oceanColor);
    }

    // Convert TopoJSON to GeoJSON only once or if worldTopology changes
    if (worldTopology && (!landFeatures || landFeatures.__source !== worldTopology)) {
        // Attempt to get 'land', 'coastline_50m', or fallback
        let targetObject = 'land';
        if (!worldTopology.objects?.land && worldTopology.objects?.coastline_50m) {
            targetObject = 'coastline_50m';
        }
        landFeatures = extractTopoFeatures(worldTopology, targetObject);
        landFeatures.__source = worldTopology; // Mark the source to avoid reconversion
        // console.log("Converted TopoJSON to GeoJSON Features:", landFeatures);
    }

    // Draw Land
    globeGroup.selectAll('.land').remove(); // Clear previous land paths
    if (landFeatures && landFeatures.features) {
        globeGroup.selectAll('.land')
            .data(landFeatures.features)
            .enter()
            .append('path')
            .attr('class', 'land')
            .attr('fill', config.outlineOnly ? 'none' : config.landColor)
            .attr('stroke', config.landStrokeColor)
            .attr('stroke-width', config.outlineOnly ? 0.4 : config.landStrokeWidth)
            .attr('d', d => featureToPathData(d, scale, rotation)); // Calculate path dynamically
    } else {
        console.warn("No land features available to draw.");
    }


    // Draw Graticule
    drawGraticule(scale, rotation);

    // Draw Grid Dots
    drawGridDots(scale, rotation);

    // Draw Labels
    drawLabels(scale, rotation); // Labels need access to scale/rotation

    // Draw Overlay
    drawOverlay(scale, rotation);

    // Note: Status/Location updates are typically UI concerns
}

/**
 * Draw graticule (grid lines)
 */
function drawGraticule(scale, rotation) {
    globeGroup.selectAll('.graticule').remove();
    if (!config.showGraticule) return;

    const graticule = d3.geoGraticule().stepMinor([10, 10]).stepMajor([90,30]); // Define grid steps
    const graticuleData = graticule(); // Get GeoJSON for graticule lines

    // Need a dummy feature structure for featureToPathData
    const graticuleFeature = { type: "Feature", geometry: graticuleData };

    const pathData = featureToPathData(graticuleFeature, scale, rotation);

    if(pathData){
        globeGroup.append('path')
            .datum(graticuleData) // Use datum if needed by D3 patterns elsewhere
            .attr('class', 'graticule')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', config.graticuleColor)
            .attr('stroke-width', config.graticuleWidth)
            .attr('stroke-opacity', config.graticuleOpacity);
    }
}

/**
 * Draw grid dots
 */
function drawGridDots(scale, rotation) {
    globeGroup.selectAll('.grid-dots').remove();
    if (!config.showGridDots) return;

    const dotsGroup = globeGroup.append('g').attr('class', 'grid-dots');
    const spacing = 10; // degrees

    for (let lat = -80; lat <= 80; lat += spacing) {
        for (let lon = -180; lon < 180; lon += spacing) {
            const projected = applyProjection(lon, lat, scale, rotation);
            if (projected) {
                const [x, y, z] = projected;
                dotsGroup.append('circle')
                    .attr('cx', x)
                    .attr('cy', y)
                    .attr('r', 0.5 + scale * 0.001) // Scale radius slightly
                    .attr('fill', 'rgba(255, 255, 255, 0.5)')
                    .attr('opacity', z * 0.6); // Fade based on depth
            }
        }
    }
}

/**
 * Draw country/feature labels
 */
function drawLabels(scale, rotation) {
    globeGroup.selectAll('.label').remove();
    if (!config.showLabels) return;

    // Define major centroids (lon, lat, name)
    const places = [
        [-98.5, 39.8, "USA"], [-106.3, 56.1, "Canada"], [-51.9, -14.2, "Brazil"],
        [-3.4, 55.3, "UK"], [10.4, 51.1, "Germany"], [2.2, 46.2, "France"],
        [103.8, 36.0, "China"], [138.2, 36.2, "Japan"], [78.9, 20.5, "India"],
        [133.7, -25.2, "Australia"], [24.1, -30.5, "S. Africa"], [95.7, 61.5, "Russia"]
    ];

    places.forEach(([lon, lat, name]) => {
        const projected = applyProjection(lon, lat, scale, rotation);
        if (projected) {
            const [x, y, z] = projected;
            if (z > 0.1) { // Only draw if reasonably facing forward
                globeGroup.append('text')
                    .attr('class', 'label')
                    .attr('x', x)
                    .attr('y', y)
                    .attr('dy', '0.35em') // Center vertically
                    .attr('text-anchor', 'middle')
                    .attr('font-size', `${Math.max(7, Math.min(12, scale / 30))}px`)
                    .attr('fill', 'rgba(255,255,255,0.8)')
                    .attr('paint-order', 'stroke') // Draw stroke behind fill
                    .attr('stroke', 'rgba(0,0,0,0.5)')
                    .attr('stroke-width', 1.5)
                    .attr('opacity', z) // Fade based on depth
                    .attr('pointer-events', 'none')
                    .text(name);
            }
        }
    });
}


/**
 * Draw the appropriate overlay based on config
 */
function drawOverlay(scale, rotation) {
    overlayGroup.selectAll('*').remove(); // Clear previous overlay
    const legend = document.getElementById('overlay-legend');
    if(legend) legend.classList.remove('visible'); // Hide legend by default

    if (config.overlayType === 'none') return;

    if (!dataAvailable[config.overlayType]) {
        showDataUnavailableMessage(overlayGroup); // Pass the group to draw into
        return;
    }

    // Show and update legend (logic moved to overlayUtils)
    updateOverlayLegend(config);

    // Set group opacity
    overlayGroup.style('opacity', config.overlayOpacity);

    // Choose drawing function based on display mode
    switch (config.displayMode) {
        case 'gradient':
            drawGradientOverlay(scale, rotation);
            break;
        case 'vector':
            drawVectorOverlay(scale, rotation);
            break;
        case 'isoline':
            drawIsolineOverlay(scale, rotation);
            break;
    }
}


// --- Overlay Drawing Functions ---

function drawGradientOverlay(scale, rotation) {
    const gridSpacing = 5; // degrees

    for (let lat = -90 + gridSpacing/2; lat < 90; lat += gridSpacing) {
        for (let lon = -180 + gridSpacing/2; lon < 180; lon += gridSpacing) {
            const projected = applyProjection(lon, lat, scale, rotation);
            if (projected) {
                const [x, y, z] = projected;
                const value = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
                if (value === null) continue;

                const color = getOverlayColor(value, config.overlayType);
                const cellSize = scale * (gridSpacing * Math.PI / 180) * 0.8; // Approximate cell size

                // Draw slightly overlapping rects
                overlayGroup.append('rect')
                    .attr('x', x - cellSize / 2)
                    .attr('y', y - cellSize / 2)
                    .attr('width', cellSize)
                    .attr('height', cellSize)
                    .attr('fill', color)
                    .attr('opacity', 0.6 * z) // Base opacity + depth fading
                    .attr('stroke', 'none');
            }
        }
    }
}

function drawVectorOverlay(scale, rotation) {
    const spacing = 20 - config.vectorDensity * 1.5; // Adjust spacing based on density

    for (let lat = -80; lat <= 80; lat += spacing) {
        for (let lon = -180; lon < 180; lon += spacing) {
            const projected = applyProjection(lon, lat, scale, rotation);
            if (projected) {
                const [x, y, z] = projected;
                const value = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
                if (value === null) continue;

                const angle = getVectorAngle(lon, lat, config.altitudeKm, config.overlayType); // Use overlayUtils function
                if (angle === null) continue;

                const color = getOverlayColor(value, config.overlayType);

                // Scale vector length based on value (adjust scaling factor per overlay type)
                let lengthScaleFactor = 0.5;
                if(config.overlayType === 'magvar') lengthScaleFactor = 0.3;
                // Add more factors if needed...
                const length = Math.min(scale * 0.1, Math.max(scale * 0.01, Math.abs(value) * lengthScaleFactor + scale * 0.01));

                const radians = angle * Math.PI / 180;
                // Note: SVG Y is inverted, so subtract sin for Y movement
                const endX = x + Math.cos(radians) * length;
                const endY = y - Math.sin(radians) * length;

                // Draw line
                overlayGroup.append('line')
                    .attr('x1', x).attr('y1', y)
                    .attr('x2', endX).attr('y2', endY)
                    .attr('stroke', color)
                    .attr('stroke-width', 1 + scale * 0.001)
                    .attr('opacity', z);

                // Simple arrowhead
                const arrowSize = Math.max(2, length * 0.2);
                const arrowAngle = 2.5; // radians (~140 degrees)
                overlayGroup.append('path')
                    .attr('d', `M${endX},${endY} L${endX - arrowSize * Math.cos(radians - arrowAngle)},${endY + arrowSize * Math.sin(radians - arrowAngle)} L${endX - arrowSize * Math.cos(radians + arrowAngle)},${endY + arrowSize * Math.sin(radians + arrowAngle)} Z`)
                    .attr('fill', color)
                    .attr('opacity', z);
            }
        }
    }
}

function drawIsolineOverlay(scale, rotation) {
    const isolineSpacingOptions = {
        coarse: 10,
        medium: 5,
        fine: 2,
    };

    const isolineStep = isolineSpacingOptions[config.isolineSpacing];

    // Grid spacing for sampling data
    const gridSpacing = isolineStep;

    // Determine min/max values for the current overlay type
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (let lat = -90 + gridSpacing/2; lat < 90; lat += gridSpacing) {
        for (let lon = -180 + gridSpacing/2; lon < 180; lon += gridSpacing) {
            const value = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
            if (value !== null) {
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        }
    }

    // Generate thresholds for isolines
    const thresholds = d3.range(Math.floor(minValue / isolineStep) * isolineStep, Math.ceil(maxValue / isolineStep) * isolineStep + isolineStep, isolineStep);

    // Create a grid of data values
    const valueGrid = [];
    for (let lat = -90; lat <= 90; lat += gridSpacing) {
        const row = [];
        for (let lon = -180; lon <= 180; lon += gridSpacing) {
            const value = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
            row.push(value === null ? NaN : value); // Use NaN for missing data
        }
        valueGrid.push(row);
    }

    // Generate contours
    const contours = d3.contours()
        .size([360 / gridSpacing + 1, 180 / gridSpacing + 1]) // Grid size (lon, lat)
        .thresholds(thresholds);

    const contourData = contours(valueGrid.flat()); // Generate contour GeoJSON

    // Draw contours
    contourData.forEach(contour => {
        const pathData = convertContourToPathData(contour, scale, rotation, gridSpacing);
        if (pathData) {
            const color = getOverlayColor(contour.value, config.overlayType);
            overlayGroup.append('path')
                .attr('d', pathData)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 1)
                .attr('opacity', 0.8);
        }
    });
}

/**
 * Helper function to convert contour data to SVG path data
 */
function convertContourToPathData(contour, scale, rotation, gridSpacing) {
    const pathSegments = [];
    for (const ring of contour.coordinates) {
        const segment = [];
        for (const point of ring) {
            const lon = (point[0] * gridSpacing) - 180;
            const lat = (point[1] * gridSpacing) - 90;
            const projected = applyProjection(lon, lat, scale, rotation);
            if (projected) {
                const [x, y] = projected;
                segment.push(`${x.toFixed(2)},${y.toFixed(2)}`);
            }
        }
        if (segment.length > 1) {
            pathSegments.push(`M${segment.join(' L')}`);
        }
    }
    return pathSegments.join(' ');
}