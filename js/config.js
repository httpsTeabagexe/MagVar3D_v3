// js/config.js

// WGS84 parameters (official values)
export const WGS84 = {
    a: 6378137.0,              // semi-major axis (equatorial radius) in meters
    b: 6356752.314245,         // semi-minor axis (polar radius) in meters
    f: 1 / 298.257223563,        // flattening
    e2: 0.00669437999014,      // first eccentricity squared
};

// Define color themes
const lightTheme = {
    landColor: '#72B092',
    oceanColor: '#001D3D',
    landStrokeColor: '#555555', // Example light stroke
};

const darkTheme = {
    landColor: '#303030',
    oceanColor: '#181818',
    landStrokeColor: '#222222', // Example dark stroke
};

// Map scale thresholds to abstract zoom levels (higher scale = higher zoom level)
// These values likely correspond to 'min_zoom' properties in Natural Earth data
const zoomLevelThresholds = [
    { scale: 150, level: 0 },  // Corresponds to min_zoom 0.0
    { scale: 250, level: 1 },  // Corresponds to min_zoom ~1.0 - 2.0
    { scale: 400, level: 3 },  // Corresponds to min_zoom ~3.0 - 4.0
    { scale: 600, level: 5 },  // Corresponds to min_zoom ~5.0 - 6.0
    { scale: 900, level: 7 }, // Corresponds to min_zoom ~7.0+
    { scale: Infinity, level: 10 } // Max level for highest detail
];

// Default application configuration
export const config = {
    // Core Display & Interaction
    width: window.innerWidth,
    height: window.innerHeight,
    sensitivity: 75,
    defaultScale: 280,
    maxScale: 2900,
    minScale: 90,
    initialRotation: [0, 10, 0], // Start slightly tilted
    projection: 'orthographic', // Default projection
    autoRotate: false,
    rotationSpeed: 0,

    // Data Sources
    landDataUrlLowRes: 'MagVar3D_v3/ne_110m_land.geojson', // Low-res land data
    landDataUrlHighRes: 'MagVar3D_v3/ne_50m_land.geojson', // High-res land data
    lodScaleThreshold: 600, // Scale at which to switch to high-res land data
    lodDelayMs: 400, // delay in ms before switching to high-res
    wmmCofUrl: './wmm_cof/WMM.COF', // Keep WMM data source
    dataSourceTimestamp: '2025-03-21 17:50:26 UTC', // Consider updating or removing if not used

    // Map Display Options
    activeMapPreset: 'IFR HIGH', // Example, review if needed
    showGraticule: true,
    outlineOnly: false,
    nightMode: false, // User control for light/dark theme
    movingMap: false, // Example, review if needed

    // Map Layer Visibility (Current Features)
    showAirports: true,
    showAirspaces: true,

    // Overlay Options
    overlayType: 'magvar', // Default to showing magvar overlay
    displayMode: 'isoline', // Default to isolines ('gradient', 'vector', 'isoline')
    altitudeKm: 0,
    maxAltitudeKm: 10, // Max altitude for UI slider/input
    overlayOpacity: 0.7,
    vectorDensity: 5, // Keep if vector mode is used
    isolineSpacing: 'medium', // Keep if isoline mode is used ('coarse', 'medium', 'fine')
    decimalYear: null, // Will be initialized in UI or fallback to current year

    // Theme & Style (Set initial from lightTheme, dynamically updated by nightMode toggle)
    landColor: lightTheme.landColor,
    landStrokeColor: lightTheme.landStrokeColor, // Also thematic now
    landStrokeWidth: 0.1,
    oceanColor: lightTheme.oceanColor,
    graticuleColor: '#555555', // Keep separate control for now
    graticuleWidth: 0.1,
    graticuleOpacity: 0.5,

    // Store theme colors for easy access in UI
    themes: {
        light: lightTheme,
        dark: darkTheme,
    },

    // Zoom Level Definitions
    zoomLevelThresholds: zoomLevelThresholds,
};