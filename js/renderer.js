// js/renderer.js
import { config, WGS84 } from './config.js';
import { dataAvailable, landDataLowRes, landDataHighRes } from './data.js';
import { getCurrentDecimalYear } from './wmm.js';
import { appState } from './app.js';

let svg, globeGroup, earthBoundary, overlayGroup;
let lodTimeout = null;
let useHighRes = false;

// --- Shared D3 Projection ---
let projection = d3.geoOrthographic();

// --- Graticule ---
const graticule = d3.geoGraticule().stepMinor([10, 10]).stepMajor([90, 30]);

export function initializeRenderer(_svg, _globeGroup, _earthBoundary, _overlayGroup) {
    svg = _svg;
    globeGroup = _globeGroup;
    earthBoundary = _earthBoundary;
    overlayGroup = _overlayGroup;
}

/**
 * Render the globe and all visible layers.
 */
// export function renderGlobe(scale, rotation) {
//     // Update projection parameters
//     projection
//         .scale(scale)
//         .rotate(rotation)
//         .translate([config.width / 2, config.height / 2])
//         .clipAngle(90);
//
//     // Update ocean boundary
//     earthBoundary
//         .attr('rx', scale)
//         .attr('ry', scale)
//         .attr('fill', config.oceanColor);
//
//     // Draw land and overlays
//     drawLand();
//     drawGraticule();
//     if (config.showAirspaces) drawAirspaces();
//     if (config.showAirports) drawAirports();
// }

/**
 * Draw land using the shared projection.
 */
function drawLand() {
    const path = d3.geoPath(projection);
    const landData = useHighRes && dataAvailable.landHighRes ? landDataHighRes : landDataLowRes;
    if (!landData) return;

    let land = globeGroup.selectAll('.land-path').data([landData]);
    land.enter()
        .append('path')
        .attr('class', 'land-path')
        .merge(land)
        .attr('d', path)
        .attr('fill', config.landColor)
        .attr('stroke', config.landStrokeColor)
        .attr('stroke-width', config.landStrokeWidth);

    land.exit().remove();
}

/**
 * Draw graticule (grid lines) using the shared projection.
 */
function drawGraticule() {
    if (!config.showGraticule) {
        globeGroup.selectAll('.graticule-path').remove();
        return;
    }
    const path = d3.geoPath(projection);
    globeGroup.selectAll('.graticule-path').remove();
    globeGroup.append('path')
        .datum(graticule())
        .attr('class', 'graticule-path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', config.graticuleColor)
        .attr('stroke-width', config.graticuleWidth)
        .attr('opacity', config.graticuleOpacity);
}

/**
 * Draw airspaces (placeholder).
 */
function drawAirspaces() {
    // Example: draw nothing or placeholder
}

/**
 * Draw airports (placeholder).
 */
function drawAirports() {
    // Example: draw nothing or placeholder
}

/**
 * Render overlays (stub).
 */
export function renderOverlays() {
    // Example: overlays rendering logic
}