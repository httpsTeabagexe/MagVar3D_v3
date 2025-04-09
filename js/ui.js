// js/ui.js
import { config } from './config.js';
import { screenToLonLat } from './wgs84.js'; // Assuming screenToLonLat handles projections correctly
import { formatOverlayValue, getOverlayValue } from './overlayUtils.js'; // For tooltip data

let svg, appState, callbacks;
let isDragging = false;
let dragStartCoords = { x: 0, y: 0 };
let dragStartRotation = [0, 0, 0];
let tooltipTimeout = null; // To delay tooltip appearance

let marker, infoWindow, tooltip;

export function initializeUI(_svg, _appState, _callbacks) {
    svg = _svg;
    appState = _appState;
    callbacks = _callbacks;

    // Initialize UI elements (Tooltip, Marker - unrelated to sidebar)
    marker = document.getElementById('marker');
    infoWindow = document.getElementById('info-window');
    tooltip = document.getElementById('tooltip');
    if (!tooltip) console.error("Tooltip element not found!");


    // Setup event listeners for the globe SVG (dragging, zooming, tooltip)
    setupGlobeInteractionListeners();

    // Setup event listeners for controls INSIDE the panels
    setupPanelControlListeners();

    console.log("Base UI initialized.");
}

function setupGlobeInteractionListeners() {
    if (!svg) {
        console.error("SVG element not available for globe interaction listeners.");
        return;
    }
    // Mouse events for dragging
    svg.on('mousedown', handleMouseDown);
    svg.on('mousemove', handleDragMove); // Renamed for clarity
    svg.on('mouseup', handleMouseUp);
    svg.on('mouseleave', handleMouseLeave); // Use mouseleave to stop drag if pointer leaves SVG

    // Mouse events for tooltip
    svg.on('mousemove.tooltip', handleTooltipMove); // Use namespaced event
    svg.on('mouseout.tooltip', handleTooltipOut); // Use namespaced event

    // Touch events for dragging
    svg.on('touchstart', handleTouchStart, { passive: false }); // passive:false to allow preventDefault
    svg.on('touchmove', handleTouchMove, { passive: false }); // passive:false to allow preventDefault
    svg.on('touchend', handleTouchEnd);
    svg.on('touchcancel', handleTouchEnd);

    // Zoom events
    svg.on('wheel', handleWheel, { passive: false }); // passive:false to allow preventDefault
}


