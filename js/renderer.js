// js/renderer.js
import { config, WGS84 } from './config.js';
import { applyProjection, featureToPathData } from './wgs84.js';
import { dataAvailable, landDataLowRes, landDataHighRes } from './data.js'; // Import GeoJSON data
import { getOverlayValue, formatOverlayValue, getOverlayColor, getVectorAngle, updateOverlayLegend, showDataUnavailableMessage, extractLabelPoints } from './overlayUtils.js';
import { getCurrentDecimalYear } from './wmm.js'; // Needed for date fallback
import { appState } from './app.js'; // Add import for appState

let svg, globeGroup, earthBoundary, overlayGroup;
let lodTimeout = null;
let useHighRes = false; // Track current LOD

// --- Placeholder Data (Keep or fetch dynamically) ---
const airportData = [
    { icao: "KJFK", name: "John F. Kennedy Intl", lat: 40.6413, lon: -73.7781 },
    { icao: "EGLL", name: "London Heathrow", lat: 51.4700, lon: -0.4543 },
    { icao: "RJTT", name: "Tokyo Haneda", lat: 35.5494, lon: 139.7798 },
    { icao: "LFPG", name: "Paris Charles de Gaulle", lat: 49.0097, lon: 2.5479 },
    { icao: "OMDB", name: "Dubai Intl", lat: 25.2532, lon: 55.3657 },
    { icao: "YSSY", name: "Sydney Kingsford Smith", lat: -33.9399, lon: 151.1753 },
    { icao: "SBGR", name: "São Paulo/Guarulhos Intl", lat: -23.4356, lon: -46.4731 },
];

const airspaceData = {
    // Sample GeoJSON FeatureCollection for a dummy airspace boundary
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Sample Airspace" },
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-10, 60], [20, 60], [20, 40], [-10, 40], [-10, 60]
                ]]
            }
        }
    ]
};
// --- End Placeholder Data ---


export function initializeRenderer(_svg, _globeGroup, _earthBoundary, _overlayGroup) {
    svg = _svg;
    globeGroup = _globeGroup;
    earthBoundary = _earthBoundary;
    overlayGroup = _overlayGroup;
}

/**
 * Draw the overlays
 */
export function renderOverlays() {
    // console.log("[renderOverlays] Called."); // DEBUG
    drawOverlay(appState.currentScale, appState.currentRotation);
}

/**
 * Draw the main globe elements (land, water, graticule, etc.)
 */
export function renderGlobe(scale, rotation) {
    if (!svg || !globeGroup || !earthBoundary || !overlayGroup) return;
    const wantHighRes = scale >= config.lodScaleThreshold && dataAvailable.landHighRes && !appState.isInteracting;
    if (wantHighRes && !useHighRes) {
        // Delay switching to high-res
        if (lodTimeout) clearTimeout(lodTimeout);
        lodTimeout = setTimeout(() => {
            useHighRes = true;
            scheduleRender(true); // Force re-render with high-res
        }, config.lodDelayMs);
    } else if (!wantHighRes && useHighRes) {
        // Switch back to low-res immediately
        if (lodTimeout) clearTimeout(lodTimeout);
        useHighRes = false;
    } else if (!wantHighRes && lodTimeout) {
        // Cancel pending high-res switch if zoomed out or interacting
        clearTimeout(lodTimeout);
        lodTimeout = null;
    }
    const landFeatures = useHighRes ? landDataHighRes : landDataLowRes;

    // Update Earth boundary/background
    if (config.projection === 'orthographic') {
        earthBoundary
            .attr('rx', scale)
            .attr('ry', scale * (WGS84.b / WGS84.a))
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('fill', config.oceanColor);
    } else {
        const projWidth = scale * 2;
        const projHeight = scale;
        earthBoundary
            .attr('rx', projWidth)
            .attr('ry', projHeight)
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('fill', config.oceanColor);
    }

    // --- Select Land Data based on LOD ---
    // let useHighRes = scale >= config.lodScaleThreshold && dataAvailable.landHighRes && !appState.isInteracting; // Added appState.isInteracting check
    // --- Draw Land using selected GeoJSON ---
    globeGroup.selectAll('.land').remove();
    if (landFeatures && landFeatures.features) {
        globeGroup.selectAll('.land')
            .data(landFeatures.features)
            .enter()
            .append('path')
            .attr('class', 'land')
            .attr('fill', config.outlineOnly ? 'none' : config.landColor)
            .attr('stroke', config.landStrokeColor)
            .attr('stroke-width', config.outlineOnly ? 0.4 : config.landStrokeWidth)
            .attr('d', d => featureToPathData(d, scale, rotation)); // Directly use GeoJSON feature
    } else {
        console.warn("No land features available to draw.");
    }


    // --- Draw Airspaces (checks config) ---
    drawAirspaces(scale, rotation);

    // Draw Graticule
    drawGraticule(scale, rotation);

    // --- Draw Airports (checks config) ---
    drawAirports(scale, rotation);

    // Draw Overlay
    drawOverlay(scale, rotation);
}

