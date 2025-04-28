// js/ui.js
import { config } from './config.js';
import { screenToLonLat } from './wgs84.js'; // Assuming screenToLonLat handles projections correctly
import { formatOverlayValue, getOverlayValue } from './overlayUtils.js'; // For tooltip data
import { getCurrentDecimalYear } from './wmm.js'; // Import for date handling

let svg, appState, callbacks;
let isDragging = false;
let dragStartCoords = { x: 0, y: 0 };
let dragStartRotation = [0, 0, 0];
let tooltipTimeout = null; // To delay tooltip appearance
let overlayGroup; // Add overlayGroup variable

let marker, infoWindow, tooltip;

export function initializeUI(_svg, _appState, _callbacks, _overlayGroup) { // Add _overlayGroup parameter
    svg = _svg;
    appState = _appState;
    callbacks = _callbacks;
    overlayGroup = _overlayGroup; // Store overlayGroup

    // Initialize UI elements (Tooltip, Marker - unrelated to sidebar)
    marker = document.getElementById('marker');
    infoWindow = document.getElementById('info-window');
    tooltip = document.getElementById('tooltip');
    if (!tooltip) console.error("Tooltip element not found!");


    // Setup event listeners for the globe SVG (dragging, zooming, tooltip)
    setupGlobeInteractionListeners();

    // Setup event listeners for controls INSIDE the panels and top bar
    setupPanelControlListeners();
    setupTopBarListeners();

    // Set initial theme based on config.nightMode
    applyTheme(config.nightMode);

    console.log("Base UI initialized.");
}

function setupGlobeInteractionListeners() {
    if (!svg) {
        console.error("SVG element not available for globe interaction listeners.");
        return;
    }
    // Mouse events for dragging
    svg.on('mousedown', handleMouseDown);
    svg.on('mousemove', handleDragMove);
    svg.on('mouseup', handleMouseUp);
    svg.on('mouseleave', handleMouseLeave);

    // Mouse events for tooltip
    svg.on('mousemove.tooltip', handleTooltipMove);
    svg.on('mouseout.tooltip', handleTooltipOut);

    // Touch events for dragging
    svg.on('touchstart', handleTouchStart, { passive: false });
    svg.on('touchmove', handleTouchMove, { passive: false });
    svg.on('touchend', handleTouchEnd);
    svg.on('touchcancel', handleTouchEnd);

    // Zoom events
    svg.on('wheel', handleWheel, { passive: false });
}

// Helper to apply theme colors
function applyTheme(isNight) {
    const theme = isNight ? config.themes.dark : config.themes.light;
    config.landColor = theme.landColor;
    config.oceanColor = theme.oceanColor;
    config.landStrokeColor = theme.landStrokeColor;
    console.log(`UI: Applied ${isNight ? 'Dark' : 'Light'} Theme`);

    document.body.classList.toggle('night-mode', isNight);
    document.body.classList.toggle('light-mode', !isNight);

    if (callbacks && callbacks.scheduleRender) {
        callbacks.scheduleRender(true); // Force render after theme change
    }
}

// Helper to add listeners to checkboxes/toggles and link to config
function setupToggle(elementId, configKey, renderOnChange = false, customCallback = null) {
    const element = document.getElementById(elementId);
    if (element) {
        if (config.hasOwnProperty(configKey)) {
            element.checked = config[configKey]; // Set initial state
            element.addEventListener('change', () => {
                const newValue = element.checked;
                config[configKey] = newValue;
                console.log(`UI Toggle: ${configKey} set to ${config[configKey]}`);

                if (customCallback) {
                    customCallback(newValue); // Execute custom logic
                }

                // Trigger render if flag is set AND no custom callback handles it
                if (renderOnChange && !customCallback && callbacks && callbacks.scheduleRender) {
                    callbacks.scheduleRender(true);
                }

                if (configKey === 'overlayType') { // Handle overlay visibility
                    updateOverlayControlsVisibility();
                }
            });
        } else {
            console.warn(`Config key '${configKey}' not found for toggle element '#${elementId}'. Hiding element.`);
            element.style.display = 'none';
            const parentContainer = element.closest('.layer-item, .option-item, .overlay-option-item');
            if (parentContainer) parentContainer.style.display = 'none';
        }
    } else {
        // console.warn(`Toggle element '#${elementId}' not found.`);
    }
    return element;
}


