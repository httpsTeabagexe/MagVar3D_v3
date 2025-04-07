// js/ui.js
import { config } from './config.js';
import { screenToLonLat } from './wgs84.js';
import { getOverlayValue, formatOverlayValue } from './overlayUtils.js';
import { dataAvailable } from './data.js'; // To check before showing overlay data

let svg, appState, callbacks, marker, infoWindow, tooltip;
let autoRotateTimer = null;
let currentPOI = null; // Point of Interest { lon, lat, screenX, screenY }

// --- Initialization ---

export function initializeUI(_svg, _appState, _callbacks) {
    svg = _svg;
    appState = _appState; // Should contain { currentScale, currentRotation, worldData } refs or getters/setters
    callbacks = _callbacks; // Should contain { triggerRender, navigateTo, setRotation, setScale, startStopAutoRotate }

    // Get UI elements
    marker = d3.select('#marker');
    infoWindow = d3.select('#info-window');
    tooltip = d3.select('#tooltip');

    // Setup Interaction Handlers
    setupDrag();
    setupZoom();
    setupMouseInteraction();
    setupWindowResize();

    // Setup Menu Controls
    setupMenuVisibility();
    setupOverlayControls();
    setupDisplayOptions();
    setupProjectionControls();
    setupViewPresets();
    setupSettingsPanel();

    // Initial UI updates
    updateLocationDisplay();
    updateStatusDisplay();
}

// --- Interaction Handlers ---

function setupDrag() {
    let dragStartRotation;
    const dragBehavior = d3.drag()
        .on('start', (event) => {
            event.sourceEvent.stopPropagation();
            if(config.autoRotate) {
                callbacks.startStopAutoRotate(false); // Stop auto-rotate on drag
                console.log("UI: Drag started, stopping auto-rotate"); // Debug Log 2
            }
            dragStartRotation = [...appState.currentRotation];
        })

        .on('drag', (event) => {
            const rotate = [...dragStartRotation]; // Work from the start rotation of this drag gesture
            const dx = event.dx;
            const dy = event.dy;

            // Adjust rotation based on drag delta
            rotate[0] += dx / config.sensitivity * 10;
            rotate[1] -= dy / config.sensitivity * 10;

            // Clamp latitude rotation
            rotate[1] = Math.max(-90, Math.min(90, rotate[1]));

            // Normalize longitude
            rotate[0] = (rotate[0] + 540) % 360 - 180; // Keep within -180 to 180

            callbacks.setRotation(rotate); // Update app state
            callbacks.triggerRender(false); // Trigger render (don't wait for animation frame during drag)
            updateLocationDisplay(); // Update location display while dragging
        });
    svg.call(dragBehavior);
}

function setupZoom() {
    let zoomRequestId = null;
    const zoomBehavior = d3.zoom()
        .scaleExtent([config.minScale / config.defaultScale, config.maxScale / config.defaultScale]) // Use scale factor extent
        .on('zoom', (event) => {
            const newScale = event.transform.k * config.defaultScale;
            // Clamp scale within min/max limits defined in config
            const scale = Math.min(config.maxScale, Math.max(config.minScale, newScale));
            callbacks.setScale(scale); // Update app state

            // Debounce rendering using requestAnimationFrame
            if (zoomRequestId) cancelAnimationFrame(zoomRequestId);
            zoomRequestId = requestAnimationFrame(() => {
                callbacks.triggerRender(false);
                updateStatusDisplay(); // Update scale in status
                zoomRequestId = null;
            });
        });
    svg.call(zoomBehavior);
    // Set initial zoom transform programmatically if needed
    // const initialTransform = d3.zoomIdentity.scale(appState.currentScale / config.defaultScale);
    // svg.call(zoomBehavior.transform, initialTransform);
}

function setupMouseInteraction() {
    svg.on('click', handleMouseClick);
    svg.on('mousemove', handleMouseMove);
    svg.on('mouseout', handleMouseOut);
}

function handleMouseClick(event) {
    // Prevent click interfering with drag/zoom
    if (event.defaultPrevented) return;

    const [mouseX, mouseY] = d3.pointer(event);
    setPOI(mouseX, mouseY);
}

function handleMouseMove(event) {
    if (config.overlayType !== 'none') {
        const [mouseX, mouseY] = d3.pointer(event);
        showOverlayTooltip(mouseX, mouseY);
    }
}

function handleMouseOut() {
    hideTooltip();
}


