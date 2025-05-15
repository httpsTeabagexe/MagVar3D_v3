// js/app.js
import { setupSvgGlobe } from "./svg-globe-cambecc.js";
import { loadAllData } from './data.js'; // Import dataAvailable
// Import renderOverlays
// import { initializeUI } from './ui.js';
//import { initGlobe } from './globe.js'; // Import
import {
    config
} from './config.js';

// --- Application State ---


// --- DOM Elements ---
let svg, globeGroup, loadingText;

// --- Helper Functions ---

/**
 * Calculates the width of the left sidebar.
 * @returns {number} The width of the left sidebar in pixels.
 */
function getSidebarWidth() {
    const sidebar = document.getElementById('left-sidebar');
    if (sidebar) {
        return sidebar.offsetWidth;
    }
    return 0; // Default to 0 if sidebar not found
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
            .attr('fill', isError ? '#ff8888' : config.themes.light.landColor || '#ffffff'); // Changed to use theme colors
    }
    loadingText.text(message).attr('fill', isError ? '#ff8888' : config.themes.light.landColor || '#ffffff'); // Changed to use theme colors
    loadingText.style('display', 'block');
}

/**
 * Hides the loading message from the screen.
 */
function hideLoadingMessage() {
    loadingText?.style('display', 'none');
}



/**
 * Sets up the globe with provided land data.
 * @param {object} landData - GeoJSON data for the land.
 */
function setupGlobeWithData(landData) {
    setupSvgGlobe(
        document.getElementById("globe-container"),
        landData,
        {
            width: config.width || 900,
            height: config.height || 900,
            landColor: config.landColor || "#72B092",
            oceanColor: config.oceanColor || "#001D3D",
            landStrokeColor: config.landStrokeColor || "#333",
            graticuleColor: config.graticuleColor || "#888",
            graticuleOpacity: config.graticuleOpacity ?? 0.7
        }
    );
}

/**
 * Performs an action after fetching land data.
 * @param {function} action - The action to perform with the land data.
 */
function withLandData(action) {
    fetch("MagVar3D_v3/ne_110m_land.geojson")
        .then(res => res.json())
        .then(landData => {
            action(landData);
        });
}


/**
 * Adjusts globe size and projection center on window resize.
 */
function handleResize() {
    config.width = window.innerWidth - getSidebarWidth(); // Adjust for sidebar
    config.height = window.innerHeight;

    if (svg) {
        // Update SVG viewbox to reflect new aspect ratio
        svg.attr('viewBox', `0 0 ${config.width} ${config.height}`);
        // Recenter the globe group
        globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);
        // Re-render the globe
        withLandData(setupGlobeWithData);
    }

}

/**
 * Initializes the application.
 */
function init() {
    console.log("Initializing WGS84 Globe...");

    // Calculate initial dimensions, accounting for sidebar
    config.width = window.innerWidth - getSidebarWidth();
    config.height = window.innerHeight;

    //setupSvg(); // Setup SVG first
    showLoadingMessage('Loading Earth Data...'); // Show loading message

    //initializeRenderer(svg, globeGroup, earthBoundary, overlayGroup);

    // Pass the correct callbacks, including those needed by zoom/drag
    // initializeUI(svg, appState, {
    //     scheduleRender,
    //     navigateTo,
    //     updateRotation,
    //     updateScale, // Pass updateScale for zoom handler
    //     startStopAutoRotate,
    //     startRotation,
    //     stopRotation
    // }, overlayGroup); // Pass overlayGroup here

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Load data
    loadAllData()
        .then(initialDataAvailable => {
            // loadAllData now returns a boolean indicating if low-res land is loaded
            if (initialDataAvailable) {
                hideLoadingMessage();
                //scheduleRender(true); // Initial render uses low-res data
                //startIntroAnimation(); // Start animation
                document.getElementById('globe-container');
                // const globe = initGlobe(container);
                withLandData(setupGlobeWithData);
                // Example: auto-rotation

                let rotation = 0;
                let rotationSpeed = 0;

                document.getElementById('rotation-speed').addEventListener('input', (e) => {
                    rotationSpeed = e.target.value / 10;
                });

                function animate() {
                    if (rotationSpeed > 0) {
                        rotation += rotationSpeed;
                        globe.rotate(rotation, 0);
                    }
                    requestAnimationFrame(animate);
                }

                animate();
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