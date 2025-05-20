import { setupSvgGlobe } from "./svg-globe-cambecc.js";
import { loadAllData, dataAvailable, placeholderAirports, placeholderWaypoints, placeholderNavaids } from './data.js';
import { config } from './config.js';
import {
    createMagvarOverlay,
    toggleMagvarOverlay,
    setMagvarYear,
    setMagvarResolution,
    updateMagvarOverlay
} from './magvar-canvas-overlay.js';
import geomagnetism from 'geomagnetism';

let globe, loadingText, magvarData = null;
const visibleLayers = { airports: true, waypoints: true, navaids: true };

function renderNavigationData() {
    if (!globe?.svg || !globe.projection) return;
    globe.svg.selectAll(".nav-point").remove();
    if (visibleLayers.airports) renderAirports();
    if (visibleLayers.navaids) renderNavaids();
    if (visibleLayers.waypoints) renderWaypoints();
}

function renderAirports() {
    if (!globe?.svg || !globe.projection) return;
    const airportPoints = globe.svg.selectAll(".airport")
        .data(placeholderAirports)
        .enter()
        .append("g")
        .attr("class", "nav-point airport")
        .attr("transform", d => {
            const pos = globe.projection([d.lon, d.lat]);
            return pos ? `translate(${pos[0]}, ${pos[1]})` : "translate(-1000,-1000)";
        });
    airportPoints.append("circle").attr("r", 3).attr("fill", "#3498db").attr("stroke", "#fff").attr("stroke-width", 0.5);
}

function renderNavaids() {
    if (!globe?.svg || !globe.projection) return;
    const navaidPoints = globe.svg.selectAll(".navaid")
        .data(placeholderNavaids)
        .enter()
        .append("g")
        .attr("class", "nav-point navaid")
        .attr("transform", d => {
            const pos = globe.projection([d.lon, d.lat]);
            return pos ? `translate(${pos[0]}, ${pos[1]})` : "translate(-1000,-1000)";
        });
    navaidPoints.append("path")
        .attr("d", d => d.type === "VOR" ? "M-3,0 L3,0 M0,-3 L0,3 M-2.1,-2.1 L2.1,2.1 M-2.1,2.1 L2.1,-2.1" : "M0,0 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0")
        .attr("stroke", d => d.type === "VOR" ? "#e74c3c" : "#f39c12")
        .attr("stroke-width", 1.2)
        .attr("fill", d => d.type === "VOR" ? "none" : "rgba(243, 156, 18, 0.3)");
}

function renderWaypoints() {
    if (!globe?.svg || !globe.projection) return;
    const waypointPoints = globe.svg.selectAll(".waypoint")
        .data(placeholderWaypoints)
        .enter()
        .append("g")
        .attr("class", "nav-point waypoint")
        .attr("transform", d => {
            const pos = globe.projection([d.lon, d.lat]);
            return pos ? `translate(${pos[0]}, ${pos[1]})` : "translate(-1000,-1000)";
        });
    waypointPoints.append("path").attr("d", "M0,-3 L2.5,2 L-2.5,2 Z").attr("fill", "#2ecc71").attr("opacity", 0.8);
}

async function initApp() {
    const globeContainer = document.getElementById("globe-container");
    config.width = window.innerWidth - getSidebarWidth();
    config.height = window.innerHeight;
    showLoadingMessage("Loading geographic data...");
    try {
        const landData = await loadAllData();
        hideLoadingMessage();
        if (!landData) return showLoadingMessage("Failed to load land data.", true);
        globe = setupSvgGlobe(globeContainer, landData, {
            width: config.width || 900,
            height: config.height || 900,
            landColor: config.landColor || "#72B092",
            oceanColor: config.oceanColor || "#001D3D",
            landStrokeColor: config.landStrokeColor || "#333",
            graticuleColor: config.graticuleColor || "#888",
            graticuleOpacity: config.graticuleOpacity ?? 0.7
        });
        await loadMagneticVariationData(globeContainer);
        setupUIControls();
        setupResizeHandler();
        setupRotationHandler();
        renderNavigationData();
        updateMagvarOverlay();
    } catch (error) {
        console.error("Error initializing application:", error);
        showLoadingMessage("Failed to initialize application.", true);
    }
}

