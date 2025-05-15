import { config } from './config.js';

    // Data availability flags
    export const dataAvailable = {
        landLowRes: false,
        landHighRes: false,
        magvar: true,
        airports: true,
        waypoints: true,
        navaids: true,
        airspace: false,
        airways: false
    };

    // Store loaded GeoJSON land data
    export let landDataLowRes = null;
    export let landDataHighRes = null;

    // Placeholder data
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

    export const placeholderNavaids = [
        { id: "TAUPO", type: "VOR", lat: -38.7489, lon: 176.1150 },
        { id: "GEN", type: "NDB", lat: 46.2333, lon: 6.1333 }
    ];

    // Load GeoJSON data
    async function loadGeoJsonData(url, dataKey) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
                const data = await response.json();
                dataAvailable[dataKey] = true;
                console.log(`${dataKey} data loaded from ${url}`);
                return data;
            } else {
                throw new Error(`Invalid content type: ${contentType}`);
            }
        } catch (error) {
            console.error(`Error loading ${dataKey} from ${url}:`, error);
            dataAvailable[dataKey] = false;
            return null;
        }
    }

    // Load all data
    export async function loadAllData() {
        const lowResPromise = loadGeoJsonData(config.landDataUrlLowRes, 'landLowRes').then(data => landDataLowRes = data);
        const highResPromise = loadGeoJsonData(config.landDataUrlHighRes, 'landHighRes').then(data => landDataHighRes = data);

        await Promise.all([lowResPromise, highResPromise]);
        updateDataAvailabilityUI();
        return dataAvailable.landLowRes;
    }
    //TODO
    // // Update data source info
    // function updateDataSourceInfo(sourceName, timestamp) {
    //     document.getElementById('data-source-info')?.textContent = sourceName || 'Unknown';
    //     document.getElementById('data-source-timestamp')?.textContent = timestamp || 'N/A';
    // }

    // Update UI based on data availability
    function updateDataAvailabilityUI() {
        const magvarToggle = document.getElementById('toggle-magvar-overlay');
        if (magvarToggle) {
            magvarToggle.disabled = !dataAvailable.magvar;
            magvarToggle.parentElement.style.opacity = dataAvailable.magvar ? 1 : 0.5;
        }

        const layerToggles = {
            'toggle-layer-airports': 'airports',
            'toggle-layer-waypoints': 'waypoints',
            'toggle-layer-navaids': 'navaids',
            'toggle-layer-airspace': 'airspace',
            'toggle-layer-airways': 'airways'
        };

        for (const [id, key] of Object.entries(layerToggles)) {
            const element = document.getElementById(id);
            const label = element?.closest('.layer-item');
            if (element) {
                element.disabled = !dataAvailable[key];
                if (label) {
                    label.style.opacity = dataAvailable[key] ? 1 : 0.5;
                    label.title = dataAvailable[key] ? `Toggle ${key}` : "Data not available";
                }
            }
        }
    }