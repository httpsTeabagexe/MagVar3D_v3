// js/app.js
import { config } from './config.js';
import { loadAllData, worldData } from './data.js';
import { initializeRenderer, renderGlobe } from './renderer.js';
import { initializeUI } from './ui.js';
import { applyProjection } from './wgs84.js'; // Needed for initial animation/navigation

// --- Application State ---
const appState = {
    currentScale: config.defaultScale,
    currentRotation: [...config.initialRotation], // Use initialRotation from config
    worldData: null, // Will be loaded by data.js
    isAnimating: false, // Flag for navigation/initial animation
    autoRotateTimer: null,
};

// --- DOM Elements ---
let svg, globeGroup, earthBoundary, overlayGroup, loadingText;

// --- Initialization ---

function init() {
    console.log("Initializing WGS84 Globe...");

    // Create SVG and core groups
    createSvgContainer();

    // Show loading indicator
    showLoadingMessage('Loading Earth Data...');

    // Initialize Renderer
    initializeRenderer(svg, globeGroup, earthBoundary, overlayGroup);

    // Initialize UI (pass state and callbacks)
    initializeUI(svg, appState, {
        triggerRender,
        navigateTo,
        setRotation,
        setScale,
        startStopAutoRotate
    });

    // Load data and then render
    loadAllData()
        .then(loadedWorldData => {
            appState.worldData = loadedWorldData; // Store loaded data in state
            hideLoadingMessage();
            triggerRender(true); // Initial render
            animateIn();         // Start intro animation
            updateFooterTimestamp(); // Update footer
        })
        .catch(error => {
            console.error("Failed to initialize application:", error);
            showLoadingMessage('Error loading data. Please refresh.', true);
        });
}

// --- SVG Setup ---

function createSvgContainer() {
    svg = d3.select('#globe')
        .append('svg')
        .attr('width', config.width)
        .attr('height', config.height)
        .attr('class', 'earth-viewer'); // Add a class for easier selection

    // Main group for centering and scaling
    globeGroup = svg.append('g')
        .attr('class', 'globe-group') // Add class
        .attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

    // Background/Ocean (drawn first)
    earthBoundary = globeGroup.append('ellipse')
        .attr('class', 'earth-boundary')
        .attr('rx', appState.currentScale)
        .attr('ry', appState.currentScale) // Initial aspect ratio, updated in render
        .attr('fill', config.oceanColor);

    // Group for overlay visualizations (drawn on top of land/graticule)
    overlayGroup = globeGroup.append('g')
        .attr('class', 'overlay-visualization')
        .style('opacity', config.overlayOpacity);

    // Add other base elements if needed (e.g., clip paths)
}

// --- Loading Indicator ---

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

function hideLoadingMessage() {
    loadingText?.style('display', 'none');
}


// --- Rendering ---

let renderRequestId = null;
function triggerRender(forceRedraw = false) {
    // Avoid rendering during animations controlled elsewhere
    if (appState.isAnimating && !forceRedraw) return;

    // Debounce rendering using requestAnimationFrame
    if (renderRequestId) {
        cancelAnimationFrame(renderRequestId);
    }
    renderRequestId = requestAnimationFrame(() => {
        if (appState.worldData) { // Only render if data is loaded
            renderGlobe(appState.worldData, appState.currentScale, appState.currentRotation);
        }
        renderRequestId = null;
    });
}

// --- State Updates (Called by UI module) ---

function setRotation(newRotation) {
    appState.currentRotation = newRotation;
    // Render is usually triggered separately by UI after setting state
}

function setScale(newScale) {
    appState.currentScale = newScale;
    // Render is usually triggered separately by UI after setting state
}


// --- Animation & Navigation ---

function animateIn() {
    // Animate from a different viewpoint to the initial one
    const startRotation = [-75, 25, 0]; // From the side
    const endRotation = config.initialRotation;
    const duration = 1500; // ms

    appState.isAnimating = true; // Prevent render conflicts

    d3.transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .tween("rotate", () => {
            const r = d3.interpolate(startRotation, endRotation);
            return (t) => {
                // Check if still animating (might have been interrupted)
                if(!appState.isAnimating) return; // Exit tween if animation was stopped
                appState.currentRotation = r(t);
                triggerRender(true); // Force render during animation
            };
        })
        .on("end", () => {
            appState.isAnimating = false; // Animation finished
            // Start auto-rotation if enabled after initial animation
            if (config.rotationSpeed > 0) startStopAutoRotate(true);
        })
        .on("interrupt", () => {
            appState.isAnimating = false; // Animation interrupted
        });
}


