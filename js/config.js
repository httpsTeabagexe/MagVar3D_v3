// js/config.js

const lightTheme = {
    landColor: '#72B092',
    oceanColor: '#001D3D',
    landStrokeColor: '#333',
    graticuleColor: '#888',
};

// Animation and timing constants





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
    initialRotation: [0, 0, 0], // Added initial rotation
    rotationSpeed: 0.5, // Added default rotation speed
    autoRotate: false, // Added autoRotate flag
    showGraticule: true,
    showAirports: true,
    showWaypoints: true,
    showNavaids: true,
    showMagVarOverlay: true,
    navaidStrokeWidth: 0.7,
    navaidSize: 5,
    navaidStrokeColor: "white",
    navaidColor: "purple",
    width: 900, // Default width
    height: 900, // Default height
    overlayOpacity: 0.7, // Added overlay opacity
    themes: {
        light: lightTheme
    }
};

// WGS84 reference ellipsoid constants
export const WGS84 = {
    radius: 6378137, // Earth radius in meters
    a: 6378137, // Semi-major axis
    e2: 0.00669438 // First eccentricity squared
};

export const ZOOM_LEVELS = [
    100, 150, 200, 250, 280, 320, 360, 400, 450, 500, 550, 600, 650
]; // Example zoom levels

export const LOD_SCALES = [
    { max: 340, suffix: '110m', tileSize: 36 }, // Low LOD (coarse, use ne_110m)
    { max: 9999, suffix: '50m', tileSize: 18 },  // All higher zoom levels use 50m
];

// Overlay color scales