function setupPanelControlListeners() {
    console.log("Setting up panel control listeners...");

    // --- Search Panel ---
    const searchInput = document.querySelector('#search-panel input[type="text"]');
    if (searchInput) {
        searchInput.addEventListener('change', (event) => { /* ... Search logic ... */
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') { /* ... Search logic ... */
            }
        });
    } else console.warn("Search input not found in #search-panel");

    // --- Display Panel ---
    setupToggle('toggle-layer-airports', 'showAirports', true);
    setupToggle('toggle-layer-airspace', 'showAirspaces', true);
    setupToggle('toggle-night-mode', 'nightMode', false, applyTheme);
    setupToggle('toggle-moving-map', 'movingMap', false);
    setupToggle('show-graticule', 'showGraticule', true);
    setupToggle('outline-only', 'outlineOnly', true);

    // --- Overlays Panel ---
    const magVarToggle = document.getElementById('toggle-magvar-overlay');
    if (magVarToggle) {
        magVarToggle.checked = (config.overlayType === 'magvar');
        magVarToggle.addEventListener('change', () => {
            config.overlayType = magVarToggle.checked ? 'magvar' : 'none';
            console.log(`Overlay Type changed to: ${config.overlayType}`);
            updateOverlayControlsVisibility();
            callbacks.scheduleRender(true);
        });
    } else {
        console.warn("Overlay toggle '#toggle-magvar-overlay' not found.");
    }

    const modeButtons = {
        vector: document.getElementById('mode-vector'),
        isoline: document.getElementById('mode-isoline')
    };
    const updateModeButtons = (activeMode) => {
        for (const mode in modeButtons) {
            if (modeButtons[mode]) {
                modeButtons[mode].classList.toggle('active', mode === activeMode);
            }
        }
        updateOverlayControlsVisibility();
    };
    if (modeButtons[config.displayMode]) updateModeButtons(config.displayMode);
    for (const mode in modeButtons) {
        if (modeButtons[mode]) {
            modeButtons[mode].addEventListener('click', () => {
                config.displayMode = mode;
                updateModeButtons(mode);
                console.log(`Display Mode changed to: ${config.displayMode}`);
                callbacks.scheduleRender(true);
            });
        } else console.warn(`Mode button for '${mode}' not found.`);
    }

    const heightLevelSlider = document.getElementById('height-level');
    const heightValueSpan = document.getElementById('height-value');
    if (heightLevelSlider && heightValueSpan) {
        heightLevelSlider.max = config.maxAltitudeKm;
        heightLevelSlider.value = config.altitudeKm;
        heightValueSpan.textContent = `${config.altitudeKm} km`;
        heightLevelSlider.addEventListener('input', () => {
            config.altitudeKm = parseFloat(heightLevelSlider.value);
            heightValueSpan.textContent = `${config.altitudeKm} km`;
            if (callbacks.scheduleRender) {
                clearTimeout(appState.renderTimeout);
                appState.renderTimeout = setTimeout(() => callbacks.scheduleRender(true), 50);
            }
        });
    } else {
        if (!heightLevelSlider) console.warn("Slider 'height-level' not found.");
        if (!heightValueSpan) console.warn("Span 'height-value' not found.");
    }

    if (!config.hasOwnProperty('decimalYear') || config.decimalYear === null) {
        config.decimalYear = getCurrentDecimalYear();
    }
    const dateInput = document.getElementById('date-year');
    const dateValueSpan = document.getElementById('date-value');
    if (dateInput && dateValueSpan) {
        const currentYear = new Date().getFullYear();
        dateInput.min = Math.min(2020, Math.floor(config.decimalYear));
        dateInput.max = Math.max(currentYear + 5, Math.ceil(config.decimalYear));
        dateInput.step = 0.1;
        dateInput.value = config.decimalYear.toFixed(1);
        dateValueSpan.textContent = config.decimalYear.toFixed(1);
        dateInput.addEventListener('input', () => {
            config.decimalYear = parseFloat(dateInput.value);
            dateValueSpan.textContent = config.decimalYear.toFixed(1);
            if (callbacks.scheduleRender) {
                clearTimeout(appState.renderTimeout);
                appState.renderTimeout = setTimeout(() => callbacks.scheduleRender(true), 50);
            }
        });
    } else {
        if (!dateInput) console.warn("Input '#date-year' not found.");
        if (!dateValueSpan) console.warn("Span '#date-value' not found.");
    }

    const overlayOpacitySlider = document.getElementById('overlay-opacity');
    if (overlayOpacitySlider) {
        overlayOpacitySlider.value = config.overlayOpacity * 100;
        overlayOpacitySlider.addEventListener('input', () => {
            config.overlayOpacity = parseFloat(overlayOpacitySlider.value) / 100;
            if (overlayGroup) overlayGroup.style('opacity', config.overlayOpacity);
        });
    } else console.warn("Slider 'overlay-opacity' not found.");

    const vectorDensitySlider = document.getElementById('vector-density');
    if (vectorDensitySlider) {
        vectorDensitySlider.value = config.vectorDensity;
        vectorDensitySlider.addEventListener('input', () => {
            config.vectorDensity = parseFloat(vectorDensitySlider.value);
            if (callbacks.scheduleRender) {
                clearTimeout(appState.renderTimeout);
                appState.renderTimeout = setTimeout(() => callbacks.scheduleRender(true), 50);
            }
        });
    } else console.warn("Slider 'vector-density' not found.");

    const isolineSpacingSelect = document.getElementById('isoline-spacing');
    if (isolineSpacingSelect) {
        isolineSpacingSelect.value = config.isolineSpacing;
        isolineSpacingSelect.addEventListener('change', () => {
            config.isolineSpacing = isolineSpacingSelect.value;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Select 'isoline-spacing' not found.");

    updateOverlayControlsVisibility();

    // --- Views Panel ---
    const projectionSelect = document.getElementById('projection-select');
    if (projectionSelect) {
        projectionSelect.value = config.projection;
        projectionSelect.addEventListener('change', () => {
            config.projection = projectionSelect.value;
            callbacks.scheduleRender(true);
            if (callbacks.projectionChanged) callbacks.projectionChanged();
        });
    } else console.warn("Select 'projection-select' not found.");

    const rotationSpeedSlider = document.getElementById('rotation-speed');
    if (rotationSpeedSlider) {
        rotationSpeedSlider.value = config.rotationSpeed;
        rotationSpeedSlider.addEventListener('input', () => {
            const speed = parseFloat(rotationSpeedSlider.value);
            config.rotationSpeed = speed;
            if (callbacks.startStopAutoRotate) callbacks.startStopAutoRotate(speed > 0);
        });
        if (config.rotationSpeed > 0 && callbacks.startStopAutoRotate) {
            callbacks.startStopAutoRotate(true);
        }
    } else console.warn("Slider 'rotation-speed' not found.");

    const viewButtons = document.querySelectorAll('#views-panel .btn-group button');
    if (viewButtons.length > 0) {
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const view = button.id.replace('view-', '');
                const viewTargets = {
                    'atlantic': [-30, 30],
                    'pacific': [-170, 0],
                    'north-america': [-100, 40],
                    'south-america': [-60, -20],
                    'europe': [15, 50],
                    'africa': [20, 0],
                    'asia': [90, 40],
                    'australia': [135, -25]
                };
                if (viewTargets[view] && callbacks.navigateTo) {
                    callbacks.navigateTo(...viewTargets[view]);
                }
            });
        });
    } else console.warn("View buttons not found in #views-panel.");

    // --- Settings Panel ---
    const gridOpacitySlider = document.getElementById('grid-opacity');
    if (gridOpacitySlider) {
        gridOpacitySlider.value = config.graticuleOpacity * 100;
        gridOpacitySlider.addEventListener('input', () => {
            config.graticuleOpacity = parseFloat(gridOpacitySlider.value) / 100;
            if (callbacks.scheduleRender) {
                clearTimeout(appState.renderTimeout);
                appState.renderTimeout = setTimeout(() => callbacks.scheduleRender(true), 50);
            }
        });
    } else console.warn("Slider 'grid-opacity' not found.");

    const gridColorSelect = document.getElementById('grid-color');
    if (gridColorSelect) {
        gridColorSelect.value = config.graticuleColor;
        gridColorSelect.addEventListener('change', () => {
            config.graticuleColor = gridColorSelect.value;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Select 'grid-color' not found.");

    console.log("Panel control listeners setup complete.");
}


function updateOverlayControlsVisibility() {
    const showOverlayControls = config.overlayType !== 'none';
    const overlayOptionsSection = document.querySelector('#overlays-panel .menu-section:nth-child(2)');
    if (overlayOptionsSection) {
        overlayOptionsSection.style.display = showOverlayControls ? '' : 'none';
    }

    if (showOverlayControls) {
        const vectorDensityControl = document.getElementById('vector-density')?.closest('.overlay-option-item');
        const isolineSpacingControl = document.getElementById('isoline-spacing')?.closest('.overlay-option-item');

        if (vectorDensityControl) {
            vectorDensityControl.style.display = (config.displayMode === 'vector') ? '' : 'none';
        }
        if (isolineSpacingControl) {
            isolineSpacingControl.style.display = (config.displayMode === 'isoline') ? '' : 'none';
        }
    }
    const legend = document.getElementById('overlay-legend');
    if (legend) legend.classList.toggle('visible', showOverlayControls);
}


function setupTopBarListeners() {
    // ... (Top bar logic remains largely the same) ...
    console.log("Setting up top bar listeners...");
    const topBarButtons = document.querySelectorAll('#top-control-bar .top-bar-button:not(.square-button):not(.top-bar-toggle)');
    topBarButtons.forEach(button => {
        button.addEventListener('click', () => {
            const isActive = button.classList.contains('active');
            if (!isActive) {
                topBarButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    });
    // Ensure only one is active initially
    let activeFound = false;
    topBarButtons.forEach(button => {
        if (button.classList.contains('active')) {
            if (!activeFound) {
                activeFound = true;
            } else {
                button.classList.remove('active');
            }
        }
    });
    console.log("Top bar listeners setup complete.");
}

// --- Globe Interaction Handlers ---

function handleMouseDown(event) {
    if (event.button !== 0) return; // Only left click
    event.preventDefault();

    // Set isInteracting to true
    appState.isInteracting = true;

    isDragging = true;
    dragStartCoords = {x: event.clientX, y: event.clientY};
    dragStartRotation = [...appState.currentRotation];
    svg.style('cursor', 'grabbing');
    if (callbacks.startStopAutoRotate) callbacks.startStopAutoRotate(false);
    if (callbacks.startRotation) callbacks.startRotation();
    hideTooltip();

    // No need to force render here, it will be handled in the renderer
}

function handleDragMove(event) {
    if (!isDragging) return;
    event.preventDefault();

    const dx = event.clientX - dragStartCoords.x;
    const dy = event.clientY - dragStartCoords.y;

    // Calculate degrees per pixel based on current scale (radius)
    const radius = appState.currentScale;
    const degPerPixel = 360 / (2 * Math.PI * radius);

    const rotation = [...dragStartRotation];
    rotation[0] = dragStartRotation[0] + dx * degPerPixel; // Longitude
    rotation[1] = dragStartRotation[1] + dy * degPerPixel; // Latitude
    rotation[1] = Math.max(-90, Math.min(90, rotation[1])); // Clamp latitude

    if (callbacks.updateRotation) callbacks.updateRotation(rotation);
    if (callbacks.scheduleRender) callbacks.scheduleRender(false);
}

function handleMouseUp(event) {
    if (event.button !== 0) return;
    if (isDragging) {
        isDragging = false;
        svg.style('cursor', 'grab');
        if (config.autoRotate && config.rotationSpeed > 0 && callbacks.startStopAutoRotate) {
            callbacks.startStopAutoRotate(true);
        }
        if (callbacks.stopRotation) callbacks.stopRotation();

        // Set isInteracting to false and force a re-render
        appState.isInteracting = false;
        if (callbacks.scheduleRender) callbacks.scheduleRender(true);
    }
}

function handleMouseLeave() {
    if (isDragging) {
        isDragging = false;
        svg.style('cursor', 'default');
        if (config.autoRotate && config.rotationSpeed > 0 && callbacks.startStopAutoRotate) {
            // Optionally restart auto-rotate here if needed
            // callbacks.startStopAutoRotate(true);
        }
        if (callbacks.stopRotation) callbacks.stopRotation();

        // Set isInteracting to false and force a re-render
        appState.isInteracting = false;
        if (callbacks.scheduleRender) callbacks.scheduleRender(true);
    }
    hideTooltip();
}

function handleTouchStart(event) {
    if (event.touches.length === 1) {
        event.preventDefault();

        // Set isInteracting to true
        appState.isInteracting = true;

        isDragging = true;
        const touch = event.touches[0];
        dragStartCoords = {x: touch.clientX, y: touch.clientY};
        dragStartRotation = [...appState.currentRotation];
        if (callbacks.startStopAutoRotate) callbacks.startStopAutoRotate(false);
        if (callbacks.startRotation) callbacks.startRotation();
        hideTooltip();

        // No need to force render here, it will be handled in the renderer
    }
}

function handleTouchMove(event) {
    if (isDragging && event.touches.length === 1) {
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - dragStartCoords.x;
        const dy = touch.clientY - dragStartCoords.y;
        const sensitivityFactor = 1 / (appState.currentScale * 0.015);
        const effectiveSensitivity = Math.max(0.05, Math.min(1, config.sensitivity * sensitivityFactor));

        const rotation = [...dragStartRotation];
        rotation[0] = dragStartRotation[0] + dx * effectiveSensitivity;
        rotation[1] = dragStartRotation[1] - dy * effectiveSensitivity;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));

        if (callbacks.updateRotation) callbacks.updateRotation(rotation);
        if (callbacks.scheduleRender) callbacks.scheduleRender(false);
    }
}

function handleTouchEnd(event) {
    if (isDragging && event.touches.length === 0) {
        isDragging = false;
        if (config.autoRotate && config.rotationSpeed > 0 && callbacks.startStopAutoRotate) {
            callbacks.startStopAutoRotate(true);
        }
        if (callbacks.stopRotation) callbacks.stopRotation();

        // Set isInteracting to false and force a re-render
        appState.isInteracting = false;
        if (callbacks.scheduleRender) callbacks.scheduleRender(true);
    }
}

function handleWheel(event) {
    event.preventDefault();
    if (callbacks.startStopAutoRotate) callbacks.startStopAutoRotate(false);

    const scaleFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(config.minScale, Math.min(config.maxScale, appState.currentScale * scaleFactor));

    if (Math.abs(newScale - appState.currentScale) > 0.01) {
        if (callbacks.updateScale) callbacks.updateScale(newScale);
        if (callbacks.scheduleRender) callbacks.scheduleRender(true);
    }
}

// --- Tooltip Handlers ---
function handleTooltipMove(event) {
    if (isDragging || !tooltip) return;
    const [pointerX, pointerY] = d3.pointer(event, svg.node());
    clearTimeout(tooltipTimeout);

    tooltipTimeout = setTimeout(() => {
        if (!svg.node().contains(event.target)) {
            hideTooltip();
            return;
        }
        const coords = screenToLonLat(pointerX, pointerY, appState.currentScale, appState.currentRotation, config.width, config.height, config.projection);
        if (coords) {
            const [lon, lat] = coords;
            const formattedLon = lon.toFixed(2);
            const formattedLat = lat.toFixed(2);
            let tooltipContent = `Lon: ${formattedLon}°<br>Lat: ${formattedLat}°`;

            if (config.overlayType !== 'none') {
                const calculationYear = config.decimalYear || getCurrentDecimalYear();
                const overlayValue = getOverlayValue(lon, lat, config.altitudeKm, calculationYear, config.overlayType);
                if (overlayValue !== null && isFinite(overlayValue)) {
                    const overlayName = config.overlayType === 'magvar' ? 'MagVar' : config.overlayType;
                    tooltipContent += `<br>${overlayName}: ${formatOverlayValue(overlayValue, config.overlayType)}`;
                    tooltipContent += `<br><span class="tooltip-context">Alt: ${config.altitudeKm.toFixed(0)} km, Date: ${calculationYear.toFixed(1)}</span>`;
                } else if (overlayValue !== null) {
                    tooltipContent += `<br><span class="tooltip-context">Overlay: Error</span>`;
                }
            }
            tooltip.innerHTML = tooltipContent;
            tooltip.style.left = `${event.pageX + 15}px`;
            tooltip.style.top = `${event.pageY + 10}px`;
            tooltip.style.opacity = 1;
            tooltip.style.pointerEvents = 'auto';
        } else {
            hideTooltip();
        }
    }, 100);
}

function handleTooltipOut(event) {
    if (!svg.node().contains(event.relatedTarget)) {
        clearTimeout(tooltipTimeout);
        hideTooltip();
    }
}

function hideTooltip() {
    clearTimeout(tooltipTimeout);
    if (tooltip) {
        tooltip.style.opacity = 0;
        tooltip.style.pointerEvents = 'none';
    }
}