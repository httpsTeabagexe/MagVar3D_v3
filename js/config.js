// js/config.js

const lightTheme = {
    landColor: '#61bf6e',
    oceanColor: '#001D3D',
    landStrokeColor: '#ff0000',
    graticuleColor: '#ffffff',
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
    },
    waypointStrokeWidth: 0.8,
    useMagnetismLibrary: true

};