// --- Function to Draw Airspaces ---
function drawAirspaces(scale, rotation) {
    globeGroup.selectAll('.airspace').remove();
    if (!config.showAirspaces || !dataAvailable.airspace) return; // Check availability

    // TODO: Replace placeholder airspaceData with actual loaded data
    if (airspaceData && airspaceData.features) {
        globeGroup.selectAll('.airspace')
            .data(airspaceData.features)
            .enter()
            .append('path')
            .attr('class', 'airspace')
            .attr('fill', 'rgba(100, 100, 255, 0.1)') // Customize style
            .attr('stroke', 'rgba(100, 100, 255, 0.5)')
            .attr('stroke-width', 1)
            .attr('d', d => featureToPathData(d, scale, rotation));
    }
}

// --- Function to Draw Airports ---
function drawAirports(scale, rotation) {
    globeGroup.selectAll('.airport-group').remove();
    if (!config.showAirports || !dataAvailable.airports) return; // Check availability

    const airportGroup = globeGroup.append('g').attr('class', 'airport-group');

    // TODO: Replace placeholder airportData with actual loaded data from data.js
    airportData.forEach(airport => {
        const projected = applyProjection(airport.lon, airport.lat, scale, rotation);
        if (projected) {
            const [x, y, z] = projected;
            // Only draw if on the visible hemisphere (z > threshold)
            if (z > (config.projection === 'orthographic' ? 0.1 : -Infinity)) { // Adjust threshold for different projections
                const airportMarker = airportGroup.append('g')
                    .attr('class', 'airport-marker')
                    .attr('transform', `translate(${x},${y})`);

                airportMarker.append('circle')
                    .attr('cx', 0)
                    .attr('cy', 0)
                    .attr('r', Math.max(1.5, scale * 0.005))
                    .attr('fill', 'rgba(255, 255, 0, 0.9)') // Customize style
                    .attr('stroke', 'rgba(0, 0, 0, 0.7)')
                    .attr('stroke-width', 0.5);

                // Optionally show labels at higher zoom levels
                if (scale > 250) { // Example threshold
                    airportMarker.append('text')
                        .attr('x', 4)
                        .attr('y', 1)
                        .attr('dy', '0.1em')
                        .attr('text-anchor', 'start')
                        .attr('font-size', `${Math.max(6, Math.min(9, scale / 35))}px`)
                        .attr('fill', 'rgba(255, 255, 255, 0.9)')
                        .attr('paint-order', 'stroke')
                        .attr('stroke', 'rgba(0, 0, 0, 0.6)')
                        .attr('stroke-width', 1.5)
                        .attr('pointer-events', 'none')
                        .text(airport.icao);
                }
            }
        }
    });
}


/**
 * Draw graticule (grid lines)
 */
