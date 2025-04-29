// Aggressively optimized, tile-based LOD globe rendering inspired by cambecc/earth.
// Only visible land is loaded and rendered at either low or high resolution, high-res only for visible sector.

import { config } from './config.js';

let projection, path, graticule, context, width, height, centerX, centerY;
let landTiles = {}; // { tileId: { geojson, loaded, features } }
let marker = null;
let overlayInfo = null;
let currentScale = config.defaultScale || 280;
let currentRotation = [0, 0];
let rafHandle = null;
let dragging = false;
let lastPos = null;

// Tile and LOD settings
const LOD_SCALES = [
    { max: 340, suffix: '110m', tileSize: 36 }, // Low LOD (coarse, use ne_110m)
    { max: 520, suffix: '50m', tileSize: 18 },  // Med LOD (medium, use ne_50m)
    { max: 9999, suffix: '10m', tileSize: 6 },  // High LOD (fine, use ne_10m)
];

// Tile load queue management
const MAX_CONCURRENT_TILE_REQUESTS = 6;
let tileQueue = [];
let tileRequestsInFlight = 0;

// Define zoom levels similar to cambecc/earth (example values)
// You can adjust these to match your preferred "snap" levels and min/max
const ZOOM_LEVELS = [180, 240, 280, 320, 370, 420, 480, 560, 650];
let zoomLevelIdx = ZOOM_LEVELS.findIndex(z => z >= currentScale);
if (zoomLevelIdx === -1) zoomLevelIdx = ZOOM_LEVELS.length - 1;

export function initGlobe(container) {
    width = container.clientWidth;
    height = container.clientHeight;
    centerX = width / 2;
    centerY = height / 2;

    // Main canvas
    const canvas = d3.select(container).append("canvas")
        .attr("width", width)
        .attr("height", height)
        .node();
    context = canvas.getContext("2d");

    // D3 projection and path
    projection = d3.geoOrthographic()
        .scale(currentScale)
        .translate([centerX, centerY])
        .rotate(currentRotation)
        .clipAngle(90);

    path = d3.geoPath(projection, context);
    graticule = d3.geoGraticule10();

    // Interactions
    canvas.addEventListener('mousedown', e => {
        lastPos = [e.clientX, e.clientY];
        dragging = true;
    });
    canvas.addEventListener('mouseup', e => {
        dragging = false;
        if (Math.abs(e.clientX - lastPos[0]) < 4 && Math.abs(e.clientY - lastPos[1]) < 4) {
            const [x, y] = [e.offsetX, e.offsetY];
            const coords = projection.invert([x, y]);
            if (coords) {
                marker = { lon: coords[0], lat: coords[1] };
                overlayInfo = {
                    lon: marker.lon,
                    lat: marker.lat,
                    info: `MagVar: ${getFakeMagVar(marker.lon, marker.lat)}°`
                };
                redraw(true);
                showOverlayInfo(overlayInfo);
            }
        }
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        const dx = e.clientX - lastPos[0];
        const dy = e.clientY - lastPos[1];
        lastPos = [e.clientX, e.clientY];
        currentRotation[0] += dx * 0.5;
        currentRotation[1] = Math.max(-90, Math.min(90, currentRotation[1] - dy * 0.5));
        projection.rotate(currentRotation);
        requestRedraw();
    });
    window.addEventListener('mouseup', () => { dragging = false; });

    // Zoom with mouse wheel
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        setZoom(currentScale + (e.deltaY < 0 ? 15 : -15));
    }, { passive: false });

    // Initial tile load & draw
    redraw(true);
}

function requestRedraw() {
    if (!rafHandle) {
        rafHandle = requestAnimationFrame(() => {
            redraw(false);
            rafHandle = null;
        });
    }
}

function getLOD() {
    for (const lod of LOD_SCALES) {
        if (currentScale <= lod.max) return lod;
    }
    return LOD_SCALES[LOD_SCALES.length - 1];
}