function setupWindowResize() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            config.width = window.innerWidth;
            config.height = window.innerHeight;

            svg.attr('width', config.width)
                .attr('height', config.height);

            // Update center translation for globe group
            const globeGroupElement = svg.select('g.globe-group').node(); // Assuming you add this class in app.js
            if(globeGroupElement) {
                d3.select(globeGroupElement).attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);
            }

            callbacks.triggerRender(true); // Force full render after resize
            // Also update POI position if visible
            if (currentPOI) updatePOI();
        }, 150); // Debounce resize event
    });
}

// --- Menu and Control Setup ---

function setupMenuVisibility() {
    const menuButton = document.getElementById('menu-button');
    const menuPanel = document.getElementById('menu-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsButton = document.getElementById('settings-button');
    const backButton = document.getElementById('back-button');

    menuButton?.addEventListener('click', () => {
        menuPanel?.classList.toggle('visible');
        settingsPanel?.classList.remove('visible'); // Close settings if opening menu
    });

    settingsButton?.addEventListener('click', () => {
        settingsPanel?.classList.add('visible');
        menuPanel?.classList.remove('visible');
    });

    backButton?.addEventListener('click', () => {
        settingsPanel?.classList.remove('visible');
        menuPanel?.classList.add('visible');
    });
}

function setupOverlayControls() {
    // Overlay Type Select (Top Right)
    const overlayTypeSelect = document.getElementById('overlay-type');
    overlayTypeSelect?.addEventListener('change', () => {
        if (overlayTypeSelect.selectedOptions[0].disabled) {
            // Don't select unavailable option, revert (or handle differently)
            overlayTypeSelect.value = config.overlayType; // Revert to previous valid type
            return;
        }
        config.overlayType = overlayTypeSelect.value;
        callbacks.triggerRender(true);
        updatePOI(); // Update POI info if visible
    });
    // Set initial value from config
    if(overlayTypeSelect) overlayTypeSelect.value = config.overlayType;

    // Display Mode Buttons (Top Right)
    const modeButtons = {
        gradient: document.getElementById('mode-gradient'),
        vector: document.getElementById('mode-vector'),
        isoline: document.getElementById('mode-isoline'),
    };
    Object.entries(modeButtons).forEach(([mode, button]) => {
        button?.addEventListener('click', () => {
            if (button.classList.contains('active')) return; // No change
            config.displayMode = mode;
            Object.values(modeButtons).forEach(btn => btn?.classList.remove('active'));
            button.classList.add('active');
            callbacks.triggerRender(true);
        });
        // Set initial active state
        if(button && config.displayMode === mode) button.classList.add('active');
    });


    // Altitude/Height Slider (Top Right)
    const heightSlider = document.getElementById('height-level');
    const heightValueSpan = document.getElementById('height-value');
    heightSlider?.addEventListener('input', () => {
        config.altitudeKm = parseInt(heightSlider.value);
        if (heightValueSpan) heightValueSpan.textContent = `${config.altitudeKm} km`;
        if (config.overlayType !== 'none') {
            callbacks.triggerRender(true); // Re-render overlay for new altitude
            updatePOI(); // Update POI info for new altitude
        }
    });
    // Set initial value
    if (heightSlider) heightSlider.value = config.altitudeKm;
    if (heightValueSpan) heightValueSpan.textContent = `${config.altitudeKm} km`;
}

function setupDisplayOptions() {
    // Menu Panel Options
    const options = {
        'show-graticule': (checked) => config.showGraticule = checked,
        'show-grid-dots': (checked) => config.showGridDots = checked,
        'outline-only': (checked) => config.outlineOnly = checked,
        'show-labels': (checked) => config.showLabels = checked,
    };

    Object.entries(options).forEach(([id, setter]) => {
        const checkbox = document.getElementById(id);
        checkbox?.addEventListener('change', () => {
            setter(checkbox.checked);
            callbacks.triggerRender(true);
        });
        // Set initial state
        if(checkbox) checkbox.checked = config[Object.keys(config).find(key => key.toLowerCase().replace('show','') === id.replace('show-',''))] ?? false;
        if(id === 'show-graticule' && checkbox) checkbox.checked = config.showGraticule; // Handle naming difference
        if(id === 'show-grid-dots' && checkbox) checkbox.checked = config.showGridDots;
        if(id === 'outline-only' && checkbox) checkbox.checked = config.outlineOnly;
        if(id === 'show-labels' && checkbox) checkbox.checked = config.showLabels;

    });
}

function setupProjectionControls() {
    // Projection Select (Menu Panel)
    const projectionSelect = document.getElementById('projection-select');
    projectionSelect?.addEventListener('change', () => {
        config.projection = projectionSelect.value;
        callbacks.triggerRender(true);
        // Zoom/pan might need resetting or adjusting for non-orthographic projections
    });
    if(projectionSelect) projectionSelect.value = config.projection;

    // Rotation Speed (Menu Panel)
    const rotationSpeedSlider = document.getElementById('rotation-speed');
    rotationSpeedSlider?.addEventListener('input', () => {
        config.rotationSpeed = parseInt(rotationSpeedSlider.value);
        // This callback *should* trigger the logic in app.js
        callbacks.startStopAutoRotate(config.rotationSpeed > 0);
        console.log(`UI: Rotation speed set to ${config.rotationSpeed}, calling startStopAutoRotate(${config.rotationSpeed > 0})`); // Debug Log 1
    });
    if(rotationSpeedSlider) rotationSpeedSlider.value = config.rotationSpeed;
}


function setupViewPresets() {
    // View Preset Buttons (Menu Panel)
    const views = {
        'view-north-america': [-100, 40], 'view-south-america': [-60, -20],
        'view-europe': [10, 50], 'view-africa': [20, 0], 'view-asia': [100, 35],
        'view-australia': [135, -25], 'view-pacific': [-170, 0], 'view-atlantic': [-30, 0],
    };
    Object.entries(views).forEach(([id, [lon, lat]]) => {
        document.getElementById(id)?.addEventListener('click', () => {
            callbacks.navigateTo(lon, lat); // Use callback to handle navigation animation
        });
    });
}


function setupSettingsPanel() {
    // Settings Panel Controls (Opacity, Density, Spacing, Colors, Grid)

    // Land/Ocean Colors
    const colorOptions = document.querySelectorAll('#settings-panel .color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            const parentDiv = option.closest('div');
            const isOcean = parentDiv?.textContent.includes('Ocean');
            const color = option.getAttribute('data-color');

            // Remove selected from siblings
            parentDiv?.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            if (isOcean) config.oceanColor = color;
            else config.landColor = color;
            callbacks.triggerRender(true);
        });
        // Set initial selected state (find the option matching config color)
        const initialColor = option.closest('div')?.textContent.includes('Ocean') ? config.oceanColor : config.landColor;
        if (option.getAttribute('data-color') === initialColor) option.classList.add('selected');

    });

    // Grid Opacity
    const gridOpacitySlider = document.getElementById('grid-opacity');
    gridOpacitySlider?.addEventListener('input', () => {
        config.graticuleOpacity = parseInt(gridOpacitySlider.value) / 100;
        callbacks.triggerRender(false); // Graticule is redrawn anyway
    });
    if (gridOpacitySlider) gridOpacitySlider.value = config.graticuleOpacity * 100;


    // Grid Color
    const gridColorSelect = document.getElementById('grid-color');
    gridColorSelect?.addEventListener('change', () => {
        config.graticuleColor = gridColorSelect.value;
        callbacks.triggerRender(false);
    });
    if (gridColorSelect) gridColorSelect.value = config.graticuleColor;


    // Overlay Opacity
    const overlayOpacitySlider = document.getElementById('overlay-opacity');
    overlayOpacitySlider?.addEventListener('input', () => {
        config.overlayOpacity = parseInt(overlayOpacitySlider.value) / 100;
        // Update opacity directly on the overlay group if possible
        const overlayGroupElement = svg.select('g.overlay-visualization').node();
        if (overlayGroupElement) d3.select(overlayGroupElement).style('opacity', config.overlayOpacity);
    });
    if (overlayOpacitySlider) overlayOpacitySlider.value = config.overlayOpacity * 100;


    // Vector Density
    const vectorDensitySlider = document.getElementById('vector-density');
    vectorDensitySlider?.addEventListener('input', () => {
        config.vectorDensity = parseInt(vectorDensitySlider.value);
        if (config.displayMode === 'vector') callbacks.triggerRender(true);
    });
    if (vectorDensitySlider) vectorDensitySlider.value = config.vectorDensity;


    // Isoline Spacing
    const isolineSpacingSelect = document.getElementById('isoline-spacing');
    isolineSpacingSelect?.addEventListener('change', () => {
        config.isolineSpacing = isolineSpacingSelect.value;
        if (config.displayMode === 'isoline') callbacks.triggerRender(true);
    });
    if (isolineSpacingSelect) isolineSpacingSelect.value = config.isolineSpacing;

}

