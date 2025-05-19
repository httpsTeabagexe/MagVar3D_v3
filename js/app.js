import { setupSvgGlobe } from "./svg-globe-cambecc.js";
import { loadAllData, dataAvailable } from './data.js';
import { config } from './config.js';
import { setMagvarYear } from './magvar-canvas-overlay.js';

// Store the globe wrapper for accessing its methods
let globe;
let loadingText;
let magvarData = null;

// Initialize the application
async function initApp() {
    const globeContainer = document.getElementById("globe-container");
    config.width = window.innerWidth - getSidebarWidth();
    config.height = window.innerHeight;

    showLoadingMessage("Loading geographic data...");

    try {
        // Load land data first
        const landData = await loadAllData();

        hideLoadingMessage();

        if (!landData) {
            showLoadingMessage("Failed to load land data.", true);
            return;
        }

        // Setup the globe with the land data
        globe = setupSvgGlobe(
            globeContainer,
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

        // Load magnetic variation data in background
        loadMagneticVariationData();

        // Setup event listeners for UI controls
        setupUIControls();
        setupResizeHandler();
        setupRotationHandler();

    } catch (error) {
        console.error("Error initializing application:", error);
        showLoadingMessage("Failed to initialize application.", true);
    }
}

// Function to load magnetic variation data
async function loadMagneticVariationData() {
    try {
        showLoadingMessage("Loading magnetic variation data...");
        // Assuming the magvar module has a function to fetch the data
        const response = await fetch('path/to/magvar-data.json');
        if (!response.ok) {
            throw new Error('Failed to fetch magnetic variation data');
        }

        magvarData = await response.json();
        hideLoadingMessage();

        // Update the UI to reflect data availability
        dataAvailable.magvar = true;

        // Enable magvar UI elements if they exist
        const magvarToggle = document.getElementById('toggle-magvar-overlay');
        if (magvarToggle && globe) {
            magvarToggle.disabled = false;
        }

        return magvarData;
    } catch (error) {
        console.error("Error loading magnetic variation data:", error);
        hideLoadingMessage();
        return null;
    }
}

// Setup UI control event listeners
function setupUIControls() {
    // Magnetic variation toggle
    const magvarToggle = document.getElementById('toggle-magvar-overlay');
    if (magvarToggle && globe) {
        // Initially disable until data is loaded
        magvarToggle.disabled = !dataAvailable.magvar;

        if (dataAvailable.magvar) {
            // Create the overlay once
            globe.createMagvarOverlay();

            // Update visibility based on initial checkbox state
            globe.toggleMagvarOverlay(magvarToggle.checked);
        }

        // Add event listener for checkbox changes
        magvarToggle.addEventListener('change', () => {
            if (dataAvailable.magvar) {
                globe.toggleMagvarOverlay(magvarToggle.checked);
            }
        });
    }

    // Rest of the function remains the same
    const resolutionSlider = document.getElementById('magvar-resolution');
    if (resolutionSlider && globe) {
        resolutionSlider.addEventListener('input', () => {
            const resolution = parseInt(resolutionSlider.value);
            globe.setMagvarResolution(resolution);
        });
    }

    const yearInput = document.getElementById('magvar-year');
    if (yearInput) {
        const currentYear = new Date().getFullYear();
        yearInput.value = currentYear;

        yearInput.addEventListener('change', () => {
            const year = parseInt(yearInput.value);
            if (year >= 1900 && year <= 2030) {
                setMagvarYear(year);
            }
        });
    }

    const globeContainer = document.getElementById('globe-container');
    if (globeContainer && globe) {
        globeContainer.addEventListener('click', (event) => {
            const rect = globeContainer.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const coords = coordsAtPoint(x, y, globe.projection);

            if (coords) {
                console.log('Clicked coordinates:', coords);
            }
        });
    }
}

// The rest of the code remains unchanged
function coordsAtPoint(x, y, projection) {
    const p = projection.invert([x, y]);
    if (p) {
        return p;
    }
    return null;
}

function setupResizeHandler() {
    window.addEventListener('resize', () => {
        if (globe) {
            config.width = window.innerWidth - getSidebarWidth();
            config.height = window.innerHeight;
            console.log("Window resized. New dimensions:", config.width, config.height);
        }
    });
}

function setupRotationHandler() {
    const rotationSpeedInput = document.getElementById('rotation-speed');
    if (rotationSpeedInput && globe) {
        let rotationSpeed = 0;
        let rotation = 0;

        rotationSpeedInput.addEventListener('input', (e) => {
            rotationSpeed = e.target.value / 10;
        });

        function animate() {
            if (rotationSpeed > 0 && globe && globe.projection) {
                rotation += rotationSpeed;
                const currentRotate = globe.projection.rotate();
                currentRotate[0] = rotation % 360;
                globe.projection.rotate(currentRotate);
                globe.updateMagvarOverlay();

                if (globe.svg) {
                    globe.svg.selectAll(".sphere, .graticule, .land").attr("d", globe.path);
                }
            }
            requestAnimationFrame(animate);
        }

        animate();
    }
}

function updateDataSourceInfo(source, timestamp) {
    document.getElementById('data-source-info').textContent = source || 'Unknown';
    document.getElementById('data-source-timestamp').textContent = timestamp || 'N/A';
}

function getSidebarWidth() {
    return document.getElementById('left-sidebar')?.offsetWidth || 0;
}

function showLoadingMessage(message, isError = false) {
    const container = document.getElementById("globe-container");
    if (!container) return console.warn("Container not ready for loading message.");

    let svg = container.querySelector("svg.loading-overlay");
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "loading-overlay");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.zIndex = "1000";
        container.appendChild(svg);
    }

    if (!loadingText) {
        loadingText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        loadingText.setAttribute("x", "50%");
        loadingText.setAttribute("y", "50%");
        loadingText.setAttribute("text-anchor", "middle");
        loadingText.setAttribute("dy", "0.35em");
        svg.appendChild(loadingText);
    }

    loadingText.textContent = message;
    loadingText.setAttribute("fill", isError ? '#ff8888' : '#ffffff');
    svg.style.display = "block";
}

function hideLoadingMessage() {
    const container = document.getElementById("globe-container");
    const svg = container?.querySelector("svg.loading-overlay");
    if (svg) svg.style.display = "none";
}

document.addEventListener('DOMContentLoaded', initApp);