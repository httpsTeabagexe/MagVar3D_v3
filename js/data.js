// js/data.js
import { config } from './config.js';
import { loadWmmData } from './wmm.js';

// Data availability flags
export const dataAvailable = {
    topology: false,
    temperature: false, // Placeholder
    windspeed: false,   // Placeholder
    humidity: false,    // Placeholder
    magvar: false
};

// Store loaded TopoJSON data
export let worldData = null;

/**
 * Load TopoJSON data from URL
 */
export async function loadTopoJsonData() {
    try {
        const response = await fetch(config.topoJsonUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${config.topoJsonUrl}`);
        }
        worldData = await response.json();
        dataAvailable.topology = true;
        console.log("TopoJSON data loaded successfully.");
        updateDataSourceInfo(config.topoJsonUrl.split('/').pop()); // Update info display
        return worldData;
    } catch (error) {
        console.error("Error loading TopoJSON:", error);
        console.log("Using simplified world data as fallback.");
        worldData = createSimplifiedWorldData();
        dataAvailable.topology = true; // Mark topology as available even with fallback
        updateDataSourceInfo('simplified-data (fallback)');
        return worldData;
    }
}

/**
 * Load all external data sources
 */
export async function loadAllData() {
    const topoPromise = loadTopoJsonData();
    const wmmPromise = loadWmmData(config.wmmCofUrl).then(success => {
        dataAvailable.magvar = success;
    });

    await Promise.all([topoPromise, wmmPromise]);
    updateDataAvailabilityUI(); // Update UI based on loaded data
    return worldData; // Return topology data for initial render
}

/**
 * Update the data source information display
 */
function updateDataSourceInfo(sourceName) {
    const infoElement = document.getElementById('data-info');
    if (infoElement) {
        infoElement.querySelector('span').textContent = `Source: ${sourceName} | ${config.dataSourceTimestamp}`;
    }
}

/**
 * Function to update UI elements based on data availability
 */
function updateDataAvailabilityUI() {
    const overlaySelect = document.getElementById('overlay-type');
    if (!overlaySelect) return;

    const options = overlaySelect.querySelectorAll('option');
    options.forEach(option => {
        const dataType = option.value;
        if (dataType !== 'none') {
            // Reset text content first
            option.textContent = option.textContent.replace(' (unavailable)', '');
            option.disabled = false;
            option.style.color = '';

            if (!dataAvailable[dataType]) {
                option.textContent += ' (unavailable)';
                option.disabled = true;
                option.style.color = '#888';
            }
        }
    });
    // Ensure current selection is valid
    if (overlaySelect.selectedOptions.length > 0 && overlaySelect.selectedOptions[0].disabled) {
        overlaySelect.value = 'none'; // Fallback to 'none' if current selection is unavailable
        // Manually trigger change event if needed, or update config directly
        config.overlayType = 'none';
        // Potentially trigger a re-render if the overlay type changed due to unavailability
        // This might be handled better in the main app logic after loadAllData resolves.
    }

}


/**
 * Fallback to simplified world data if loading fails
 */
function createSimplifiedWorldData() {
    // Using a simple FeatureCollection for easier processing downstream
    return topojson.topology({
        land: {
            type: "GeometryCollection",
            geometries: [ /* Simplified geometries as Polygon/MultiPolygon */
                // Example: A box for North America
                { type: "Polygon", coordinates: [[[-170, 10], [-50, 10], [-50, 80], [-170, 80], [-170, 10]]] },
                // Add more simplified continents...
            ]
        }
    });
}

/**
 * Extract topojson features safely
 */
export function extractTopoFeatures(topologyData, objectName) {
    if (!topologyData || !topologyData.objects || !topologyData.objects[objectName]) {
        console.warn(`Object '${objectName}' not found in topology data.`);
        // Attempt fallback to the first available object if 'land' isn't found
        if (topologyData && topologyData.objects && Object.keys(topologyData.objects).length > 0) {
            const fallbackName = Object.keys(topologyData.objects)[0];
            console.warn(`Falling back to object: ${fallbackName}`);
            return topojson.feature(topologyData, topologyData.objects[fallbackName]);
        }
        return { type: "FeatureCollection", features: [] }; // Return empty collection if nothing found
    }
    try {
        return topojson.feature(topologyData, topologyData.objects[objectName]);
    } catch (error) {
        console.error(`Error converting TopoJSON object '${objectName}' to GeoJSON:`, error);
        return { type: "FeatureCollection", features: [] }; // Return empty collection on error
    }
}