function drawGraticule(scale, rotation) {
    globeGroup.selectAll('.graticule').remove();
    if (!config.showGraticule) return;

    const graticule = d3.geoGraticule().stepMinor([10, 10]).stepMajor([90, 30]);
    const graticuleData = graticule();
    // Convert d3 graticule output (MultiLineString) to a GeoJSON Feature for path generation
    const graticuleFeature = { type: "Feature", geometry: graticuleData };
    const pathData = featureToPathData(graticuleFeature, scale, rotation);

    if (pathData) {
        globeGroup.append('path')
            // .datum(graticuleData) // Not strictly needed when pathData is pre-generated
            .attr('class', 'graticule')
            .attr('d', pathData)
            .attr('fill', 'none')
            .attr('stroke', config.graticuleColor)
            .attr('stroke-width', config.graticuleWidth)
            .attr('stroke-opacity', config.graticuleOpacity);
    }
}

/**
 * Draw the appropriate overlay based on config
 */
function drawOverlay(scale, rotation) {
    if (appState.isInteracting) { // Added check for appState.isInteracting
        overlayGroup.selectAll('*').remove();
        return;
    }
    // console.log(`[drawOverlay] Called. Type: ${config.overlayType}, Mode: ${config.displayMode}`); // DEBUG
    overlayGroup.selectAll('*').remove();
    const legend = document.getElementById('overlay-legend');
    if (legend) legend.classList.remove('visible');

    if (config.overlayType === 'none') return;

    // Check data availability for the selected overlay type
    if (!dataAvailable[config.overlayType] && config.overlayType !== 'magvar') {
        console.warn(`[drawOverlay] Data for overlay type '${config.overlayType}' is not available.`);
        showDataUnavailableMessage(overlayGroup, `Data for ${config.overlayType} overlay is not available.`);
        return;
    }

    updateOverlayLegend(config); // Update legend with current settings
    overlayGroup.style('opacity', config.overlayOpacity);

    // console.log(`[drawOverlay] Proceeding to draw ${config.displayMode}`); // DEBUG

    switch (config.displayMode) {
        case 'gradient':
            if (typeof drawGradientOverlay === 'function') {
                drawGradientOverlay(scale, rotation);
            } else {
                console.warn("Gradient display mode selected, but function not available.");
            }
            break;
        case 'vector':
            drawVectorOverlay(scale, rotation);
            break;
        case 'isoline':
            drawIsolineOverlay(scale, rotation);
            break;
        default:
            console.warn(`[drawOverlay] Unknown display mode: ${config.displayMode}`);
    }
}


// --- Overlay Drawing Functions (Keep as is, unless they need adjustments) ---

function drawGradientOverlay(scale, rotation) {
    // console.log("[drawGradientOverlay] Starting..."); // DEBUG
    const gridSpacing = 5; // Adjust grid density as needed
    const currentYear = config.decimalYear || getCurrentDecimalYear();
    let count = 0;

    for (let lat = -90 + gridSpacing / 2; lat < 90; lat += gridSpacing) {
        for (let lon = -180 + gridSpacing / 2; lon < 180; lon += gridSpacing) {
            const projected = applyProjection(lon, lat, scale, rotation);
            // Only draw if on the visible hemisphere/map
            if (projected && (config.projection !== 'orthographic' || projected[2] > 0)) {
                const [x, y, z] = projected;
                const value = getOverlayValue(lon, lat, config.altitudeKm, currentYear, config.overlayType);
                if (value === null) continue;
                count++;

                const color = getOverlayColor(value, config.overlayType);
                // Adjust cell size based on projection and scale
                const cellSize = scale * (gridSpacing * Math.PI / 180) * 0.8; // Approximation

                overlayGroup.append('rect')
                    .attr('x', x - cellSize / 2)
                    .attr('y', y - cellSize / 2)
                    .attr('width', cellSize)
                    .attr('height', cellSize)
                    .attr('fill', color)
                    .attr('opacity', 0.6 * (config.projection === 'orthographic' ? z : 1)) // Use z for orthographic fading
                    .attr('stroke', 'none');
            }
        }
    }
    // console.log(`[drawGradientOverlay] Finished. Drawn ${count} cells.`); // DEBUG
}