// Return the list of visible tiles for a given tile size (degrees)
function getVisibleTiles(tileSize, suffix) {
    const tiles = [];
    const [lambda0, phi0] = projection.rotate();

    for (let lon = -180; lon < 180; lon += tileSize) {
        for (let lat = -90; lat < 90; lat += tileSize) {
            // Only load tiles whose center is visible
            const center = [lon + tileSize / 2, lat + tileSize / 2];
            const screen = projection(center);
            if (!screen) continue;
            const dx = screen[0] - centerX;
            const dy = screen[1] - centerY;
            // In-sphere check
            if ((dx * dx + dy * dy) < (projection.scale() * projection.scale())) {
                const id = `${suffix}_${lon}_${lat}`;
                tiles.push({ id, lon, lat, tileSize, suffix });
            }
        }
    }
    return tiles;
}

function loadTile(tile, cb) {
    if (landTiles[tile.id]) {
        if (landTiles[tile.id].loaded) cb(landTiles[tile.id]);
        return;
    }
    landTiles[tile.id] = { loaded: false, geojson: null, features: [] };

    // Queue this tile for loading
    tileQueue.push({ tile, cb });
    processTileQueue();
}

function processTileQueue() {
    while (tileRequestsInFlight < MAX_CONCURRENT_TILE_REQUESTS && tileQueue.length > 0) {
        const { tile, cb } = tileQueue.shift();
        tileRequestsInFlight++;
        const url = `MagVar3D_v3/tiles/land_${tile.suffix}_${tile.lon}_${tile.lat}.json`;
        d3.json(url).then(data => {
            landTiles[tile.id].geojson = data;
            landTiles[tile.id].loaded = true;
            landTiles[tile.id].features = data && data.features ? data.features : [];
            tileRequestsInFlight--;
            cb(landTiles[tile.id]);
            processTileQueue();
        }).catch(() => {
            landTiles[tile.id].loaded = true;
            landTiles[tile.id].geojson = null;
            landTiles[tile.id].features = [];
            tileRequestsInFlight--;
            cb(landTiles[tile.id]);
            processTileQueue();
        });
    }
}

export function redraw(force = false) {
    // Always render low-res for full visible globe, render high-res only for visible sector if zoomed in
    const lowLod = LOD_SCALES[0]; // always render 110m under everything
    const highLod = getLOD(); // can be 50m or 10m
    const highRes = (highLod.suffix !== '110m');

    // Gather visible tiles for both LODs (high-res only if appropriate)
    const visibleLowTiles = getVisibleTiles(lowLod.tileSize, lowLod.suffix);
    const visibleHighTiles = highRes ? getVisibleTiles(highLod.tileSize, highLod.suffix) : [];

    context.clearRect(0, 0, width, height);

    // Ocean
    context.beginPath();
    context.arc(centerX, centerY, projection.scale(), 0, 2 * Math.PI);
    context.fillStyle = config.oceanColor;
    context.fill();

    // Graticule
    context.beginPath();
    path(graticule);
    context.strokeStyle = config.graticuleColor;
    context.globalAlpha = config.graticuleOpacity;
    context.lineWidth = config.graticuleWidth;
    context.stroke();
    context.globalAlpha = 1.0;

    let needAnotherDraw = false;

    // Low-res land: draw all visible low-res tiles
    for (const tile of visibleLowTiles) {
        const tileData = landTiles[tile.id];
        if (!tileData || !tileData.loaded) {
            needAnotherDraw = true;
            loadTile(tile, () => requestRedraw());
            continue;
        }
        if (!tileData.geojson) continue;
        context.beginPath();
        tileData.features.forEach(f => path(f));
        context.fillStyle = config.landColor;
        context.fill();
        context.beginPath();
        tileData.features.forEach(f => path(f));
        context.strokeStyle = config.landStrokeColor;
        context.lineWidth = config.landStrokeWidth;
        context.stroke();
    }

    // High-res land: draw only visible sector tiles, overlays low-res
    for (const tile of visibleHighTiles) {
        const tileData = landTiles[tile.id];
        if (!tileData || !tileData.loaded) {
            needAnotherDraw = true;
            loadTile(tile, () => requestRedraw());
            continue;
        }
        if (!tileData.geojson) continue;
        context.beginPath();
        tileData.features.forEach(f => path(f));
        context.fillStyle = config.landColor;
        context.fill();
        context.beginPath();
        tileData.features.forEach(f => path(f));
        context.strokeStyle = config.landStrokeColor;
        context.lineWidth = config.landStrokeWidth;
        context.stroke();
    }

    // Marker style from cambecc/earth
    if (marker) {
        const [x, y] = projection([marker.lon, marker.lat]);
        context.save();
        context.beginPath();
        context.arc(x, y + 5, 8, 0, 2 * Math.PI);
        context.fillStyle = "rgba(0,0,0,0.45)";
        context.fill();
        context.beginPath();
        context.arc(x, y, 7, 0, 2 * Math.PI);
        context.fillStyle = "#f90";
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(x, y, 2.3, 0, 2 * Math.PI);
        context.fillStyle = "#fff";
        context.fill();
        context.restore();
        // Info box above marker
        const infoText = `(${marker.lon.toFixed(2)}, ${marker.lat.toFixed(2)})`;
        context.save();
        context.font = "bold 13px Segoe UI, Arial";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.strokeStyle = "#232323";
        context.lineWidth = 4;
        context.strokeText(infoText, x, y - 14);
        context.fillStyle = "#fff";
        context.fillText(infoText, x, y - 14);
        context.restore();
    }

    if (needAnotherDraw) requestRedraw();
}

