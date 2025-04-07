// js/app.js
import { config } from './config.js';
import { loadAllData } from './data.js';
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

/**
 * Updates the footer timestamp with the data source timestamp.
 */
function updateFooterTimestamp() {
    const footer = document.querySelector('footer');
    if (footer) {
        footer.textContent = `Created for httpsTeabagexe | ${config.dataSourceTimestamp}`;
    }
}

/**
 * Creates the SVG container and core groups for the globe.
 */
function setupSvg() {
    svg = d3.select('#globe')
        .append('svg')
        .attr('width', config.width)
        .attr('height', config.height)
        .attr('class', 'earth-viewer');

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
    if (!loadingText) {
        loadingText = svg.append('text')
            .attr('class', 'loading-text')
            .attr('x', config.width / 2)
            .attr('y', config.height / 2)
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', isError ? '#ff8888' : '#ffffff');
    }
    loadingText.text(message).attr('fill', isError ? '#ff8888' : '#ffffff');
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
                if (!appState.isAnimating) return;
                updateRotation(r(t));
                scheduleRender(true);
            };
        })
        .on("end", () => {
            updateAnimating(false);
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
        })
        .on("interrupt", () => {
            updateAnimating(false);
        });
}

/**
 * Navigates to a specific longitude and latitude.
 * @param {number} targetLon - The target longitude.
 * @param {number} targetLat - The target latitude.
 */
function navigateTo(targetLon, targetLat) {
    if (appState.isAnimating) return;
    startStopAutoRotate(false);

    const startRotation = [...appState.currentRotation];
    const targetRotation = [targetLon, targetLat, 0];

    let deltaLon = targetRotation[0] - startRotation[0];
    if (deltaLon > 180) deltaLon -= 360;
    if (deltaLon < -180) deltaLon += 360;

    updateAnimating(true);

    d3.transition()
        .duration(NAVIGATION_DURATION)
        .ease(d3.easeCubicInOut)
        .tween("navigate", () => {
            const r = d3.interpolate(startRotation, [startRotation[0] + deltaLon, targetRotation[1], targetRotation[2]]);
            return (t) => {
                if (!appState.isAnimating) return;
                const current = r(t);
                current[0] = normalizeLongitude(current[0]);
                updateRotation(current);
                scheduleRender(true);
            };
        })
        .on("end", () => {
            updateAnimating(false);
            updateRotation([normalizeLongitude(targetRotation[0]), targetRotation[1], targetRotation[2]]);
            scheduleRender(true);
        })
        .on("interrupt", () => {
            updateAnimating(false);
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

    if (!config.autoRotate) return;

    updateAutoRotateTimer(setInterval(() => {
        if (appState.isAnimating || !config.autoRotate) return;

        const rotation = [...appState.currentRotation];
        const speedFactor = config.rotationSpeed / 50;

        rotation[0] += speedFactor;
        rotation[0] = normalizeLongitude(rotation[0]);

        updateRotation(rotation);
        scheduleRender(false);
    }, AUTOROTATE_INTERVAL));
}

/**
 * Initializes the application.
 */
function init() {
    console.log("Initializing WGS84 Globe...");

    setupSvg();
    showLoadingMessage('Loading Earth Data...');

    initializeRenderer(svg, globeGroup, earthBoundary, overlayGroup);

    // Corrected callback names here
    initializeUI(svg, appState, {
        scheduleRender, // Pass scheduleRender as scheduleRender
        navigateTo,
        updateRotation,
        updateScale,
        startStopAutoRotate
    });

    loadAllData()
        .then(loadedWorldData => {
            appState.worldData = loadedWorldData;
            hideLoadingMessage();
            scheduleRender(true);
            startIntroAnimation();
            updateFooterTimestamp();
        })
        .catch(error => {
            console.error("Failed to initialize application:", error);
            showLoadingMessage('Error loading data. Please refresh.', true);
        });
}

// --- Start Application ---
document.addEventListener('DOMContentLoaded', init);