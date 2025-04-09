// js/data.js
import { config } from './config.js';
import { loadWmmData } from './wmm.js';
// Make sure topojson library is available (either globally or imported if using modules)
// import * as topojson from 'topojson-client'; // Example if using npm modules

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
        updateDataSourceInfo(config.topoJsonUrl.split('/').pop(), config.dataSourceTimestamp); // Update info display
        return worldData;
    } catch (error) {
        console.error("Error loading TopoJSON:", error);
        // console.log("Using simplified world data as fallback."); // Fallback removed for now
        // worldData = createSimplifiedWorldData();
        // dataAvailable.topology = true; // Mark topology as available even with fallback
        updateDataSourceInfo('Error Loading TopoJSON', 'N/A');
        return null; // Return null or throw error to indicate failure
    }
}

/**
 * Load all external data sources
 */
export async function loadAllData() {
    const topoPromise = loadTopoJsonData();
    const wmmPromise = loadWmmData(config.wmmCofUrl).then(success => {
        dataAvailable.magvar = success;
        if(!success) updateDataSourceInfo('WMM Load Failed', config.dataSourceTimestamp);
    });

    // Wait for both promises
    const [topoResult, _] = await Promise.all([topoPromise, wmmPromise]);

    // Update UI based on loaded data *after* all promises resolved
    updateDataAvailabilityUI();

    return topoResult; // Return topology data (or null if failed)
}

/**
 * Update the data source information display in the About panel
 */
function updateDataSourceInfo(sourceName, timestamp) {
    // Target the specific spans in the About panel
    const sourceInfoElement = document.getElementById('data-source-info');
    const timestampElement = document.getElementById('data-source-timestamp');

    if (sourceInfoElement) {
        sourceInfoElement.textContent = sourceName || 'Unknown';
    } else {
        console.warn("Element with ID 'data-source-info' not found in About panel.");
    }

    if (timestampElement) {
        timestampElement.textContent = timestamp || 'N/A';
    } else {
        console.warn("Element with ID 'data-source-timestamp' not found in About panel.");
    }
}


/**
 * Function to update UI elements based on data availability
 */
function updateDataAvailabilityUI() {
    const overlaySelect = document.getElementById('overlay-type');
    if (!overlaySelect) {
        console.warn("Overlay type select element not found.");
        return;
    }

    const options = overlaySelect.querySelectorAll('option');
    options.forEach(option => {
        const dataType = option.value;
        if (dataType !== 'none') {
            const baseText = option.dataset.baseText || option.textContent.replace(' (unavailable)', '').replace(' (loading...)', ''); // Store base text if not already stored
            option.dataset.baseText = baseText; // Store it

            if (!dataAvailable.hasOwnProperty(dataType)) {
                // If data type isn't even tracked, treat as unavailable
                option.textContent = `${baseText} (unavailable)`;
                option.disabled = true;
                option.style.color = '#888';
            } else if (dataAvailable[dataType]) {
                // Data is available
                option.textContent = baseText;
                option.disabled = false;
                option.style.color = ''; // Reset color
            } else {
                // Data is tracked but load failed or pending (assume unavailable for now)
                option.textContent = `${baseText} (unavailable)`;
                option.disabled = true;
                option.style.color = '#888';
            }
        }
    });

    // Check if the *currently selected* option is now disabled
    if (overlaySelect.selectedOptions.length > 0 && overlaySelect.selectedOptions[0].disabled) {
        console.log(`Current overlay '${overlaySelect.value}' is unavailable, switching to 'none'.`);
        overlaySelect.value = 'none'; // Fallback to 'none'
        config.overlayType = 'none'; // Update config state
        // Manually trigger scheduleRender if needed, although changing selection usually does
        if (callbacks && typeof callbacks.scheduleRender === 'function') { // Check if callbacks are available
            callbacks.scheduleRender(true);
        }
    }
}


/**
 * Fallback to simplified world data if loading fails (Example - currently unused)
 */
// function createSimplifiedWorldData() {
//     // Using a simple FeatureCollection for easier processing downstream
//     // Ensure topojson is available if you use this
//     return topojson.topology({
//         land: {
//             type: "GeometryCollection",
//             geometries: [ /* Simplified geometries as Polygon/MultiPolygon */
//                 // Example: A box for North America
//                 { type: "Polygon", coordinates: [[[-170, 10], [-50, 10], [-50, 80], [-170, 80], [-170, 10]]] },
//                 // Add more simplified continents...
//             ]
//         }
//     });
// }

/**
 * Extract topojson features safely
 */
export function extractTopoFeatures(topologyData, objectName) {
    // Ensure topojson library is loaded/available
    if (typeof topojson === 'undefined' || typeof topojson.feature !== 'function') {
        console.error("TopoJSON library not found or feature function missing.");
        return { type: "FeatureCollection", features: [] };
    }

    if (!topologyData || !topologyData.objects) {
        console.warn(`Topology data or 'objects' property missing.`);
        return { type: "FeatureCollection", features: [] };
    }

    let targetObjectKey = objectName; // e.g., 'land'

    // Check if the primary object exists
    if (!topologyData.objects[targetObjectKey]) {
        console.warn(`Object '${targetObjectKey}' not found in topology data.`);
        // Attempt fallback logic (e.g., coastline or first available)
        const fallbackKeys = ['coastline_50m', 'countries', 'states_provinces']; // Add potential fallback keys
        targetObjectKey = fallbackKeys.find(key => topologyData.objects[key]) || null;

        if (targetObjectKey) {
            console.warn(`Falling back to object: ${targetObjectKey}`);
        } else {
            // If still no suitable object found, check if *any* object exists
            const availableKeys = Object.keys(topologyData.objects);
            if (availableKeys.length > 0) {
                targetObjectKey = availableKeys[0];
                console.warn(`Falling back to the first available object: ${targetObjectKey}`);
            } else {
                console.error("No suitable geometry objects found in TopoJSON data.");
                return { type: "FeatureCollection", features: [] }; // Return empty collection
            }
        }
    }

    // Convert the selected TopoJSON object to GeoJSON
    try {
        // Ensure the object itself exists before trying to convert
        const geoJsonObject = topologyData.objects[targetObjectKey];
        if (!geoJsonObject) {
            throw new Error(`Selected TopoJSON object '${targetObjectKey}' is undefined.`);
        }
        return topojson.feature(topologyData, geoJsonObject);
    } catch (error) {
        console.error(`Error converting TopoJSON object '${targetObjectKey}' to GeoJSON:`, error);
        return { type: "FeatureCollection", features: [] }; // Return empty collection on error
    }
}