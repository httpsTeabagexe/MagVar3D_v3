// js/ui.js
import { config } from './config.js';
import { screenToLonLat } from './wgs84.js';

let svg, appState, callbacks;
let isDragging = false;
let lastMouseX, lastMouseY;
let marker, infoWindow, tooltip;

export function initializeUI(_svg, _appState, _callbacks) {
    svg = _svg;
    appState = _appState;
    callbacks = _callbacks;

    // Initialize UI elements
    marker = document.getElementById('marker');
    infoWindow = document.getElementById('info-window');
    tooltip = document.getElementById('tooltip');

    // Setup event listeners
    setupEventListeners();
    setupMenu();
    setupSettingsPanel();
    setupOverlayControls();
}

function setupEventListeners() {
    // Mouse events for dragging
    svg.on('mousedown', handleMouseDown);
    svg.on('mousemove', handleMouseMove);
    svg.on('mouseup', handleMouseUp);
    svg.on('mouseout', handleMouseUp);

    // Mouse events for tooltip
    svg.on('mouseover', handleMouseOver);
    svg.on('mousemove', handleMouseOver);
    svg.on('mouseout', handleMouseOut);

    // Touch events for dragging
    svg.on('touchstart', handleTouchStart);
    svg.on('touchmove', handleTouchMove);
    svg.on('touchend', handleTouchEnd);
    svg.on('touchcancel', handleTouchEnd);

    // Zoom events
    svg.on('wheel', handleWheel);
}

function handleMouseDown(event) {
    isDragging = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
}

function handleMouseMove(event) {
    if (!isDragging) return;

    const dx = event.clientX - lastMouseX;
    const dy = event.clientY - lastMouseY;

    const rotation = [...appState.currentRotation];
    rotation[0] += dx / config.sensitivity;
    rotation[1] += dy / config.sensitivity;

    callbacks.updateRotation(rotation);
    callbacks.scheduleRender(); // Use scheduleRender here

    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
}

function handleMouseUp() {
    isDragging = false;
}

function handleTouchStart(event) {
    if (event.touches.length === 1) {
        isDragging = true;
        lastMouseX = event.touches[0].clientX;
        lastMouseY = event.touches[0].clientY;
    }
}

function handleTouchMove(event) {
    if (isDragging && event.touches.length === 1) {
        const dx = event.touches[0].clientX - lastMouseX;
        const dy = event.touches[0].clientY - lastMouseY;

        const rotation = [...appState.currentRotation];
        rotation[0] += dx / config.sensitivity;
        rotation[1] += dy / config.sensitivity;

        callbacks.updateRotation(rotation);
        callbacks.scheduleRender(); // Use scheduleRender here

        lastMouseX = event.touches[0].clientX;
        lastMouseY = event.touches[0].clientY;
    }
}

function handleTouchEnd() {
    isDragging = false;
}

function handleWheel(event) {
    event.preventDefault();
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(config.minScale, Math.min(config.maxScale, appState.currentScale * scaleFactor));
    callbacks.updateScale(newScale);
    callbacks.scheduleRender(); // Use scheduleRender here
}

function handleMouseOver(event) {
    const [lon, lat] = screenToLonLat(event.offsetX, event.offsetY, appState.currentScale, appState.currentRotation, config.width, config.height);
    if (lon && lat) {
        const formattedLon = lon.toFixed(2);
        const formattedLat = lat.toFixed(2);
        tooltip.textContent = `Lon: ${formattedLon}, Lat: ${formattedLat}`;
        tooltip.style.left = `${event.pageX + 10}px`;
        tooltip.style.top = `${event.pageY + 10}px`;
        tooltip.style.opacity = 1;
    }
}

function handleMouseOut() {
    tooltip.style.opacity = 0;
}

