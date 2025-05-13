// js/config.js

const lightTheme = {
    landColor: '#72B092',
    oceanColor: '#001D3D',
    landStrokeColor: '#333',
    graticuleColor: '#888',
};

export const config = {
    landDataUrlLowRes: './MagVar3D_v3/ne_110m_land.geojson', // Adjust as needed
    landDataUrlHighRes: './MagVar3D_v3/ne_50m_land.geojson',
    landColor: lightTheme.landColor,
    oceanColor: lightTheme.oceanColor,
    landStrokeColor: lightTheme.landStrokeColor,
    landStrokeWidth: 0.7,
    graticuleColor: lightTheme.graticuleColor,
    graticuleWidth: 0.5,
    graticuleOpacity: 0.7,
    defaultScale: 280,
    // Add other config properties like showGraticule, showAirports etc. if they are managed here
    showGraticule: true, // Example: assuming you want graticules by default
    showAirports: true,  // Example
    showWaypoints: true, // Example
    showNavaids: true,   // Example
    showMagVarOverlay: true, // Example
    navaidStrokeWidth: 0.7,
    navaidSize: 5,
    navaidStrokeColor: "white",
    navaidColor: "purple"
};

// Add these exports:
export const WGS84 = {
    radius: 6378137, // Earth radius in meters
};

export const ZOOM_LEVELS = [
    100, 150, 200, 250, 280, 320, 360, 400, 450, 500, 550, 600, 650
]; // Example zoom levels

export const LOD_SCALES = [
    { max: 340, suffix: '110m', tileSize: 36 }, // Low LOD (coarse, use ne_110m)
    { max: 9999, suffix: '50m', tileSize: 18 },  // All higher zoom levels use 50m
];