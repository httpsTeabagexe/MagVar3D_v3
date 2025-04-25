// js/app.js
import { config } from './config.js';
import { loadAllData, dataAvailable } from './data.js'; // Import dataAvailable
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
    // No longer store worldData directly here, renderer selects based on scale
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
    if (!svg) {
        console.warn("SVG not ready for loading message.");
        return;
    }
    if (!loadingText) {
        loadingText = svg.append('text')
            .attr('class', 'loading-text')
            .attr('x', config.width / 2)
            .attr('y', config.height / 2)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', isError ? '#ff8888' : config['--navigraph-text-primary'] || '#ffffff');
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
        // Check if at least low-res land data is available before rendering
        if (dataAvailable.landLowRes) {
            // Pass scale and rotation, renderer selects data internally
            renderGlobe(appState.currentScale, appState.currentRotation);
        } else {
            console.warn("Attempted to render before land data was available.");
            // Optionally show a message or render a blank state
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
                if (!appState.isAnimating) return;
                updateRotation(r(t));
                scheduleRender(true); // Force render during animation
            };
        })
        .on("end", () => {
            updateAnimating(false);
            scheduleRender(true); // Final render
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
        })
        .on("interrupt", () => {
            updateAnimating(false);
            scheduleRender(true); // Render interrupted state
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

    const startRotation = [...appState.currentRotation];
    const normTargetLon = normalizeLongitude(targetLon);
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
                if (!appState.isAnimating) return;
                const current = rInterpolate(t);
                current[0] = normalizeLongitude(current[0]);
                updateRotation(current);
                scheduleRender(true); // Force render during animation
            };
        })
        .on("end", () => {
            updateAnimating(false);
            updateRotation([normTargetLon, targetLat, startRotation[2]]);
            scheduleRender(true); // Final render
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
        })
        .on("interrupt", () => {
            updateAnimating(false);
            scheduleRender(true); // Render interrupted state
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
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

    config.autoRotate = start && config.rotationSpeed > 0;

    if (!config.autoRotate) {
        return;
    }

    updateAutoRotateTimer(setInterval(() => {
        if (appState.isAnimating || !config.autoRotate || config.rotationSpeed <= 0) {
            if (appState.autoRotateTimer) {
                clearInterval(appState.autoRotateTimer);
                updateAutoRotateTimer(null);
            }
            return;
        }

        const rotation = [...appState.currentRotation];
        const speedFactor = config.rotationSpeed / 50;
        rotation[0] += speedFactor;
        rotation[0] = normalizeLongitude(rotation[0]);
        updateRotation(rotation);
        scheduleRender(false); // No need to force render
    }, AUTOROTATE_INTERVAL));
}

/**
 * Adjusts globe size and projection center on window resize.
 */
function handleResize() {
    config.width = window.innerWidth - 60; // Adjust for sidebar
    config.height = window.innerHeight;

    if (svg) {
        // Update SVG viewbox to reflect new aspect ratio
        svg.attr('viewBox', `0 0 ${config.width} ${config.height}`);
        // Recenter the globe group
        globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);
        // Re-render the globe
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
    showLoadingMessage('Loading Earth Data...'); // Show loading message

    initializeRenderer(svg, globeGroup, earthBoundary, overlayGroup);

    // Pass the correct callbacks, including those needed by zoom/drag
    initializeUI(svg, appState, {
        scheduleRender,
        navigateTo,
        updateRotation,
        updateScale, // Pass updateScale for zoom handler
        startStopAutoRotate
    });

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Load data
    loadAllData()
        .then(initialDataAvailable => {
            // loadAllData now returns a boolean indicating if low-res land is loaded
            if (initialDataAvailable) {
                hideLoadingMessage();
                scheduleRender(true); // Initial render uses low-res data
                startIntroAnimation(); // Start animation
            } else {
                throw new Error("Essential low-resolution land data failed to load.");
            }
        })
        .catch(error => {
            console.error("Failed to initialize application:", error);
            hideLoadingMessage();
            showLoadingMessage('Error loading data. Please refresh.', true);
        });
}

// --- Start Application ---
document.addEventListener('DOMContentLoaded', init);