function setupMenu() {
    const menuButton = document.getElementById('menu-button');
    const menuPanel = document.getElementById('menu-panel');
    const settingsButton = document.getElementById('settings-button');
    const settingsPanel = document.getElementById('settings-panel');
    const backButton = document.getElementById('back-button');

    menuButton.addEventListener('click', () => {
        menuPanel.classList.toggle('visible');
        settingsPanel.classList.remove('visible');
    });

    settingsButton.addEventListener('click', () => {
        menuPanel.classList.remove('visible');
        settingsPanel.classList.add('visible');
    });

    backButton.addEventListener('click', () => {
        menuPanel.classList.add('visible');
        settingsPanel.classList.remove('visible');
    });

    // View buttons
    const viewButtons = document.querySelectorAll('.btn-group button');
    viewButtons.forEach(button => {
        button.addEventListener('click', () => {
            const view = button.id.replace('view-', '');
            switch (view) {
                case 'atlantic': callbacks.navigateTo(-30, 30); break;
                case 'pacific': callbacks.navigateTo(180, 0); break;
                case 'north-america': callbacks.navigateTo(-100, 40); break;
                case 'south-america': callbacks.navigateTo(-60, -20); break;
                case 'europe': callbacks.navigateTo(15, 50); break;
                case 'africa': callbacks.navigateTo(20, 0); break;
                case 'asia': callbacks.navigateTo(100, 30); break;
                case 'australia': callbacks.navigateTo(135, -25); break;
            }
        });
    });

    // Projection select
    const projectionSelect = document.getElementById('projection-select');
    projectionSelect.addEventListener('change', () => {
        config.projection = projectionSelect.value;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Graticule checkbox
    const showGraticuleCheckbox = document.getElementById('show-graticule');
    showGraticuleCheckbox.addEventListener('change', () => {
        config.showGraticule = showGraticuleCheckbox.checked;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Grid dots checkbox
    const showGridDotsCheckbox = document.getElementById('show-grid-dots');
    showGridDotsCheckbox.addEventListener('change', () => {
        config.showGridDots = showGridDotsCheckbox.checked;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Outline only checkbox
    const outlineOnlyCheckbox = document.getElementById('outline-only');
    outlineOnlyCheckbox.addEventListener('change', () => {
        config.outlineOnly = outlineOnlyCheckbox.checked;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Show labels checkbox
    const showLabelsCheckbox = document.getElementById('show-labels');
    showLabelsCheckbox.addEventListener('change', () => {
        config.showLabels = showLabelsCheckbox.checked;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Rotation speed slider
    const rotationSpeedSlider = document.getElementById('rotation-speed');
    rotationSpeedSlider.addEventListener('input', () => {
        config.rotationSpeed = parseFloat(rotationSpeedSlider.value);
        callbacks.startStopAutoRotate(config.rotationSpeed > 0);
    });
}

function setupSettingsPanel() {
    // Color options
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            const color = option.dataset.color;
            const parent = option.parentElement;
            const label = parent.querySelector('span').textContent;
            if (label === 'Land:') {
                config.landColor = color;
            } else if (label === 'Ocean:') {
                config.oceanColor = color;
            }
            callbacks.scheduleRender(true); // Force redraw
        });
    });

    // Grid opacity slider
    const gridOpacitySlider = document.getElementById('grid-opacity');
    gridOpacitySlider.addEventListener('input', () => {
        config.graticuleOpacity = parseFloat(gridOpacitySlider.value) / 100;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Grid color select
    const gridColorSelect = document.getElementById('grid-color');
    gridColorSelect.addEventListener('change', () => {
        config.graticuleColor = gridColorSelect.value;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Overlay opacity slider
    const overlayOpacitySlider = document.getElementById('overlay-opacity');
    overlayOpacitySlider.addEventListener('input', () => {
        config.overlayOpacity = parseFloat(overlayOpacitySlider.value) / 100;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Vector density slider
    const vectorDensitySlider = document.getElementById('vector-density');
    vectorDensitySlider.addEventListener('input', () => {
        config.vectorDensity = parseFloat(vectorDensitySlider.value);
        callbacks.scheduleRender(true); // Force redraw
    });

    // Isoline spacing select
    const isolineSpacingSelect = document.getElementById('isoline-spacing');
    isolineSpacingSelect.addEventListener('change', () => {
        config.isolineSpacing = isolineSpacingSelect.value;
        callbacks.scheduleRender(true); // Force redraw
    });
}

function setupOverlayControls() {
    // Overlay type select
    const overlayTypeSelect = document.getElementById('overlay-type');
    overlayTypeSelect.addEventListener('change', () => {
        config.overlayType = overlayTypeSelect.value;
        callbacks.scheduleRender(true); // Force redraw
    });

    // Display mode buttons
    const modeGradientButton = document.getElementById('mode-gradient');
    const modeVectorButton = document.getElementById('mode-vector');
    const modeIsolineButton = document.getElementById('mode-isoline');

    modeGradientButton.addEventListener('click', () => {
        config.displayMode = 'gradient';
        modeGradientButton.classList.add('active');
        modeVectorButton.classList.remove('active');
        modeIsolineButton.classList.remove('active');
        callbacks.scheduleRender(true); // Force redraw
    });

    modeVectorButton.addEventListener('click', () => {
        config.displayMode = 'vector';
        modeGradientButton.classList.remove('active');
        modeVectorButton.classList.add('active');
        modeIsolineButton.classList.remove('active');
        callbacks.scheduleRender(true); // Force redraw
    });

    modeIsolineButton.addEventListener('click', () => {
        config.displayMode = 'isoline';
        modeGradientButton.classList.remove('active');
        modeVectorButton.classList.remove('active');
        modeIsolineButton.classList.add('active');
        callbacks.scheduleRender(true); // Force redraw
    });

    // Altitude slider
    const heightLevelSlider = document.getElementById('height-level');
    const heightValueSpan = document.getElementById('height-value');
    heightLevelSlider.addEventListener('input', () => {
        config.altitudeKm = parseFloat(heightLevelSlider.value);
        heightValueSpan.textContent = `${config.altitudeKm} km`;
        callbacks.scheduleRender(true); // Force redraw
    });
}