// Fake MagVar value for demo
function getFakeMagVar(lon, lat) {
    return (Math.sin(lon / 30) * Math.cos(lat / 30) * 15).toFixed(1);
}

// Imperative UI API for zoom/rotation
export function setZoom(scale) {
    // Snap to nearest zoom level
    let closest = ZOOM_LEVELS.reduce((prev, curr) =>
        Math.abs(curr - scale) < Math.abs(prev - scale) ? curr : prev
    );
    currentScale = Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], closest));
    zoomLevelIdx = ZOOM_LEVELS.indexOf(currentScale);
    projection.scale(currentScale);
    requestRedraw();
    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = currentScale;
}

// Optional: expose discrete zoom in/out controls
export function zoomIn() {
    if (zoomLevelIdx < ZOOM_LEVELS.length - 1) {
        zoomLevelIdx++;
        setZoom(ZOOM_LEVELS[zoomLevelIdx]);
    }
}
export function zoomOut() {
    if (zoomLevelIdx > 0) {
        zoomLevelIdx--;
        setZoom(ZOOM_LEVELS[zoomLevelIdx]);
    }
}
export function setRotation([lambda, phi]) {
    currentRotation = [lambda, phi];
    projection.rotate(currentRotation);
    requestRedraw();
}
export function getState() {
    return {
        scale: currentScale,
        rotation: currentRotation.slice()
    };
}

// --- Overlay Info UI (bottom right) ---
function showOverlayInfo({ lon, lat, info }) {
    let el = document.getElementById('overlay-info-box');
    if (!el) {
        el = document.createElement('div');
        el.id = 'overlay-info-box';
        Object.assign(el.style, {
            position: 'fixed',
            right: '2em',
            bottom: '2em',
            background: 'rgba(32,32,40,0.96)',
            color: '#fff',
            fontFamily: 'Segoe UI, Arial, sans-serif',
            padding: '1em 1.6em',
            borderRadius: '12px',
            boxShadow: '0 4px 18px #0006',
            minWidth: '220px',
            zIndex: 999,
            fontSize: '1.02em'
        });
        document.body.appendChild(el);
    }
    el.innerHTML = `
        <div style="font-size:1.12em; margin-bottom:0.4em;">
            <b>Coordinates:</b> ${lon.toFixed(3)}, ${lat.toFixed(3)}
        </div>
        <div>
            <b>Overlay:</b> ${info}
        </div>
        <div style="margin-top:0.5em; color:#bbb; font-size:0.9em;">
            <i>Click on globe for more info</i>
        </div>
    `;
}