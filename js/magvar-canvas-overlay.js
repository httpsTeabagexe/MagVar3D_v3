// magvar-canvas-overlay.js
import geomagnetism from 'geomagnetism';
import * as d3 from "d3";

let magvarResolution = 8;
let magvarYear = new Date().getFullYear();
let canvasOverlay = null;
let magModel = null;
let cachedOverlayData = null;
let lastProjection = null;
let renderingThrottle = null;
let isRendering = false;

// Constants for performance
const REDRAW_WAIT = 16; // milliseconds (60fps target)
const VECTOR_DETAIL = {
    lo: 5,  // Low resolution grid count (used during rotation)
    hi: 15  // High resolution grid count (used when static)
};

export function createMagvarOverlay(container, projection) {
    // Create the model based on year
    updateMagneticModel();

    // Remove existing overlay if any
    const existingOverlay = document.getElementById('magvar-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Create canvas element
    canvasOverlay = document.createElement('canvas');
    canvasOverlay.id = 'magvar-overlay';
    canvasOverlay.width = container.clientWidth;
    canvasOverlay.height = container.clientHeight;
    canvasOverlay.style.position = 'absolute';
    canvasOverlay.style.top = '0';
    canvasOverlay.style.left = '0';
    canvasOverlay.style.pointerEvents = 'none';
    canvasOverlay.style.opacity = '0.7';
    canvasOverlay.style.display = 'none';

    container.appendChild(canvasOverlay);

    // Initial render with pre-generation of field data
    generateMagneticField(true); // Generate high-res initially
    renderMagvarOverlay();

    return canvasOverlay;
}

function updateMagneticModel() {
    try {
        magModel = geomagnetism.model(new Date(magvarYear, 0, 1), { allowOutOfBoundsModel: true });
    } catch (err) {
        console.error("Error creating magnetic model:", err);
        magModel = geomagnetism.model(null, { allowOutOfBoundsModel: true });
    }
}

export function toggleMagvarOverlay(visible) {
    if (canvasOverlay) {
        canvasOverlay.style.display = visible ? 'block' : 'none';
    }
}

export function setMagvarResolution(resolution) {
    if (magvarResolution !== resolution) {
        magvarResolution = resolution;
        cachedOverlayData = null;  // Invalidate cache
        generateMagneticField(true);
        renderMagvarOverlay();
    }
}

export function setMagvarYear(year) {
    if (magvarYear !== year) {
        magvarYear = year;
        updateMagneticModel();
        cachedOverlayData = null;  // Invalidate cache
        generateMagneticField(true);
        renderMagvarOverlay();
    }
}

// Generate the magnetic field data grid
function generateMagneticField(highDetail = false) {
    if (!canvasOverlay || !magModel) return;

    const globeContainer = canvasOverlay.parentElement;
    const globeWrapper = globeContainer.__globeWrapper;
    if (!globeWrapper || !globeWrapper.projection) return;

    const width = canvasOverlay.width;
    const height = canvasOverlay.height;
    const projection = globeWrapper.projection;

    // Store current projection state for comparison
    lastProjection = {
        rotate: [...projection.rotate()],
        scale: projection.scale()
    };

    // Create the field data
    const field = {
        overlay: new ImageData(width, height),
        vectors: [],
        highDetail: highDetail
    };

    // Get appropriate resolution based on detail level
    const detail = highDetail ?
        Math.max(VECTOR_DETAIL.hi, magvarResolution) :
        Math.min(VECTOR_DETAIL.lo, magvarResolution);

    const gridStep = 180 / detail;

    // Create grid of points
    for (let lat = -90 + gridStep/2; lat < 90; lat += gridStep) {
        for (let lon = -180 + gridStep/2; lon < 180; lon += gridStep) {
            try {
                // Calculate magnetic declination
                const info = magModel.point([lat, lon]);
                const declination = info.decl;

                field.vectors.push({
                    lat,
                    lon,
                    declination
                });
            } catch (e) {
                // Skip points that cause errors
            }
        }
    }

    cachedOverlayData = field;
    return field;
}

export function updateMagvarOverlay() {
    if (!canvasOverlay) return;

    // For movement, use throttled low detail rendering
    if (renderingThrottle) clearTimeout(renderingThrottle);

    renderingThrottle = setTimeout(() => {
        if (!isRendering) {
            isRendering = true;

            // Use low detail during motion
            generateMagneticField(false);
            renderMagvarOverlay();

            // Once motion stops, switch to high detail after a delay
            setTimeout(() => {
                generateMagneticField(true);
                renderMagvarOverlay();
                isRendering = false;
            }, 200);
        }
    }, REDRAW_WAIT);
}

export function renderMagvarOverlay() {
    if (!canvasOverlay || !magModel) return;

    const ctx = canvasOverlay.getContext('2d');
    const width = canvasOverlay.width;
    const height = canvasOverlay.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get the projection from the globe
    const globeContainer = canvasOverlay.parentElement;
    const globeWrapper = globeContainer.__globeWrapper;

    if (!globeWrapper || !globeWrapper.projection) return;
    const projection = globeWrapper.projection;

    // Check if projection has changed significantly
    const currentRotate = projection.rotate();
    const currentScale = projection.scale();

    const rotationChange =
        !lastProjection ||
        Math.abs(currentRotate[0] - lastProjection.rotate[0]) > 0.5 ||
        Math.abs(currentRotate[1] - lastProjection.rotate[1]) > 0.5;

    const scaleChange = !lastProjection ||
        Math.abs(currentScale - lastProjection.scale) / lastProjection.scale > 0.05;

    if (!cachedOverlayData || rotationChange || scaleChange) {
        // If projection changed, regenerate field data with appropriate detail
        const isMoving = rotationChange || scaleChange;
        generateMagneticField(!isMoving);
    }

    // Draw vectors from cached data
    drawMagvarVectors(ctx, projection);

    // Draw legend
    drawMagvarLegend(ctx, width, height);
}

function drawMagvarVectors(ctx, projection) {
    if (!cachedOverlayData || !cachedOverlayData.vectors) return;

    // Color scale for declination values
    const colorScale = declination => {
        // Color from red (negative) to blue (positive)
        if (declination < 0) {
            const intensity = Math.min(Math.abs(declination) / 20, 1);
            return `rgba(255, ${Math.floor(255 * (1 - intensity))}, ${Math.floor(255 * (1 - intensity))}, 0.8)`;
        } else {
            const intensity = Math.min(declination / 20, 1);
            return `rgba(${Math.floor(255 * (1 - intensity))}, ${Math.floor(255 * (1 - intensity))}, 255, 0.8)`;
        }
    };

    // Set rendering quality based on vector count
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw each vector
    for (const vector of cachedOverlayData.vectors) {
        // Project lat/lon to screen coordinates
        const point = projection([vector.lon, vector.lat]);
        if (!point) continue; // Skip if not visible

        // Use visibility test to check if point is on front-side of globe
        const λ = vector.lon * Math.PI / 180;
        const φ = vector.lat * Math.PI / 180;
        const [λ0, φ0] = projection.rotate().map(d => -d * Math.PI / 180);
        const cosλ = Math.cos(λ), sinλ = Math.sin(λ);
        const cosφ = Math.cos(φ), sinφ = Math.sin(φ);
        const cosλ0 = Math.cos(λ0), sinλ0 = Math.sin(λ0);
        const cosφ0 = Math.cos(φ0), sinφ0 = Math.sin(φ0);
        const dot = sinφ0 * sinφ + cosφ0 * cosφ * (cosλ0 * cosλ + sinλ0 * sinλ);
        if (dot < 0) continue; // Point is on back side of globe

        // Calculate true north reference
        const trueNorth = projection([vector.lon, vector.lat + 1]);
        if (!trueNorth) continue;

        // Calculate vector direction and length
        const dx = trueNorth[0] - point[0];
        const dy = trueNorth[1] - point[1];
        const length = Math.sqrt(dx*dx + dy*dy) * 0.15;

        // Calculate magnetic north direction
        const angle = Math.atan2(dy, dx) + (vector.declination * Math.PI / 180);
        const mx = point[0] + (length * Math.cos(angle));
        const my = point[1] + (length * Math.sin(angle));

        // Draw vector with smooth antialiased line
        ctx.beginPath();
        ctx.moveTo(point[0], point[1]);
        ctx.lineTo(mx, my);
        ctx.strokeStyle = colorScale(vector.declination);
        ctx.lineWidth = cachedOverlayData.highDetail ? 1.5 : 2;
        ctx.stroke();

        // Only draw arrowheads in high detail mode for better performance
        if (cachedOverlayData.highDetail) {
            const arrowSize = 3;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(
                mx - arrowSize * Math.cos(angle - Math.PI/6),
                my - arrowSize * Math.sin(angle - Math.PI/6)
            );
            ctx.lineTo(
                mx - arrowSize * Math.cos(angle + Math.PI/6),
                my - arrowSize * Math.sin(angle + Math.PI/6)
            );
            ctx.closePath();
            ctx.fillStyle = colorScale(vector.declination);
            ctx.fill();
        }
    }
}

function drawMagvarLegend(ctx, width, height) {
    // Draw legend at bottom of canvas
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = width - legendWidth - 20;
    const legendY = height - legendHeight - 20;

    // Gradient for legend
    const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 255, 0.8)');

    // Draw legend with background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(legendX - 10, legendY - 30, legendWidth + 20, legendHeight + 45);

    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

    // Add labels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('-20°', legendX, legendY + legendHeight + 15);
    ctx.fillText('0°', legendX + legendWidth/2, legendY + legendHeight + 15);
    ctx.fillText('+20°', legendX + legendWidth, legendY + legendHeight + 15);

    // Title
    ctx.fillText(`Magnetic Declination (${magvarYear})`, legendX + legendWidth/2, legendY - 10);

    // Add resolution indicator if in low detail mode
    if (cachedOverlayData && !cachedOverlayData.highDetail) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fillText('Low detail mode during rotation', legendX + legendWidth/2, legendY - 25);
    }
}