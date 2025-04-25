// js/data.js
import { config } from './config.js';
import { loadWmmData } from './wmm.js';

// Data availability flags
export const dataAvailable = {
    landLowRes: false,
    landHighRes: false,
    temperature: false, // Placeholder
    windspeed: false,   // Placeholder
    humidity: false,    // Placeholder
    magvar: false,
    airports: true,     // Mark placeholder data as available
    waypoints: true,    // Mark placeholder data as available
    navaids: true,      // Mark placeholder data as available
    airspace: false,    // No placeholder data yet
    airways: false      // No placeholder data yet
};

// Store loaded GeoJSON land data
export let landDataLowRes = null;
export let landDataHighRes = null;

// --- Placeholder Aviation Data ---
export const placeholderAirports = [
    { id: "KLAX", name: "Los Angeles Intl", lat: 33.9425, lon: -118.4081 },
    { id: "EGLL", name: "London Heathrow", lat: 51.4700, lon: -0.4543 },
    { id: "RJTT", name: "Tokyo Haneda", lat: 35.5494, lon: 139.7798 },
    { id: "YSSY", name: "Sydney Kingsford Smith", lat: -33.9461, lon: 151.1772 }
];

export const placeholderWaypoints = [
    { id: "TAUPO", name: "TAUPO VOR", lat: -38.7489, lon: 176.1150 },
    { id: "BERNI", name: "BERNI Intersection", lat: 46.7000, lon: 7.5000 },
    { id: "MIDWAY", name: "MIDWAY Point", lat: 28.2083, lon: -177.3708 },
    { id: "GOMER", name: "GOMER Intersection", lat: 34.0000, lon: -80.0000 }
];
// Placeholder for Navaids (could be combined or separate)
export const placeholderNavaids = [
    { id:"TAUPO", type:"VOR", lat: -38.7489, lon: 176.1150 },
    { id:"GEN", type:"NDB", lat: 46.2333, lon: 6.1333}
];


/**
 * Load land GeoJSON data from URL
 */
async function loadGeoJsonData(url, dataKey) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        // Check if the response is JSON before parsing
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const geoJsonData = await response.json();
            dataAvailable[dataKey] = true;
            console.log(`${dataKey} GeoJSON data loaded successfully from ${url}.`);
            return geoJsonData;
        } else {
            throw new Error(`Response is not JSON for ${url}. Content-Type: ${contentType}`);
        }
    } catch (error) {
        console.error(`Error loading ${dataKey} GeoJSON from ${url}:`, error);
        updateDataSourceInfo(`Error Loading ${dataKey} GeoJSON`, 'N/A');
        dataAvailable[dataKey] = false;
        return null; // Return null to indicate failure
    }
}

/**
 * Load all external data sources
 */
export async function loadAllData() {
    const lowResPromise = loadGeoJsonData(config.landDataUrlLowRes, 'landLowRes').then(data => {
        landDataLowRes = data;
        if(data) updateDataSourceInfo(config.landDataUrlLowRes.split('/').pop(), config.dataSourceTimestamp); // Update info display
    });
    const highResPromise = loadGeoJsonData(config.landDataUrlHighRes, 'landHighRes').then(data => {
        landDataHighRes = data;
        // Don't update timestamp here, assume low-res source is the main one for display
    });
    const wmmPromise = loadWmmData(config.wmmCofUrl).then(success => {
        dataAvailable.magvar = success;
        if(!success) updateDataSourceInfo('WMM Load Failed', config.dataSourceTimestamp);
    });

    // Simulate loading other data (even though it's placeholder)
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay
    dataAvailable.airports = true;
    dataAvailable.waypoints = true;
    dataAvailable.navaids = true; // Assuming navaids are also available

    await Promise.all([lowResPromise, highResPromise, wmmPromise]);

    // Update UI based on loaded data *after* all promises resolved
    updateDataAvailabilityUI();

    // Indicate overall topology readiness based on low-res data
    return dataAvailable.landLowRes;
}

/**
 * Update the data source information display in the About panel
 */
function updateDataSourceInfo(sourceName, timestamp) {
    const sourceInfoElement = document.getElementById('data-source-info');
    const timestampElement = document.getElementById('data-source-timestamp');
    if (sourceInfoElement) {
        sourceInfoElement.textContent = sourceName || 'Unknown';
    }
    if (timestampElement) {
        timestampElement.textContent = timestamp || 'N/A';
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
    // Update overlay dropdown options
    const options = overlaySelect.querySelectorAll('option');
    options.forEach(option => {
        const dataType = option.value;
        if (dataType !== 'none') {
            const baseText = option.dataset.baseText || option.textContent.replace(' (unavailable)', '').replace(' (loading...)', '');
            option.dataset.baseText = baseText;
            if (!dataAvailable.hasOwnProperty(dataType)) {
                option.textContent = `${baseText} (unavailable)`;
                option.disabled = true;
                option.style.color = '#888';
            } else if (dataAvailable[dataType]) {
                option.textContent = baseText;
                option.disabled = false;
                option.style.color = '';
            } else {
                option.textContent = `${baseText} (unavailable)`;
                option.disabled = true;
                option.style.color = '#888';
            }
        }
    });
    if (overlaySelect.selectedOptions.length > 0 && overlaySelect.selectedOptions[0].disabled) {
        overlaySelect.value = 'none';
        config.overlayType = 'none';
        if (window.callbacks && typeof window.callbacks.scheduleRender === 'function') {
            window.callbacks.scheduleRender(true);
        }
    }

    // Update layer toggles based on data availability (e.g., disable if no data)
    const layerToggles = {
        'toggle-layer-airports': 'airports',
        'toggle-layer-waypoints': 'waypoints',
        'toggle-layer-navaids': 'navaids',
        'toggle-layer-airspace': 'airspace',
        'toggle-layer-airways': 'airways'
    };
    for (const toggleId in layerToggles) {
        const element = document.getElementById(toggleId);
        const dataKey = layerToggles[toggleId];
        if (element) {
            const label = element.closest('.layer-item'); // Find parent item
            if (!dataAvailable[dataKey]) {
                element.disabled = true;
                if (label) label.style.opacity = 0.5; // Visually indicate disabled
                if (label) label.title = "Data not available for this layer";
            } else {
                element.disabled = false;
                if (label) label.style.opacity = 1;
                if (label) label.title = `Toggle ${dataKey}`;
            }
        }
    }
}