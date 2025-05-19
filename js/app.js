import { setupSvgGlobe } from "./svg-globe-cambecc.js";
            import { loadAllData, dataAvailable } from './data.js';
            import { config } from './config.js';
            import {
                createMagvarOverlay,
                toggleMagvarOverlay,
                setMagvarYear,
                setMagvarResolution,
                updateMagvarOverlay
            } from './magvar-canvas-overlay.js';

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

                    // Load magnetic variation data
                    await loadMagneticVariationData(globeContainer);

                    // Setup event listeners for UI controls
                    setupUIControls();
                    setupResizeHandler();
                    setupRotationHandler();

                } catch (error) {
                    console.error("Error initializing application:", error);
                    showLoadingMessage("Failed to initialize application.", true);
                }
            }

async function loadMagneticVariationData(container) {
    try {
        showLoadingMessage("Loading magnetic variation data...");

        // For geomagnetism library, you can either:
        // 1. Use their built-in coefficients
        if (window.geoMagFactory) {
            magvarData = {}; // The library has built-in coefficients
            dataAvailable.magvar = true;
        } else {
            // 2. Load your own WMM coefficients
            const response = await fetch('data/WMM.COF');
            if (!response.ok) {
                throw new Error('Failed to fetch magnetic variation data');
            }
            const text = await response.text();
            magvarData = parseMagvarData(text);
        }

        hideLoadingMessage();

        // Create the overlay with the loaded data
        if (container && globe && globe.projection) {
            createMagvarOverlay(container, globe.projection, magvarData);
        }

        // Enable UI
        const magvarToggle = document.getElementById('toggle-magvar-overlay');
        if (magvarToggle) {
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
                if (magvarToggle) {
                    // Initially disable until data is loaded
                    magvarToggle.disabled = !dataAvailable.magvar;

                    // Add event listener for checkbox changes
                    magvarToggle.addEventListener('change', () => {
                        toggleMagvarOverlay(magvarToggle.checked);
                    });
                }

                // Magvar resolution slider
                const resolutionSlider = document.getElementById('magvar-resolution');
                if (resolutionSlider) {
                    // Set default resolution value
                    const defaultResolution = 8;
                    resolutionSlider.value = defaultResolution;

                    resolutionSlider.addEventListener('input', () => {
                        const resolution = parseInt(resolutionSlider.value);
                        setMagvarResolution(resolution);
                    });
                }

                // Year input for magnetic variation
                const yearInput = document.getElementById('magvar-year');
                if (yearInput) {
                    const currentYear = new Date().getFullYear();
                    yearInput.value = currentYear;

                    yearInput.addEventListener('change', () => {
                        const year = parseInt(yearInput.value);
                        if (year >= 1900 && year <= 2030) {
                            setMagvarYear(year);
                            updateMagvarOverlay();
                        }
                    });
                }

                // Globe click for coordinates
                const globeContainer = document.getElementById('globe-container');
                if (globeContainer && globe && globe.projection) {
                    globeContainer.addEventListener('click', (event) => {
                        const rect = globeContainer.getBoundingClientRect();
                        const x = event.clientX - rect.left;
                        const y = event.clientY - rect.top;

                        const coords = coordsAtPoint(x, y, globe.projection);

                        if (coords) {
                            console.log('Clicked coordinates:', coords);

                            // Display coordinates in a UI element if available
                            const coordDisplay = document.getElementById('clicked-coordinates');
                            if (coordDisplay) {
                                coordDisplay.textContent = `Lat: ${coords[1].toFixed(2)}°, Lon: ${coords[0].toFixed(2)}°`;
                            }
                        }
                    });
                }
            }

            function coordsAtPoint(x, y, projection) {
                // Convert screen coordinates back to geographic coordinates
                const p = projection.invert([x, y]);
                if (p) {
                    return p; // Returns [lon, lat]
                }
                return null;
            }

            function setupResizeHandler() {
                window.addEventListener('resize', () => {
                    if (globe) {
                        config.width = window.innerWidth - getSidebarWidth();
                        config.height = window.innerHeight;

                        // Update globe size (if you have a resize method)
                        // globe.resize(config.width, config.height);

                        // Update magvar overlay size
                        if (dataAvailable.magvar) {
                            const container = document.getElementById("globe-container");
                            if (container) {
                                updateMagvarOverlay();
                            }
                        }
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

                            // Update all visual elements
                            if (globe.svg) {
                                globe.svg.selectAll(".sphere, .graticule, .land").attr("d", globe.path);
                            }

                            // Update magvar overlay when rotating
                            updateMagvarOverlay();
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