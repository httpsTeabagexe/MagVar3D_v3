// js/config.js

export const WGS84 = {
    a: 6378137.0,
    b: 6356752.314245,
    f: 1 / 298.257223563,
    e2: 0.00669437999014,
};

const lightTheme = {
    landColor: '#72B092',
    oceanColor: '#001D3D',
    landStrokeColor: '#555555',
};

const darkTheme = {
    landColor: '#303030',
    oceanColor: '#181818',
    landStrokeColor: '#222222',
};

const zoomLevelThresholds = [
    { scale: 150, level: 0 },
    { scale: 250, level: 1 },
    { scale: 400, level: 3 },
    { scale: 600, level: 5 },
    { scale: 900, level: 7 },
    { scale: Infinity, level: 10 }
];

export const config = {
    // Core Display & Interaction
    sensitivity: 75,
    defaultScale: 280,
    maxScale: 2900,
    minScale: 90,
    initialRotation: [0, 10, 0],
    projection: 'orthographic',
    autoRotate: false,
    rotationSpeed: 0,

    // Data Sources
    landDataUrlLowRes: 'MagVar3D_v3/ne_110m_land.geojson',
    landDataUrlHighRes: 'MagVar3D_v3/ne_50m_land.geojson',
    lakesDataUrl: 'MagVar3D_v3/ne_50m_lakes.geojson',
    lodScaleThreshold: 600,
    lodDelayMs: 400,
    wmmCofUrl: './wmm_cof/WMM.COF',
    dataSourceTimestamp: '2025-03-21 17:50:26 UTC',

    // Map Display Options
    activeMapPreset: 'IFR HIGH',
    showGraticule: true,
    outlineOnly: false,
    nightMode: false,
    movingMap: false,

    // Map Layer Visibility
    showAirports: true,
    showAirspaces: true,

    // Overlay Options
    overlayType: 'magvar',
    displayMode: 'isoline',
    altitudeKm: 0,
    maxAltitudeKm: 10,
    overlayOpacity: 0.7,
    vectorDensity: 5,
    isolineSpacing: 'medium',
    decimalYear: null,

    // Theme & Style
    landColor: lightTheme.landColor,
    landStrokeColor: lightTheme.landStrokeColor,
    landStrokeWidth: 0.1,
    oceanColor: lightTheme.oceanColor,
    graticuleColor: '#555555',
    graticuleWidth: 0.1,
    graticuleOpacity: 0.5,

    // UI Controls
    ui: {
        overlayOpacityControl: 70, // percent, default value for UI slider
        vectorDensityControl: 5,
        isolineSpacingControl: 'medium',
        dateYearMin: 2020,
        dateYearMax: 2030,
        dateYearStep: 0.1,
        gridOpacity: 50,
        gridColor: '#555555',
        tooltipDelayMs: 100,
        zoomScaleFactor: 1.15,
        dragSensitivityFactor: 0.015,
        viewTargets: {
            'atlantic': [-30, 30],
            'pacific': [-170, 0],
            'north-america': [-100, 40],
            'south-america': [-60, -20],
            'europe': [15, 50],
            'africa': [20, 0],
            'asia': [90, 40],
            'australia': [135, -25]
        }
    },

    // Theme storage
    themes: {
        light: lightTheme,
        dark: darkTheme,
    },

    // Zoom Level Definitions
    zoomLevelThresholds: zoomLevelThresholds,
};