async function loadMagneticVariationData(container) {
    checkGeomagnLibrary();
    try {
        showLoadingMessage("Loading magnetic variation data...");
        if (window.geoMagFactory) {
            magvarData = {};
            dataAvailable.magvar = true;
        } else {
            const response = await fetch('./WMM.COF');
            if (!response.ok) throw new Error('Failed to fetch magnetic variation data');
            magvarData = parseMagvarData(await response.text());
        }
        hideLoadingMessage();
        if (container && globe?.projection) createMagvarOverlay(container, globe.projection, magvarData);
        const magvarToggle = document.getElementById('toggle-magvar-overlay');
        if (magvarToggle) {
            magvarToggle.disabled = false;
            magvarToggle.checked = true;
            toggleMagvarOverlay(true);
        }
    } catch (error) {
        console.error("Error loading magnetic variation data:", error);
        hideLoadingMessage();
    }
}

function setupUIControls() {
    const magvarToggle = document.getElementById('toggle-magvar-overlay');
    if (magvarToggle) {
        magvarToggle.disabled = !dataAvailable.magvar;
        magvarToggle.addEventListener('change', () => toggleMagvarOverlay(magvarToggle.checked));
    }
    const resolutionSlider = document.getElementById('magvar-resolution');
    if (resolutionSlider) {
        resolutionSlider.value = 8;
        resolutionSlider.addEventListener('input', () => setMagvarResolution(parseInt(resolutionSlider.value)));
    }
    const yearInput = document.getElementById('magvar-year');
    if (yearInput) {
        yearInput.value = new Date().getFullYear();
        yearInput.addEventListener('change', () => {
            const year = parseInt(yearInput.value);
            if (year >= 1900 && year <= 2030) {
                setMagvarYear(year);
                updateMagvarOverlay();
            }
        });
    }
    const layerControls = {
        'toggle-layer-airports': 'airports',
        'toggle-layer-waypoints': 'waypoints',
        'toggle-layer-navaids': 'navaids'
    };
    for (const [id, layerName] of Object.entries(layerControls)) {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.checked = visibleLayers[layerName];
            toggle.addEventListener('change', () => {
                visibleLayers[layerName] = toggle.checked;
                renderNavigationData();
            });
        }
    }
    const globeContainer = document.getElementById('globe-container');
    if (globeContainer && globe?.projection) {
        globeContainer.addEventListener('click', (event) => {
            const rect = globeContainer.getBoundingClientRect();
            const coords = coordsAtPoint(event.clientX - rect.left, event.clientY - rect.top, globe.projection);
            if (coords) {
                const coordDisplay = document.getElementById('clicked-coordinates');
                if (coordDisplay) coordDisplay.textContent = `Lat: ${coords[1].toFixed(2)}°, Lon: ${coords[0].toFixed(2)}°`;
            }
        });
    }
}

function coordsAtPoint(x, y, projection) {
    return projection.invert([x, y]) || null;
}

function setupResizeHandler() {
    window.addEventListener('resize', () => {
        if (globe) {
            config.width = window.innerWidth - getSidebarWidth();
            config.height = window.innerHeight;
            if (dataAvailable.magvar) updateMagvarOverlay();
        }
    });
}

function setupRotationHandler() {
    const rotationSpeedInput = document.getElementById('rotation-speed');
    if (rotationSpeedInput && globe) {
        let rotationSpeed = 0, rotation = 0;
        rotationSpeedInput.addEventListener('input', e => rotationSpeed = e.target.value / 10);
        function animate() {
            if (rotationSpeed > 0 && globe?.projection) {
                rotation = (rotation + rotationSpeed) % 360;
                globe.projection.rotate([rotation, ...globe.projection.rotate().slice(1)]);
                globe.svg?.selectAll(".sphere, .graticule, .land").attr("d", globe.path);
                globe.svg?.selectAll(".nav-point").attr("transform", d => {
                    const pos = globe.projection([d.lon, d.lat]);
                    return pos ? `translate(${pos[0]}, ${pos[1]})` : "translate(-1000,-1000)";
                });
                updateMagvarOverlay();
            }
            requestAnimationFrame(animate);
        }
        animate();
    }
}

function getSidebarWidth() {
    return document.getElementById('left-sidebar')?.offsetWidth || 0;
}

function showLoadingMessage(message, isError = false) {
    const container = document.getElementById("globe-container");
    if (!container) return;
    let svg = container.querySelector("svg.loading-overlay") || document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (!svg.parentNode) {
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
    loadingText.setAttribute("fill", isError ? '#ff8888' : '#fff');
    svg.style.display = "block";
}

function hideLoadingMessage() {
    const overlay = document.querySelector("#globe-container svg.loading-overlay");
    if (overlay) overlay.style.display = "none";
}

document.addEventListener('DOMContentLoaded', initApp);