// js/overlayUtils.js
import { calculateMagneticVariation, getCurrentDecimalYear } from './wmm.js';
import { dataAvailable } from './data.js';

/**
 * Get overlay data value for a specific location and type
 */
export function getOverlayValue(lon, lat, altitudeKm, overlayType) {
    // Check cached availability first
    if (!dataAvailable[overlayType]) {
        return null;
    }

    switch (overlayType) {
        case 'magvar':
            // Use WMM calculation; requires WMM data to be loaded via data.js
            return calculateMagneticVariation(lon, lat, altitudeKm, getCurrentDecimalYear());

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
 */
export function getOverlayColor(value, overlayType) {
    if (value === null || typeof value === 'undefined') return '#555'; // Grey for no data

    // Define color scales (example using d3-scale-chromatic or simple ranges)
    // Example for Magnetic Variation
    if (overlayType === 'magvar') {
        const scale = d3.scaleLinear()
            .domain([-20, -10, 0, 10, 20]) // Domain based on expected range
            .range(["#0000FF", "#32CD32", "#FFFF00", "#FF8C00", "#FF0000"]) // Blue -> Green -> Yellow -> Orange -> Red
            .clamp(true);
        return scale(value);
    }

    // Add scales for other types (temperature, wind, humidity) if data becomes available
    if (overlayType === 'temperature') {
        const scale = d3.scaleLinear()
            .domain([-30, 0, 15, 30, 45])
            .range(['#000080', '#1E90FF', '#FFD700', '#FF4500', '#FF0000']) // Deep Blue -> Yellow -> Red
            .clamp(true);
        return scale(value);
    }
    if (overlayType === 'windspeed') {
        const scale = d3.scaleLinear()
            .domain([0, 5, 10, 20, 35, 50])
            .range(['#006400', '#32CD32', '#FFD700', '#FFA500', '#FF0000', '#FF00FF']) // Green -> Yellow -> Red -> Magenta
            .clamp(true);
        return scale(value);
    }
    if (overlayType === 'humidity') {
        const scale = d3.scaleLinear()
            .domain([0, 20, 40, 60, 80, 100])
            .range(['#FF9900','#FFFF00','#99FF66','#00FFCC','#0066FF','#0000FF']) // Orange -> Yellow -> Green -> Cyan -> Blue
            .clamp(true);
        return scale(value);
    }


    // Default color if type is unknown
    return '#CCCCCC';
}

/**
 * Format overlay value for display in tooltips/legends
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
 */
export function getVectorAngle(lon, lat, altitudeKm, overlayType) {
    if (!dataAvailable[overlayType]) return null;

    switch (overlayType) {
        case 'magvar':
            // Magnetic variation IS the angle (deviation from True North)
            // Convert from (-180 to 180) to (0 to 360) if needed, or use as is for deviation plot
            const magvar = getOverlayValue(lon, lat, altitudeKm, overlayType);
            // Return the raw magvar - the drawing logic interprets this as deviation
            return magvar;

        case 'windspeed': // Needs direction data, not just speed
            console.warn("Wind direction data not available for vector overlay.");
            return null; // Cannot determine angle from speed alone

        // Add cases for other vector types if applicable
        default:
            return null; // No angle defined for this type
    }
}

/**
 * Update the overlay legend based on current config
 */
export function updateOverlayLegend(config) {
    const legend = document.getElementById('overlay-legend');
    const legendTitle = legend?.querySelector('h3');
    const legendBar = document.getElementById('legend-bar');
    const legendLabels = document.getElementById('legend-labels');

    if (!legend || !legendTitle || !legendBar || !legendLabels) return; // Elements not found

    if (config.overlayType === 'none' || !dataAvailable[config.overlayType]) {
        legend.classList.remove('visible');
        return;
    }

    legend.classList.add('visible');

    // 1. Update Title
    let title = 'Overlay Legend';
    switch (config.overlayType) {
        case 'magvar': title = 'Magnetic Variation'; break;
        case 'temperature': title = 'Temperature'; break;
        case 'windspeed': title = 'Wind Speed'; break;
        case 'humidity': title = 'Relative Humidity'; break;
    }
    if (config.altitudeKm > 0) {
        title += ` at ${config.altitudeKm} km`;
    }
    legendTitle.textContent = title;

    // 2. Update Gradient Bar and Labels based on the scale used in getOverlayColor
    let scaleDomain, scaleColors, labelValues;

    switch (config.overlayType) {
        case 'magvar':
            scaleDomain = [-20, 20]; // Min/Max for labels/gradient
            scaleColors = ["#0000FF", "#32CD32", "#FFFF00", "#FF8C00", "#FF0000"]; // Consistent with getOverlayColor scale
            labelValues = [-20, -10, 0, 10, 20];
            break;
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
            legend.classList.remove('visible'); // Hide if type is unknown
            return;
    }

    // Update gradient bar
    legendBar.style.background = `linear-gradient(to top, ${scaleColors.join(', ')})`;

    // Update labels
    legendLabels.innerHTML = ''; // Clear existing labels
    labelValues.forEach(value => {
        const span = document.createElement('span');
        span.textContent = formatOverlayValue(value, config.overlayType);
        // Position the label - simple distribution for now
        const percentage = (value - scaleDomain[0]) / (scaleDomain[1] - scaleDomain[0]) * 100;
        span.style.position = 'absolute';
        span.style.bottom = `calc(${percentage}% - 0.6em)`; // Adjust vertical alignment
        span.style.left = '25px'; // Position next to the bar
        legendLabels.appendChild(span);
    });

}

/**
 * Show message when data is unavailable (draws inside the overlay group)
 */
export function showDataUnavailableMessage(overlayGroup) {
    overlayGroup.selectAll('*').remove(); // Clear any previous overlay content
    overlayGroup.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('fill', '#aaa')
        .text(`Overlay data unavailable`);

    // Also hide the standard legend
    const legend = document.getElementById('overlay-legend');
    if(legend) legend.classList.remove('visible');
}


/**
 * Extract points along a path for isoline labels (simplified)
 */
export function extractLabelPoints(pathData, count) {
    // This is a placeholder. Real implementation needs path parsing (e.g., using pathData library)
    // or sampling points from the SVG path element itself.
    console.warn("extractLabelPoints is a placeholder.");
    return []; // Return empty array
}