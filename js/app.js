// js/app.js
import { config } from './config.js';
import { loadAllData } from './data.js'; // updateDataSourceInfo is called within data.js now
import { initializeRenderer, renderGlobe } from './renderer.js';
import { initializeUI } from './ui.js';

// --- Constants ---
const ANIMATION_DURATION = 1500;
const NAVIGATION_DURATION = 1000;
const AUTOROTATE_INTERVAL = 50;
const INTRO_START_ROTATION = [-75, 25, 0];

// --- Application State ---
const appState = {
    currentScale: config.defaultScale,
    currentRotation: [...config.initialRotation],
    worldData: null,
    isAnimating: false,
    autoRotateTimer: null,
};

// --- DOM Elements ---
let svg, globeGroup, earthBoundary, overlayGroup, loadingText;

// --- Helper Functions ---

/**
 * Updates the application state with a new rotation.
 * @param {number[]} newRotation - The new rotation values [longitude, latitude, roll].
 */
function updateRotation(newRotation) {
    appState.currentRotation = newRotation;
}

/**
 * Updates the application state with a new scale.
 * @param {number} newScale - The new scale value.
 */
function updateScale(newScale) {
    appState.currentScale = newScale;
}

/**
 * Updates the application state with a new animating status.
 * @param {boolean} isAnimating - The new animating status.
 */
function updateAnimating(isAnimating) {
    appState.isAnimating = isAnimating;
}

/**
 * Updates the application state with a new autoRotateTimer.
 * @param {number} autoRotateTimer - The new autoRotateTimer.
 */
function updateAutoRotateTimer(autoRotateTimer) {
    appState.autoRotateTimer = autoRotateTimer;
}

/**
 * Normalizes a longitude value to be within the range of -180 to 180.
 * @param {number} lon - The longitude value to normalize.
 * @returns {number} The normalized longitude value.
 */
function normalizeLongitude(lon) {
    return (lon + 540) % 360 - 180;
}

// REMOVED: updateFooterTimestamp() - handled via About panel now

/**
 * Creates the SVG container and core groups for the globe.
 */