function setupPanelControlListeners() {
    console.log("Setting up panel control listeners...");

    // --- Display Panel Controls ---
    const showGraticuleCheckbox = document.getElementById('show-graticule');
    if (showGraticuleCheckbox) {
        showGraticuleCheckbox.checked = config.showGraticule; // Set initial state
        showGraticuleCheckbox.addEventListener('change', () => {
            config.showGraticule = showGraticuleCheckbox.checked;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Checkbox 'show-graticule' not found.");

    const showGridDotsCheckbox = document.getElementById('show-grid-dots');
    if (showGridDotsCheckbox) {
        showGridDotsCheckbox.checked = config.showGridDots;
        showGridDotsCheckbox.addEventListener('change', () => {
            config.showGridDots = showGridDotsCheckbox.checked;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Checkbox 'show-grid-dots' not found.");

    const outlineOnlyCheckbox = document.getElementById('outline-only');
    if (outlineOnlyCheckbox) {
        outlineOnlyCheckbox.checked = config.outlineOnly;
        outlineOnlyCheckbox.addEventListener('change', () => {
            config.outlineOnly = outlineOnlyCheckbox.checked;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Checkbox 'outline-only' not found.");

    const showLabelsCheckbox = document.getElementById('show-labels');
    if (showLabelsCheckbox) {
        showLabelsCheckbox.checked = config.showLabels;
        showLabelsCheckbox.addEventListener('change', () => {
            config.showLabels = showLabelsCheckbox.checked;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Checkbox 'show-labels' not found.");


    const projectionSelect = document.getElementById('projection-select');
    if (projectionSelect) {
        projectionSelect.value = config.projection;
        projectionSelect.addEventListener('change', () => {
            config.projection = projectionSelect.value;
            callbacks.scheduleRender(true); // Force redraw needed for projection change
        });
    } else console.warn("Select 'projection-select' not found.");


    const rotationSpeedSlider = document.getElementById('rotation-speed');
    if (rotationSpeedSlider) {
        rotationSpeedSlider.value = config.rotationSpeed;
        rotationSpeedSlider.addEventListener('input', () => {
            config.rotationSpeed = parseFloat(rotationSpeedSlider.value);
            // Only start/stop if the control initiated the change
            callbacks.startStopAutoRotate(config.rotationSpeed > 0);
        });
    } else console.warn("Slider 'rotation-speed' not found.");

    const gridOpacitySlider = document.getElementById('grid-opacity');
    if(gridOpacitySlider) {
        gridOpacitySlider.value = config.graticuleOpacity * 100;
        gridOpacitySlider.addEventListener('input', () => {
            config.graticuleOpacity = parseFloat(gridOpacitySlider.value) / 100;
            callbacks.scheduleRender(true); // Redraw needed
        });
    } else console.warn("Slider 'grid-opacity' not found.");

    const gridColorSelect = document.getElementById('grid-color');
    if(gridColorSelect) {
        gridColorSelect.value = config.graticuleColor;
        gridColorSelect.addEventListener('change', () => {
            config.graticuleColor = gridColorSelect.value;
            callbacks.scheduleRender(true); // Redraw needed
        });
    } else console.warn("Select 'grid-color' not found.");


    // --- Views Panel Controls ---
    const viewButtons = document.querySelectorAll('#views-panel .btn-group button');
    if (viewButtons.length > 0) {
        viewButtons.forEach(button => {
            button.addEventListener('click', () => {
                const view = button.id.replace('view-', '');
                // Use a map for cleaner navigation targets
                const viewTargets = {
                    'atlantic': [-30, 30], 'pacific': [-170, 0], // Adjusted Pacific to be less on edge
                    'north-america': [-100, 40], 'south-america': [-60, -20],
                    'europe': [15, 50], 'africa': [20, 0],
                    'asia': [90, 40], 'australia': [135, -25] // Adjusted Asia center
                };
                if (viewTargets[view]) {
                    callbacks.navigateTo(...viewTargets[view]);
                }
            });
        });
    } else console.warn("View buttons not found in #views-panel.");


    // --- Overlays Panel Controls ---
    const overlayTypeSelect = document.getElementById('overlay-type');
    if (overlayTypeSelect) {
        overlayTypeSelect.value = config.overlayType;
        overlayTypeSelect.addEventListener('change', () => {
            config.overlayType = overlayTypeSelect.value;
            callbacks.scheduleRender(true);
        });
    } else console.warn("Select 'overlay-type' not found.");

    // Display mode buttons
    const modeButtons = {
        gradient: document.getElementById('mode-gradient'),
        vector: document.getElementById('mode-vector'),
        isoline: document.getElementById('mode-isoline')
    };
    // Function to update active state for mode buttons
    const updateModeButtons = (activeMode) => {
        for (const mode in modeButtons) {
            if (modeButtons[mode]) {
                modeButtons[mode].classList.toggle('active', mode === activeMode);
            }
        }
    };
    // Set initial active button
    if (modeButtons[config.displayMode]) updateModeButtons(config.displayMode);
    // Add listeners
    for (const mode in modeButtons) {
        if (modeButtons[mode]) {
            modeButtons[mode].addEventListener('click', () => {
                config.displayMode = mode;
                updateModeButtons(mode);
                callbacks.scheduleRender(true);
            });
        } else console.warn(`Mode button for '${mode}' not found.`);
    }

    const heightLevelSlider = document.getElementById('height-level');
    const heightValueSpan = document.getElementById('height-value');
    if (heightLevelSlider && heightValueSpan) {
        heightLevelSlider.value = config.altitudeKm;
        heightValueSpan.textContent = `${config.altitudeKm} km`; // Set initial text
        heightLevelSlider.addEventListener('input', () => {
            config.altitudeKm = parseFloat(heightLevelSlider.value);
            heightValueSpan.textContent = `${config.altitudeKm} km`;
            callbacks.scheduleRender(true);
        });
    } else {
        if(!heightLevelSlider) console.warn("Slider 'height-level' not found.");
        if(!heightValueSpan) console.warn("Span 'height-value' not found.");
    }

    const overlayOpacitySlider = document.getElementById('overlay-opacity');
    if(overlayOpacitySlider) {
        overlayOpacitySlider.value = config.overlayOpacity * 100;
        overlayOpacitySlider.addEventListener('input', () => {
            config.overlayOpacity = parseFloat(overlayOpacitySlider.value) / 100;
            // Note: Opacity is handled directly on the overlay group in renderer,
            // but scheduleRender ensures it redraws with the new config value used.
            callbacks.scheduleRender(true);
        });
    } else console.warn("Slider 'overlay-opacity' not found.");

    const vectorDensitySlider = document.getElementById('vector-density');
    if(vectorDensitySlider) {
        vectorDensitySlider.value = config.vectorDensity;
        vectorDensitySlider.addEventListener('input', () => {
            config.vectorDensity = parseFloat(vectorDensitySlider.value);
            callbacks.scheduleRender(true); // Redraw needed for vector overlay
        });
    } else console.warn("Slider 'vector-density' not found.");

    const isolineSpacingSelect = document.getElementById('isoline-spacing');
    if(isolineSpacingSelect) {
        isolineSpacingSelect.value = config.isolineSpacing;
        isolineSpacingSelect.addEventListener('change', () => {
            config.isolineSpacing = isolineSpacingSelect.value;
            callbacks.scheduleRender(true); // Redraw needed for isoline overlay
        });
    } else console.warn("Select 'isoline-spacing' not found.");


    // --- Settings Panel Controls ---
    const colorOptions = document.querySelectorAll('#settings-panel .color-option');
    if (colorOptions.length > 0) {
        // Function to update selected state for color options
        const updateColorSelection = (type, color) => {
            colorOptions.forEach(opt => {
                const parentLabel = opt.parentElement?.querySelector('span:first-child')?.textContent || '';
                if ((type === 'land' && parentLabel === 'Land:') || (type === 'ocean' && parentLabel === 'Ocean:')) {
                    opt.classList.toggle('selected', opt.dataset.color === color);
                }
            });
        };
        // Set initial selected state
        updateColorSelection('land', config.landColor);
        updateColorSelection('ocean', config.oceanColor);
        // Add listeners
        colorOptions.forEach(option => {
            option.addEventListener('click', () => {
                const color = option.dataset.color;
                const parentLabel = option.parentElement?.querySelector('span:first-child')?.textContent || '';
                if (color) {
                    if (parentLabel === 'Land:') {
                        config.landColor = color;
                        updateColorSelection('land', color);
                    } else if (parentLabel === 'Ocean:') {
                        config.oceanColor = color;
                        updateColorSelection('ocean', color);
                    }
                    callbacks.scheduleRender(true); // Force redraw
                }
            });
        });
    } else console.warn("Color options not found in #settings-panel.");

    // Add listeners for any other controls in Settings panel if needed...

    console.log("Panel control listeners setup complete.");
}


// --- Globe Interaction Handlers ---

function handleMouseDown(event) {
    if (event.button !== 0) return; // Only handle left clicks for drag
    event.preventDefault(); // Prevent text selection during drag
    isDragging = true;
    // Use clientX/Y for consistency across mouse/touch
    dragStartCoords = { x: event.clientX, y: event.clientY };
    dragStartRotation = [...appState.currentRotation]; // Store rotation at drag start
    svg.style('cursor', 'grabbing'); // Change cursor
    callbacks.startStopAutoRotate(false); // Stop autorotate on interaction
    hideTooltip(); // Hide tooltip during drag
}

function handleDragMove(event) {
    if (!isDragging) return;
    event.preventDefault();

    // Calculate delta from the drag start coordinates
    const dx = event.clientX - dragStartCoords.x;
    const dy = event.clientY - dragStartCoords.y;

    // Calculate new rotation based on delta from START rotation
    const rotation = [...dragStartRotation]; // Start from rotation when drag began

    // Adjust sensitivity - maybe needs tweaking
    const sensitivityFactor = (config.projection === 'orthographic') ? (1 / (appState.currentScale * 0.01)) : (1 / (appState.currentScale * 0.02)); // Less sensitive for flat maps?
    const effectiveSensitivity = Math.max(0.1, config.sensitivity * sensitivityFactor); // Clamp sensitivity

    rotation[0] = dragStartRotation[0] + dx / effectiveSensitivity; // Longitude rotates around Y axis
    rotation[1] = dragStartRotation[1] - dy / effectiveSensitivity; // Latitude rotates around X axis (inverted Y)

    // Clamp latitude to avoid flipping over poles
    rotation[1] = Math.max(-90, Math.min(90, rotation[1]));

    // Normalize longitude
    rotation[0] = (rotation[0] + 540) % 360 - 180;

    callbacks.updateRotation(rotation);
    callbacks.scheduleRender(); // Render frequently during drag
}


function handleMouseUp(event) {
    if (event.button !== 0) return; // Only handle left clicks
    if (isDragging) {
        isDragging = false;
        svg.style('cursor', 'grab'); // Restore cursor
        // Consider restarting autorotate if it was on before
        if (config.rotationSpeed > 0) {
            // Optional: Add a small delay before restarting autorotation
            // setTimeout(() => callbacks.startStopAutoRotate(true), 500);
        }
        callbacks.scheduleRender(true); // Ensure final state is rendered cleanly
    }
}

function handleMouseLeave() {
    // If mouse leaves SVG while dragging, treat it as mouse up
    if (isDragging) {
        isDragging = false;
        svg.style('cursor', 'default'); // Or 'grab' if you prefer
        if (config.rotationSpeed > 0) {
            // callbacks.startStopAutoRotate(true);
        }
        callbacks.scheduleRender(true);
    }
    hideTooltip(); // Also hide tooltip when mouse leaves SVG
}

function handleTouchStart(event) {
    if (event.touches.length === 1) {
        event.preventDefault(); // Prevent page scroll/zoom etc.
        isDragging = true;
        const touch = event.touches[0];
        dragStartCoords = { x: touch.clientX, y: touch.clientY };
        dragStartRotation = [...appState.currentRotation];
        callbacks.startStopAutoRotate(false);
        hideTooltip();
    }
    // Handle pinch-zoom later if needed
}

function handleTouchMove(event) {
    if (isDragging && event.touches.length === 1) {
        event.preventDefault();
        const touch = event.touches[0];
        const dx = touch.clientX - dragStartCoords.x;
        const dy = touch.clientY - dragStartCoords.y;

        const rotation = [...dragStartRotation];
        const sensitivityFactor = (config.projection === 'orthographic') ? (1 / (appState.currentScale * 0.01)) : (1 / (appState.currentScale * 0.02));
        const effectiveSensitivity = Math.max(0.1, config.sensitivity * sensitivityFactor);

        rotation[0] = dragStartRotation[0] + dx / effectiveSensitivity;
        rotation[1] = dragStartRotation[1] - dy / effectiveSensitivity;
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]));
        rotation[0] = (rotation[0] + 540) % 360 - 180;

        callbacks.updateRotation(rotation);
        callbacks.scheduleRender();
    }
}

function handleTouchEnd(event) {
    // If last touch ends
    if (event.touches.length === 0 && isDragging) {
        isDragging = false;
        if (config.rotationSpeed > 0) {
            // callbacks.startStopAutoRotate(true);
        }
        callbacks.scheduleRender(true);
    }
}

function handleWheel(event) {
    event.preventDefault(); // Prevent page scroll
    callbacks.startStopAutoRotate(false); // Stop autorotate on interaction

    // Determine zoom factor (adjust multiplier for sensitivity)
    const scaleFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15; // Faster zoom?

    // Calculate new scale, clamped
    const newScale = Math.max(config.minScale, Math.min(config.maxScale, appState.currentScale * scaleFactor));

    // Simple zoom towards center for now
    if (Math.abs(newScale - appState.currentScale) > 0.1) { // Only update if scale actually changes noticeably
        callbacks.updateScale(newScale);
        callbacks.scheduleRender(); // Re-render needed after zoom
    }
}

// --- Tooltip Handlers ---
function handleTooltipMove(event) {
    if (isDragging || !tooltip) return; // Don't show tooltip while dragging

    const [pointerX, pointerY] = d3.pointer(event, svg.node()); // Get pointer relative to SVG

    // Debounce tooltip update / Add delay
    clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        // Convert screen coords to lon/lat AFTER delay
        const coords = screenToLonLat(pointerX, pointerY, appState.currentScale, appState.currentRotation, config.width, config.height);

        if (coords) {
            const [lon, lat] = coords;
            const formattedLon = lon.toFixed(2);
            const formattedLat = lat.toFixed(2);
            let tooltipContent = `Lon: ${formattedLon}°<br>Lat: ${formattedLat}°`;

            // Add overlay data if applicable
            if (config.overlayType !== 'none') {
                const overlayValue = getOverlayValue(lon, lat, config.altitudeKm, config.overlayType);
                if (overlayValue !== null) {
                    tooltipContent += `<br>${config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1)}: ${formatOverlayValue(overlayValue, config.overlayType)}`;
                }
            }

            tooltip.innerHTML = tooltipContent; // Use innerHTML to render <br>
            // Position tooltip relative to page, not SVG
            tooltip.style.left = `${event.pageX + 15}px`;
            tooltip.style.top = `${event.pageY + 10}px`;
            tooltip.style.opacity = 1;
            tooltip.style.pointerEvents = 'auto'; // Allow interaction if needed (usually not)

        } else {
            hideTooltip(); // Hide if pointer is off the globe
        }
    }, 100); // 100ms delay before showing/updating tooltip
}


function handleTooltipOut() {
    clearTimeout(tooltipTimeout); // Clear any pending tooltip update
    hideTooltip();
}

function hideTooltip() {
    if (tooltip) {
        tooltip.style.opacity = 0;
        tooltip.style.pointerEvents = 'none'; // Prevent ghost interactions
    }
}

// --- REMOVED setupMenu(), setupSettingsPanel() ---
// Logic moved into setupPanelControlListeners()