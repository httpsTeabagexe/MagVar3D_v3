// js/config.js

// WGS84 parameters (official values)
export const WGS84 = {
    a: 6378137.0,              // semi-major axis (equatorial radius) in meters
    b: 6356752.314245,         // semi-minor axis (polar radius) in meters
    f: 1 / 298.257223563,        // flattening
    e2: 0.00669437999014,      // first eccentricity squared
};

// Default application configuration
export const config = {
    width: window.innerWidth,
    height: window.innerHeight,
    sensitivity: 75,
    defaultScale: 280,
    maxScale: 1200,
    minScale: 150,
    initialRotation: [0, 10, 0], // Start slightly tilted
    topoJsonUrl: './earth-topo.json',
    wmmCofUrl: './WMM.COF',
    showGraticule: true,
    showGridDots: false,
    showLabels: false,
    outlineOnly: false,
    overlayType: 'none',
    displayMode: 'gradient',
    altitudeKm: 0,           // Renamed from 'height' for clarity
    maxAltitudeKm: 10,
    overlayOpacity: 0.7,
    vectorDensity: 5,
    isolineSpacing: 'medium',
    autoRotate: false,
    rotationSpeed: 0,
    projection: 'orthographic',
    landColor: '#303030',
    landStrokeColor: '#222222',
    landStrokeWidth: 0.1,
    oceanColor: '#181818',
    graticuleColor: '#555555',
    graticuleWidth: 0.1,
    graticuleOpacity: 0.5,
    dataSourceTimestamp: '2025-03-21 17:50:26 UTC' // Use the specific time from the original file
};