// --- UI Update Functions ---

function updateLocationDisplay() {
    const locationElement = document.getElementById('location');
    if (!locationElement) return;

    const [lon, lat] = appState.currentRotation;
    const lonAbs = Math.abs(lon).toFixed(1);
    const latAbs = Math.abs(lat).toFixed(1);
    const lonDir = lon >= 0 ? 'E' : 'W';
    const latDir = lat >= 0 ? 'N' : 'S';

    locationElement.querySelector('span').textContent = `${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}`;
}

function updateStatusDisplay() {
    const statusElement = document.getElementById('status');
    if (!statusElement) return;
    statusElement.querySelector('span').textContent = `WGS84 | Scale: ${appState.currentScale.toFixed(0)}`;
}

// --- Tooltip ---

function showOverlayTooltip(mouseX, mouseY) {
    const lonLat = screenToLonLat(mouseX, mouseY, appState.currentScale, appState.currentRotation, config.width, config.height);

    if (lonLat) {
        const [lon, lat] = lonLat;
        let content = `${lat.toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

        if (config.overlayType !== 'none') {
            const overlayName = config.overlayType === 'magvar' ? 'Magnetic Variation' :
                config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1);

            if (dataAvailable[config.overlayType]) {
                const value = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
                const formattedValue = formatOverlayValue(value, config.overlayType);
                content += `<br>${overlayName}: <strong>${formattedValue}</strong>`;
            } else {
                content += `<br>${overlayName}: <strong>Unavailable</strong>`;
            }
            if(config.altitudeKm > 0) {
                content += `<br>Altitude: ${config.altitudeKm} km`;
            }
        }

        tooltip
            .style('left', `${mouseX + 15}px`)
            .style('top', `${mouseY + 5}px`)
            .style('opacity', 1)
            .html(content);
    } else {
        hideTooltip(); // Hide if pointer is off the globe
    }
}

function hideTooltip() {
    tooltip.style('opacity', 0);
}

// --- Point of Interest (POI) ---

function setPOI(mouseX, mouseY) {
    const lonLat = screenToLonLat(mouseX, mouseY, appState.currentScale, appState.currentRotation, config.width, config.height);

    if (lonLat) {
        currentPOI = { lon: lonLat[0], lat: lonLat[1], screenX: mouseX, screenY: mouseY };
        updatePOI();
    } else {
        // Clicked outside globe, clear POI
        currentPOI = null;
        updatePOI();
    }
}

function updatePOI() {
    if (!currentPOI || !marker || !infoWindow) {
        marker?.style('display', 'none');
        infoWindow?.style('display', 'none');
        return;
    }

    // Project POI's lon/lat back to screen coords for current view
    const projected = applyProjection(currentPOI.lon, currentPOI.lat, appState.currentScale, appState.currentRotation);

    if (projected && projected[2] > 0) { // Check if visible (z > 0)
        const [x, y] = projected;
        const screenX = x + config.width / 2;
        const screenY = -y + config.height / 2; // Adjust for SVG Y inversion

        // Update Marker
        marker
            .style('display', 'block')
            .style('left', `${screenX}px`)
            .style('top', `${screenY}px`);

        // Update Info Window Content
        let infoContent = `<strong>Location:</strong> ${currentPOI.lat.toFixed(2)}° ${currentPOI.lat >= 0 ? 'N' : 'S'}, ${currentPOI.lon.toFixed(2)}° ${currentPOI.lon >= 0 ? 'E' : 'W'}`;
        if (config.overlayType !== 'none') {
            const overlayName = config.overlayType === 'magvar' ? 'Magnetic Variation' :
                config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1);

            if (dataAvailable[config.overlayType]) {
                const value = getOverlayValue(currentPOI.lon, currentPOI.lat, config.altitudeKm, config.overlayType);
                const formattedValue = formatOverlayValue(value, config.overlayType);
                infoContent += `<br>${overlayName}: <strong>${formattedValue}</strong>`;
            } else {
                infoContent += `<br>${overlayName}: Unavailable`;
            }
        }
        if(config.altitudeKm > 0) {
            infoContent += `<br>Altitude: ${config.altitudeKm} km`;
        }


        infoWindow
            .style('display', 'block')
            .style('left', `${screenX}px`) // Position relative to marker
            .style('top', `${screenY - 15}px`) // Position above marker
            .html(infoContent);

    } else {
        // POI is not visible on this side of the globe
        marker.style('display', 'none');
        infoWindow.style('display', 'none');
    }
}

// --- Autorotation ---
// Controlled via callbacks.startStopAutoRotate now