function drawVectorOverlay(scale, rotation) {
    // console.log("[drawVectorOverlay] Starting..."); // DEBUG
    const spacing = Math.max(5, 20 - config.vectorDensity * 1.5); // Ensure minimum spacing
    const currentYear = config.decimalYear || getCurrentDecimalYear();
    let drawnCount = 0;
    let calcErrors = 0;

    for (let lat = -80; lat <= 80; lat += spacing) {
        for (let lon = -180; lon < 180; lon += spacing) {
            const projected = applyProjection(lon, lat, scale, rotation);
            // Only draw if on the visible hemisphere/map
            if (projected && (config.projection !== 'orthographic' || projected[2] > 0)) {
                const [x, y, z] = projected;
                const opacityFactor = (config.projection === 'orthographic' ? z : 1);

                const value = getOverlayValue(lon, lat, config.altitudeKm, currentYear, config.overlayType);
                if (value === null) {
                    calcErrors++;
                    continue;
                }

                const angle = getVectorAngle(lon, lat, config.altitudeKm, currentYear, config.overlayType);
                if (angle === null) {
                    calcErrors++;
                    continue;
                }
                const color = getOverlayColor(value, config.overlayType);

                // Adjust vector length scale
                let lengthScaleFactor = 0.5;
                if (config.overlayType === 'magvar') lengthScaleFactor = 0.3;
                // Base length on scale, cap min/max
                const length = Math.min(scale * 0.15, Math.max(scale * 0.01, Math.abs(value) * lengthScaleFactor + scale * 0.02));

                const radians = angle * Math.PI / 180;
                const endX = x + Math.sin(radians) * length;
                const endY = y - Math.cos(radians) * length;
                if (isNaN(endX) || isNaN(endY)) {
                    continue;
                }

                overlayGroup.append('line')
                    .attr('x1', x).attr('y1', y)
                    .attr('x2', endX).attr('y2', endY)
                    .attr('stroke', color)
                    .attr('stroke-width', Math.max(0.5, 1 + scale * 0.001))
                    .attr('opacity', opacityFactor);

                // Draw arrowhead
                const arrowSize = Math.max(1.5, length * 0.2);
                const arrowAngle = Math.PI / 6;


                const arrowX1 = endX - arrowSize * Math.sin(radians - arrowAngle);
                const arrowY1 = endY + arrowSize * Math.cos(radians - arrowAngle);
                const arrowX2 = endX - arrowSize * Math.sin(radians + arrowAngle);
                const arrowY2 = endY + arrowSize * Math.cos(radians + arrowAngle);
                if (isNaN(arrowX1) || isNaN(arrowY1) || isNaN(arrowX2) || isNaN(arrowY2)) {
                    continue;
                }

                overlayGroup.append('path')
                    .attr('d', `M${endX},${endY} L${arrowX1},${arrowY1} L${arrowX2},${arrowY2} Z`)
                    .attr('fill', color)
                    .attr('opacity', opacityFactor);

                drawnCount++;
            }
        }
    }
    // console.log(`[drawVectorOverlay] Finished. Drawn ${drawnCount} vectors. ${calcErrors} calculation errors.`); // DEBUG
}

