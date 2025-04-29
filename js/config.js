// js/config.js

const lightTheme = {
    landColor: '#72B092',
    oceanColor: '#001D3D',
    landStrokeColor: '#333',
    graticuleColor: '#888',
};

export const config = {
    landDataUrlLowRes: 'MagVar3D_v3/ne_110m_land.geojson', // Adjust as needed
    landDataUrlHighRes: 'MagVar3D_v3/ne_50m_land.geojson',
    landColor: lightTheme.landColor,
    oceanColor: lightTheme.oceanColor,
    landStrokeColor: lightTheme.landStrokeColor,
    landStrokeWidth: 0.7,
    graticuleColor: lightTheme.graticuleColor,
    graticuleWidth: 0.5,
    graticuleOpacity: 0.7,
    defaultScale: 280,
};