function setupSvg() {
    svg = d3.select('#globe')
        .append('svg')
        .attr('width', '100%') // Use 100% to fit container
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${config.width} ${config.height}`) // Use viewBox for scaling
        .attr('preserveAspectRatio', 'xMidYMid meet') // Maintain aspect ratio
        .attr('class', 'earth-viewer'); // Added class for styling

    globeGroup = svg.append('g')
        .attr('class', 'globe-group')
        .attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

    earthBoundary = globeGroup.append('ellipse')
        .attr('class', 'earth-boundary')
        .attr('rx', appState.currentScale)
        .attr('ry', appState.currentScale)
        .attr('fill', config.oceanColor);

    overlayGroup = globeGroup.append('g')
        .attr('class', 'overlay-visualization')
        .style('opacity', config.overlayOpacity);
}

/**
 * Displays a loading message on the screen.
 * @param {string} message - The message to display.
 * @param {boolean} isError - Whether the message is an error message.
 */
function showLoadingMessage(message, isError = false) {
    // Ensure SVG exists before trying to append
    if (!svg) {
        console.warn("SVG not ready for loading message.");
        return;
    }
    if (!loadingText) {
        loadingText = svg.append('text')
            .attr('class', 'loading-text') // Class for styling
            .attr('x', config.width / 2)
            .attr('y', config.height / 2)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em') // Vertical centering
            .attr('fill', isError ? '#ff8888' : config['--navigraph-text-primary'] || '#ffffff'); // Use CSS variable if possible
    }
    loadingText.text(message).attr('fill', isError ? '#ff8888' : config['--navigraph-text-primary'] || '#ffffff');
    loadingText.style('display', 'block');
}

/**
 * Hides the loading message from the screen.
 */
function hideLoadingMessage() {
    loadingText?.style('display', 'none');
}

/**
 * Schedules a render of the globe.
 * @param {boolean} forceRedraw - Whether to force a redraw, even during animations.
 */
let renderRequestId = null;
function scheduleRender(forceRedraw = false) {
    if (appState.isAnimating && !forceRedraw) return;

    if (renderRequestId) {
        cancelAnimationFrame(renderRequestId);
    }
    renderRequestId = requestAnimationFrame(() => {
        if (appState.worldData) {
            renderGlobe(appState.worldData, appState.currentScale, appState.currentRotation);
        }
        renderRequestId = null;
    });
}

/**
 * Starts the intro animation.
 */
function startIntroAnimation() {
    updateAnimating(true);

    d3.transition()
        .duration(ANIMATION_DURATION)
        .ease(d3.easeCubicInOut)
        .tween("rotate", () => {
            const r = d3.interpolate(INTRO_START_ROTATION, config.initialRotation);
            return (t) => {
                // Check if tween is still valid (might be interrupted)
                if (!appState.isAnimating) return;
                updateRotation(r(t));
                scheduleRender(true); // Force render during animation tween
            };
        })
        .on("end", () => {
            updateAnimating(false);
            // Re-render one last time to ensure final state
            scheduleRender(true);
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
        })
        .on("interrupt", () => {
            // Ensure animating flag is false if interrupted
            updateAnimating(false);
            // Re-render to reflect the interrupted state
            scheduleRender(true);
        });
}


/**
 * Navigates to a specific longitude and latitude.
 * @param {number} targetLon - The target longitude.
 * @param {number} targetLat - The target latitude.
 */
function navigateTo(targetLon, targetLat) {
    if (appState.isAnimating) return;
    startStopAutoRotate(false); // Stop rotation during navigation

    const currentProj = config.projection; // Get current projection
    const startRotation = [...appState.currentRotation];

    // Normalize target longitude
    const normTargetLon = normalizeLongitude(targetLon);

    // For non-orthographic views, rotation might behave differently.
    // Simple approach: Just set rotation directly for 2D maps?
    // Or tween longitude only? Let's stick with the 3D-like tween for consistency.

    // Calculate shortest path for longitude
    let deltaLon = normTargetLon - startRotation[0];
    if (deltaLon > 180) deltaLon -= 360;
    if (deltaLon < -180) deltaLon += 360;

    const targetRotation = [startRotation[0] + deltaLon, targetLat, startRotation[2]]; // Keep roll

    updateAnimating(true);

    d3.transition()
        .duration(NAVIGATION_DURATION)
        .ease(d3.easeCubicInOut)
        .tween("navigate", () => {
            const rInterpolate = d3.interpolate(startRotation, targetRotation);
            return (t) => {
                if (!appState.isAnimating) return; // Check if interrupted
                const current = rInterpolate(t);
                // Normalize longitude during interpolation
                current[0] = normalizeLongitude(current[0]);
                updateRotation(current);
                scheduleRender(true); // Force render during animation
            };
        })
        .on("end", () => {
            updateAnimating(false);
            // Ensure final rotation is exactly the target (normalized)
            updateRotation([normTargetLon, targetLat, startRotation[2]]);
            scheduleRender(true); // Render final state
            if (config.rotationSpeed > 0) startStopAutoRotate(true); // Restart autorotate if needed
        })
        .on("interrupt", () => {
            updateAnimating(false);
            scheduleRender(true); // Render interrupted state
            if (config.rotationSpeed > 0) startStopAutoRotate(true); // Restart autorotate if needed
        });
}


/**
 * Starts or stops the auto-rotation of the globe.
 * @param {boolean} start - Whether to start or stop auto-rotation.
 */
function startStopAutoRotate(start) {
    if (appState.autoRotateTimer) {
        clearInterval(appState.autoRotateTimer);
        updateAutoRotateTimer(null);
    }

    // Update config state based on request and speed setting
    config.autoRotate = start && config.rotationSpeed > 0;

    if (!config.autoRotate) {
        // console.log("Auto-rotate stopped.");
        return;
    }

    // console.log(`Auto-rotate starting with speed: ${config.rotationSpeed}`);
    updateAutoRotateTimer(setInterval(() => {
        // Double-check conditions inside interval
        if (appState.isAnimating || !config.autoRotate || config.rotationSpeed <= 0) {
            // Stop interval if conditions aren't met anymore
            if (appState.autoRotateTimer) {
                clearInterval(appState.autoRotateTimer);
                updateAutoRotateTimer(null);
                // console.log("Auto-rotate stopped by interval check.");
            }
            return;
        }

        const rotation = [...appState.currentRotation];
        const speedFactor = config.rotationSpeed / 50; // Adjust speed scaling if needed

        rotation[0] += speedFactor;
        rotation[0] = normalizeLongitude(rotation[0]); // Keep longitude in range

        updateRotation(rotation);
        scheduleRender(false); // Regular render is sufficient
    }, AUTOROTATE_INTERVAL));
}

/**
 * Adjusts globe size and projection center on window resize.
 */
function handleResize() {
    // Update config dimensions (might not be strictly needed if using SVG viewBox)
    config.width = window.innerWidth - 60; // Adjust for sidebar
    config.height = window.innerHeight;

    if (svg) {
        // Update SVG viewbox if its size changes relative to window
        // The '100%' width/height with viewBox should handle most cases,
        // but explicit update might be needed for complex scenarios.
        // svg.attr('viewBox', `0 0 ${config.width} ${config.height}`); // Re-apply viewBox

        // Recenter the globe group within the new SVG size/viewBox
        // Center calculation needs config.width/height which represent the *viewBox* dimensions
        globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

        // Re-render the globe with potentially new dimensions affecting projection
        scheduleRender(true);
    }
}


/**
 * Initializes the application.
 */
function init() {
    console.log("Initializing WGS84 Globe...");

    // Initial resize calculation
    config.width = window.innerWidth - 60; // Account for fixed sidebar
    config.height = window.innerHeight;

    setupSvg(); // Setup SVG first
    showLoadingMessage('Loading Earth Data...'); // Show loading message on SVG

    initializeRenderer(svg, globeGroup, earthBoundary, overlayGroup);

    // Initialize UI controls (event listeners for buttons, sliders etc. inside panels)
    initializeUI(svg, appState, {
        scheduleRender,
        navigateTo,
        updateRotation,
        updateScale,
        startStopAutoRotate
    });

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Load data
    loadAllData()
        .then(loadedWorldData => {
            if (loadedWorldData) {
                appState.worldData = loadedWorldData;
                hideLoadingMessage();
                scheduleRender(true); // Initial render
                startIntroAnimation(); // Start animation after initial render
            } else {
                throw new Error("World data loading failed or returned empty.");
            }
        })
        .catch(error => {
            console.error("Failed to initialize application:", error);
            hideLoadingMessage(); // Hide 'Loading...' message
            showLoadingMessage('Error loading data. Please refresh.', true); // Show error
        });
}

// --- Start Application ---
document.addEventListener('DOMContentLoaded', init);