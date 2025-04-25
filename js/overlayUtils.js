// js/overlayUtils.js
import { calculateMagneticVariation, getCurrentDecimalYear } from './wmm.js';
import { dataAvailable } from './data.js'; // Assuming data.js manages availability flags

/**
 * Get overlay data value for a specific location and type
 * @param {number} lon Longitude
 * @param {number} lat Latitude
 * @param {number} altitudeKm Altitude in Kilometers
 * @param {number} decimalYear The decimal year for the calculation (e.g., 2023.5)
 * @param {string} overlayType Type of overlay (e.g., 'magvar')
 * @returns {number | null} The calculated value or null if unavailable
 */
export function getOverlayValue(lon, lat, altitudeKm, decimalYear, overlayType) {
    // Check cached availability first (if data.js provides this)
    // if (!dataAvailable[overlayType]) {
    //     return null;
    // }

    switch (overlayType) {
        case 'magvar':
            // Use the provided decimalYear
            return calculateMagneticVariation(lon, lat, altitudeKm, decimalYear);

        case 'temperature': // Placeholder - needs data source
        case 'windspeed':   // Placeholder - needs data source
        case 'humidity':    // Placeholder - needs data source
            // console.warn(`Data source for ${overlayType} not implemented.`);
            return null; // Return null as data isn't actually available

        default:
            return null;
    }
}

/**
 * Get color based on overlay value and type
 * (Color scales remain the same, no change needed here)
 */
export function getOverlayColor(value, overlayType) {
    if (value === null || typeof value === 'undefined') return '#555'; // Grey for no data

    if (overlayType === 'magvar') {
        const scale = d3.scaleLinear()
            .domain([-20, -10, 0, 10, 20])
            .range(["#0000FF", "#32CD32", "#FFFF00", "#FF8C00", "#FF0000"]) // Blue -> Green -> Yellow -> Orange -> Red
            .clamp(true);
        return scale(value);
    }

    if (overlayType === 'temperature') {
        const scale = d3.scaleLinear()
            .domain([-30, 0, 15, 30, 45])
            .range(['#000080', '#1E90FF', '#FFD700', '#FF4500', '#FF0000'])
            .clamp(true);
        return scale(value);
    }
    if (overlayType === 'windspeed') {
        const scale = d3.scaleLinear()
            .domain([0, 5, 10, 20, 35, 50])
            .range(['#006400', '#32CD32', '#FFD700', '#FFA500', '#FF0000', '#FF00FF'])
            .clamp(true);
        return scale(value);
    }
    if (overlayType === 'humidity') {
        const scale = d3.scaleLinear()
            .domain([0, 20, 40, 60, 80, 100])
            .range(['#FF9900','#FFFF00','#99FF66','#00FFCC','#0066FF','#0000FF'])
            .clamp(true);
        return scale(value);
    }

    return '#CCCCCC';
}

/**
 * Format overlay value for display in tooltips/legends
 * (No change needed here)
 */
export function formatOverlayValue(value, overlayType) {
    if (value === null || typeof value === 'undefined') return "N/A";

    switch (overlayType) {
        case 'magvar':
            const direction = value >= 0 ? 'E' : 'W';
            return `${Math.abs(value).toFixed(1)}° ${direction}`;
        case 'temperature':
            return `${value.toFixed(1)} °C`;
        case 'windspeed':
            return `${value.toFixed(1)} m/s`;
        case 'humidity':
            return `${value.toFixed(0)}%`;
        default:
            return value.toString();
    }
}

/**
 * Get vector angle based on overlay type (e.g., wind direction, magvar)
 * Returns angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 * @param {number} lon Longitude
 * @param {number} lat Latitude
 * @param {number} altitudeKm Altitude in Kilometers
 * @param {number} decimalYear The decimal year for the calculation
 * @param {string} overlayType Type of overlay (e.g., 'magvar')
 * @returns {number | null} The calculated angle or null
 */