function navigateTo(targetLon, targetLat) {
    if (appState.isAnimating) return; // Don't start new navigation if already animating
    startStopAutoRotate(false); // Stop auto-rotate during navigation

    const startRotation = [...appState.currentRotation];
    const targetRotation = [targetLon, targetLat, 0]; // Target gamma (roll) is 0
    const duration = 1000; // ms

    // Handle longitude interpolation across the 180 meridian
    let deltaLon = targetRotation[0] - startRotation[0];
    if (deltaLon > 180) deltaLon -= 360;
    if (deltaLon < -180) deltaLon += 360;
    const finalStartRotation = [...startRotation];
    finalStartRotation[0] = startRotation[0] + deltaLon; // This is the target wrapped the short way

    appState.isAnimating = true;

    d3.transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .tween("navigate", () => {
            const r = d3.interpolate(startRotation, [startRotation[0]+deltaLon, targetRotation[1], targetRotation[2]]);
            return (t) => {
                if(!appState.isAnimating) return;
                let current = r(t);
                // Normalize longitude during tween
                current[0] = (current[0] + 540) % 360 - 180;
                appState.currentRotation = current;
                triggerRender(true);
            };
        })
        .on("end", () => {
            appState.isAnimating = false;
            // Ensure final rotation is precise
            appState.currentRotation = [(targetRotation[0] + 540) % 360 - 180, targetRotation[1], targetRotation[2]];
            triggerRender(true);
        })
        .on("interrupt", () => {
            appState.isAnimating = false;
        });
}

// --- Autorotation ---

function startStopAutoRotate(start) {
    console.log(`APP: startStopAutoRotate called with start=${start}`); // Debug Log 3

    // --- Potential Bug Area ---
    // It's crucial to clear the *existing* timer *before* potentially starting a new one.
    // Also, manage the config.autoRotate flag consistently.

    if (appState.autoRotateTimer) {
        clearInterval(appState.autoRotateTimer);
        appState.autoRotateTimer = null;
        console.log("APP: Cleared existing autoRotateTimer"); // Debug Log 4
    }

    config.autoRotate = start && config.rotationSpeed > 0; // Update the flag based on intent AND speed

    if (config.autoRotate) {
        console.log("APP: Starting new autoRotateTimer"); // Debug Log 5
        appState.autoRotateTimer = setInterval(() => {
            // Check if we *should* be rotating right now
            if (!appState.isAnimating && config.autoRotate) {
                const rotation = [...appState.currentRotation];
                const speedFactor = config.rotationSpeed / 50; // Adjust speed sensitivity

                rotation[0] += speedFactor;
                rotation[0] = (rotation[0] + 540) % 360 - 180; // Normalize longitude

                // Directly update state - avoids needing callbacks within app.js
                appState.currentRotation = rotation;

                // Trigger a smooth render (no forced redraw)
                triggerRender(false);

                // Update location display if needed (optional, can be performance intensive)
                // import { updateLocationDisplay } from './ui.js'; updateLocationDisplay();
            } else {
                // console.log("APP: Interval tick skipped (animating or stopped)"); // Debug Log 6 (Optional)
            }
        }, 50); // Interval duration (e.g., 50ms for ~20fps updates)
    } else {
        console.log("APP: Auto-rotate stopped (start=false or speed=0)"); // Debug Log 7
        // Ensure slider reflects the stopped state if stopped programmatically
        const speedSlider = document.getElementById('rotation-speed');
        if (speedSlider && parseInt(speedSlider.value) > 0 && !start) { // If slider > 0 but we called stop(false)
            // speedSlider.value = 0; // Uncomment if you want drag to reset slider
        }
    }
}

// --- Utility ---
function updateFooterTimestamp() {
    const footer = document.querySelector('footer');
    if (footer) {
        footer.textContent = `Created for httpsTeabagexe | ${config.dataSourceTimestamp}`;
    }
}


// --- Start Application ---
// Use DOMContentLoaded or ensure script is loaded defer/module
document.addEventListener('DOMContentLoaded', init);