function drawIsolineOverlay(scale, rotation) {
    // console.log("[drawIsolineOverlay] Starting..."); // DEBUG
    const isolineSpacingOptions = { coarse: 10, medium: 5, fine: 2 };
    const isolineStep = isolineSpacingOptions[config.isolineSpacing] || 5;
    // Adjust grid spacing based on scale for performance?
    const gridSpacing = Math.max(1, isolineStep / (scale > 500 ? 2 : 1)); // Example adjustment
    const currentYear = config.decimalYear || getCurrentDecimalYear();
    let calcErrors = 0;
    let drawnCount = 0;

    let minValue = Infinity, maxValue = -Infinity;
    const sampleGridSpacing = Math.max(2, gridSpacing); // Use a coarser grid for range sampling
    // Sample grid to find data range
    for (let lat = -90 + sampleGridSpacing / 2; lat < 90; lat += sampleGridSpacing) {
        for (let lon = -180 + sampleGridSpacing / 2; lon < 180; lon += sampleGridSpacing) {
            const value = getOverlayValue(lon, lat, config.altitudeKm, currentYear, config.overlayType);
            if (value !== null && isFinite(value)) { // Check for valid finite numbers
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            } else {
                calcErrors++;
            }
        }
    }
    // console.log(`[drawIsolineOverlay] Value range: ${minValue} to ${maxValue}. Sample errors: ${calcErrors}`); // DEBUG

    if (!isFinite(minValue) || !isFinite(maxValue) || minValue === maxValue) {
        console.warn(`[drawIsolineOverlay] Could not determine valid data range or range is zero for ${config.overlayType} isolines (Range: ${minValue}-${maxValue}).`);
        return; // Cannot generate thresholds
    }

    const thresholds = d3.range(Math.floor(minValue / isolineStep) * isolineStep, Math.ceil(maxValue / isolineStep) * isolineStep + isolineStep, isolineStep);
    // console.log(`[drawIsolineOverlay] Thresholds: ${thresholds}`); // DEBUG
    if (!thresholds || thresholds.length === 0) {
        console.warn(`[drawIsolineOverlay] No thresholds generated for range ${minValue}-${maxValue} with step ${isolineStep}.`);
        return;
    }

    const valueGrid = [];
    const rows = Math.ceil(180 / gridSpacing) + 1;
    const cols = Math.ceil(360 / gridSpacing) + 1;

    // Create grid of values for contouring
    for (let j = 0; j < rows; j++) {
        const lat = (j * gridSpacing) - 90;
        for (let i = 0; i < cols; i++) {
            const lon = (i * gridSpacing) - 180;
            // Provide NaN for null values, d3.contours handles this
            valueGrid.push(getOverlayValue(lon, lat, config.altitudeKm, currentYear, config.overlayType) ?? NaN);
        }
    }

    // Generate contours
    const contours = d3.contours()
        .size([cols, rows])
        .thresholds(thresholds)
        .smooth(true); // Enable smoothing

    let contourData = [];
    try {
        contourData = contours(valueGrid);
        // console.log(`[drawIsolineOverlay] Generated ${contourData.length} contour levels.`); // DEBUG
    } catch (error) {
        console.error("[drawIsolineOverlay] Error during d3.contours execution:", error);
        return;
    }

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
                .attr('opacity', 0.8); // Adjust opacity as needed
            drawnCount++;
        }
    });
    // console.log(`[drawIsolineOverlay] Finished. Drawn ${drawnCount} contours.`); // DEBUG
}

/**
 * Helper function to convert contour data to SVG path data
 * Handles projection and visibility culling.
 */
function convertContourToPathData(contour, scale, rotation, gridSpacing) {
    const pathSegments = [];
    for (const ring of contour.coordinates) {
        for (const polygon of ring) {
            let segment = [];
            let lastVisible = null; // Track visibility transitions
            for (let i = 0; i < polygon.length; i++) {
                const point = polygon[i];
                // Convert grid coordinates back to geographic coordinates
                const lon = (point[0] * gridSpacing) - 180;
                const lat = (point[1] * gridSpacing) - 90;

                // Project the geographic coordinates
                const projected = applyProjection(lon, lat, scale, rotation);

                let isVisible = false;
                if (projected) {
                    // Check if point is on the visible side (adjust threshold for orthographic)
                    if (config.projection !== 'orthographic' || projected[2] > -0.01) {
                        isVisible = true;
                    }
                }

                if (isVisible) {
                    if (lastVisible === false && segment.length > 0) {
                        // Path segment re-entered the visible area, start new move command
                        if (segment.length > 1) pathSegments.push(`M${segment.join(' L')}`);
                        segment = []; // Reset segment for new line part
                    }
                    // Add projected point to current segment
                    if (!isNaN(projected[0]) && !isNaN(projected[1])) {
                        segment.push(`${projected[0].toFixed(2)},${projected[1].toFixed(2)}`);
                    }
                }

                // Update last visibility status
                lastVisible = isVisible;

                // If the segment becomes invisible after being visible, draw the completed part
                if (!isVisible && segment.length > 0) {
                    if (segment.length > 1) pathSegments.push(`M${segment.join(' L')}`);
                    segment = []; // Reset segment
                }
            }
            // Add the last segment if it remained visible till the end
            if (segment.length > 1) {
                pathSegments.push(`M${segment.join(' L')}`);
            }
        }
    }
    return pathSegments.join(' ');
}