export function getVectorAngle(lon, lat, altitudeKm, decimalYear, overlayType) {
    // Check availability if needed
    // if (!dataAvailable[overlayType]) return null;

    switch (overlayType) {
        case 'magvar':
            // Magnetic variation IS the angle (deviation from True North)
            // Pass the decimal year to get the correct value
            const magvar = getOverlayValue(lon, lat, altitudeKm, decimalYear, overlayType);
            return magvar;

        case 'windspeed': // Needs direction data, not just speed
            console.warn("Wind direction data not available for vector overlay.");
            return null;

        default:
            return null;
    }
}

/**
 * Update the overlay legend based on current config
 * (No change needed here, as it reads from config which includes decimalYear implicitly via title)
 */
export function updateOverlayLegend(config) {
    const legend = document.getElementById('overlay-legend');
    const legendTitle = legend?.querySelector('h3');
    const legendBar = document.getElementById('legend-bar');
    const legendLabels = document.getElementById('legend-labels');

    if (!legend || !legendTitle || !legendBar || !legendLabels) return;

    if (config.overlayType === 'none') { // Removed dataAvailable check as it might not be reliable yet
        legend.classList.remove('visible');
        return;
    }

    legend.classList.add('visible');

    let title = 'Overlay Legend';
    switch (config.overlayType) {
        case 'magvar': title = 'Magnetic Variation'; break;
        case 'temperature': title = 'Temperature'; break;
        case 'windspeed': title = 'Wind Speed'; break;
        case 'humidity': title = 'Relative Humidity'; break;
    }
    // Include Altitude and Date in the legend title
    const currentYear = config.decimalYear || getCurrentDecimalYear(); // Get year from config or current
    title += ` at ${config.altitudeKm.toFixed(0)} km, ${currentYear.toFixed(1)}`;
    legendTitle.textContent = title;

    // ... (rest of the legend update logic remains the same) ...

    let scaleDomain, scaleColors, labelValues;
    switch (config.overlayType) {
        case 'magvar':
            scaleDomain = [-20, 20];
            scaleColors = ["#0000FF", "#32CD32", "#FFFF00", "#FF8C00", "#FF0000"];
            labelValues = [-20, -10, 0, 10, 20];
            break;
        // ... other cases ...
        case 'temperature':
            scaleDomain = [-30, 45];
            scaleColors = ['#000080', '#1E90FF', '#FFD700', '#FF4500', '#FF0000'];
            labelValues = [-30, 0, 15, 30, 45];
            break;
        case 'windspeed':
            scaleDomain = [0, 50];
            scaleColors = ['#006400', '#32CD32', '#FFD700', '#FFA500', '#FF0000', '#FF00FF'];
            labelValues = [0, 10, 20, 35, 50];
            break;
        case 'humidity':
            scaleDomain = [0, 100];
            scaleColors = ['#FF9900','#FFFF00','#99FF66','#00FFCC','#0066FF','#0000FF'];
            labelValues = [0, 20, 40, 60, 80, 100];
            break;
        default:
            legend.classList.remove('visible');
            return;
    }

    legendBar.style.background = `linear-gradient(to top, ${scaleColors.join(', ')})`;
    legendLabels.innerHTML = '';
    labelValues.forEach(value => {
        const span = document.createElement('span');
        span.textContent = formatOverlayValue(value, config.overlayType);
        const percentage = (value - scaleDomain[0]) / (scaleDomain[1] - scaleDomain[0]) * 100;
        span.style.position = 'absolute';
        span.style.bottom = `calc(${percentage}% - 0.6em)`;
        span.style.left = '25px';
        legendLabels.appendChild(span);
    });
}

/**
 * Show message when data is unavailable (draws inside the overlay group)
 */
export function showDataUnavailableMessage(overlayGroup) {
    overlayGroup.selectAll('*').remove();
    overlayGroup.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('fill', '#aaa')
        .text(`Overlay data unavailable`);

    const legend = document.getElementById('overlay-legend');
    if(legend) legend.classList.remove('visible');
}

/**
 * Extract points along a path for isoline labels (simplified)
 */
export function extractLabelPoints(pathData, count) {
    console.warn("extractLabelPoints is a placeholder.");
    return [];
}
