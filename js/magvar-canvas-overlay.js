/**
 * magvar-canvas-overlay.js - Magnetic variation overlay rendering on canvas
 */

// Assume geomagnetism and d3 are available globally
// Removed import statements for global scope approach

let magvarResolution = 8;
let magvarYear = new Date().getFullYear();
let canvasOverlay = null;
let magModel = null;
let cachedOverlayData = null; // Store generated vector data
let lastProjection = null;
let renderingThrottle = null;
let isRendering = false;

const REDRAW_WAIT = 16;
const VECTOR_DETAIL = { lo: 5, hi: 15 };

// Exposed globally
window.createMagvarOverlay = function(container, projection) {
    console.log('createMagvarOverlay called');
    // Use globally available d3
    const existingOverlay = d3.select(container).select('#magvar-overlay').node(); // Select within the container
    if (existingOverlay) existingOverlay.remove();

    canvasOverlay = d3.select(container).append('canvas')
        .attr('id', 'magvar-overlay')
        .attr('width', container.clientWidth)
        .attr('height', container.clientHeight)
        .style('position', 'absolute')
        .style('top', '0')
        .style('left', '0')
        .style('pointer-events', 'none') // Ensure interactions pass through
        .style('opacity', '0.3')
        .style('backgroundColor', 'transparent')
        .style('zIndex', '150')
        .style('display', 'none') // Initially hidden
        // .style('border', '1px solid red') // Keep border for debugging if needed
        .node();

    // Initial model update and data generation will be triggered by loadMagneticVariationData in app.js

    return canvasOverlay;
};

// Exposed globally
window.toggleMagvarOverlay = function(visible) {
    console.log('toggleMagvarOverlay called with', visible);
    if (canvasOverlay) {
        canvasOverlay.style.display = visible ? 'block' : 'none';
        if (visible) {
             // Only render if becoming visible
            renderMagvarOverlay();
        }
    }
};

// Update magnetic model and regenerate data
// Called from app.js or other parts of the application logic
window.updateMagneticModel = function() {
    try {
        // Use the globally available geomagnetism object
        magModel = geomagnetism.model(new Date(magvarYear, 0, 1), { allowOutOfBoundsModel: true });
         console.log('Magnetic model updated for year:', magvarYear);
         // Regenerate field data with high detail whenever the model updates
         generateMagneticField(true);
         // Trigger a render after data is regenerated
         renderMagvarOverlay();
    } catch(error) {
        console.error("Error creating magnetic model:", error);
        magModel = null;
         // Clear cached data if model creation failed
         cachedOverlayData = null;
         // Render to clear the canvas if there's no model/data
         renderMagvarOverlay();
    }
};

// Exposed globally
window.setMagvarResolution = function(resolution) {
    if (magvarResolution !== resolution) {
        magvarResolution = resolution;
         console.log('Magnetic resolution set to', resolution);
         // Regenerate field data and render with new resolution
        generateMagneticField(true);
         // Trigger a render after data is regenerated
        renderMagvarOverlay();
    }
};

// Exposed globally
window.setMagvarYear = function(year) {
    if (magvarYear !== year) {
        magvarYear = year;
         console.log('Magnetic year set to', year);
        updateMagneticModel(); // This will also regenerate data and render
    }
};

// Function to generate the magnetic field data grid (separated from rendering)
// Called from updateMagneticModel, setMagvarResolution, and renderMagvarOverlay
function generateMagneticField(highDetail = false) {
    console.log('generateMagneticField called with highDetail:', highDetail);
    if (!magModel) return; // Ensure magModel exists

    // Determine the detail level for data generation
    const detail = highDetail ? Math.max(VECTOR_DETAIL.hi, magvarResolution) : Math.min(VECTOR_DETAIL.lo, magvarResolution);
    const gridStep = 180 / detail;

    const vectors = [];
    // Iterate over a global grid to generate data points
    for (let lat = -90 + gridStep / 2; lat < 90; lat += gridStep) {
        for (let lon = -180 + gridStep / 2; lon < 180; lon += gridStep) {
            try {
                // Get magnetic declination from the model
                const declination = magModel.point([lat, lon]).decl;
                // Store lat, lon, declination, AND pre-calculated λ, φ (in radians)
                vectors.push({ lat, lon, declination, λ: lon * Math.PI / 180, φ: lat * Math.PI / 180 });
            } catch(error) {
                 // console.error("Error getting magnetic point data for", lat, lon, ":", error);
                 // Continue even if some points fail
            }
        }
    }

    // Store the generated vectors and detail level they were generated at
    cachedOverlayData = { vectors: vectors, highDetail: highDetail, generatedDetail: detail };
     console.log(`Generated magnetic field data with ${vectors.length} vectors at detail ${detail}. High detail requested: ${highDetail}`);
}

// Function to draw the cached vectors onto the canvas using the current projection
// Called from renderMagvarOverlay
function drawMagvarVectors(ctx, projection) {
    console.log('drawMagvarVectors called');
    if (!cachedOverlayData?.vectors || !projection) {
         console.log('drawMagvarVectors: No cached data or projection', cachedOverlayData, projection);
        return;
    }

    console.log(`Drawing ${cachedOverlayData.vectors.length} vectors.`);
     if (cachedOverlayData.vectors.length > 0) {
         console.log('Sample vector data:', cachedOverlayData.vectors[0]);
     }

    const colorScale = declination => {
        const intensity = Math.min(Math.abs(declination) / 20, 1);
        return declination < 0
            ? `rgba(255, ${255 * (1 - intensity)}, ${255 * (1 - intensity)}, 0.3)`
            : `rgba(${255 * (1 - intensity)}, ${255 * (1 - intensity)}, 255, 0.3)`;
    };

    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const arrowSize = 3; // Define arrow size
    const detail = cachedOverlayData.generatedDetail; // Use the detail level the data was generated at
    const lineWidth = detail > VECTOR_DETAIL.lo ? 1.5 : 2; // Line width based on generated detail

    // Get camera orientation once per draw call
    const [λ0, φ0] = projection.rotate().map(d => -d * Math.PI / 180);
    const cosφ0 = Math.cos(φ0);
    const sinφ0 = Math.sin(φ0);

    for (const { lat, lon, declination, λ, φ } of cachedOverlayData.vectors) {
        // Check if the point is on the visible hemisphere using pre-calculated λ and φ
        // Simplified dot product calculation slightly
        const cosλ_λ0 = Math.cos(λ - λ0);
        const dot = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * cosλ_λ0;

        // Only proceed if the point is potentially visible (add a small buffer)
        if (dot >= -0.1) {
             const point = projection([lon, lat]);

             // Final check if the point is actually projected (within the canvas bounds)
            if (point) {
                try {
                     // Project a point slightly north to determine vector direction on screen
                    // Recalculate true north projection for each point (can be optimized if needed)
                    const trueNorthLat = lat + 0.1; // Use a small delta
                    const trueNorthPoint = projection([lon, trueNorthLat]);

                    if (trueNorthPoint) {
                        const dx = trueNorthPoint[0] - point[0];
                        const dy = trueNorthPoint[1] - point[1];
                        const length = Math.sqrt(dx * dx + dy * dy) * 0.15; // Adjust vector length
                        const angle = Math.atan2(dy, dx) + (declination * Math.PI / 180);
                        const mx = point[0] + length * Math.cos(angle);
                        const my = point[1] + length * Math.sin(angle);

                        ctx.beginPath();
                        ctx.moveTo(point[0], point[1]);
                        ctx.lineTo(mx, my);
                        ctx.strokeStyle = colorScale(declination);
                        ctx.lineWidth = lineWidth;
                        ctx.stroke();

                        // Draw arrow head only in higher detail levels
                        if (detail > VECTOR_DETAIL.lo) {
                            ctx.beginPath();
                            ctx.moveTo(mx, my);
                            ctx.lineTo(mx - arrowSize * Math.cos(angle - Math.PI / 6), my - arrowSize * Math.sin(angle - Math.sin(angle - Math.PI / 6)));
                            ctx.lineTo(mx - arrowSize * Math.cos(angle + Math.PI / 6), my - arrowSize * Math.sin(angle + Math.PI / 6));
                            ctx.closePath();
                            ctx.fillStyle = colorScale(declination);
                            ctx.fill();
                        }
                    }

                } catch(error) {
                     // console.error("Error drawing magvar vector at", lat, lon, ":", error);
                     // Continue drawing other vectors
                }
            }
        }
    }
}

function drawMagvarLegend(ctx, width, height) {
    const legendWidth = 200, legendHeight = 20;
    const legendX = width - legendWidth - 20;
    const legendY = height - legendHeight - 20;

    const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 0, 255, 0.8)');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(legendX - 10, legendY - 30, legendWidth + 20, legendHeight + 45);

    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('-20°', legendX, legendY + legendHeight + 15);
    ctx.fillText('0°', legendX + legendWidth / 2, legendY + legendHeight + 15);
    ctx.fillText('+20°', legendX + legendWidth, legendY + legendHeight + 15);
    ctx.fillText(`Magnetic Declination (${magvarYear})`, legendX + legendWidth / 2, legendY - 10);
}

// Function called by globe interaction handlers to request an overlay update
// Exposed globally
window.updateMagvarOverlay = function() {
    if (!canvasOverlay) return;

    // Throttle rendering requests to avoid overwhelming during rapid globe movement
    if (renderingThrottle) clearTimeout(renderingThrottle);

    renderingThrottle = setTimeout(() => {
         // Request a render. renderMagvarOverlay will determine if data needs regeneration.
        renderMagvarOverlay();
    }, REDRAW_WAIT);
};

// Main rendering function - called on load, toggle, year/resolution change, and globe interaction
// Exposed globally
window.renderMagvarOverlay = function() {
    console.log('renderMagvarOverlay called');
    if (!canvasOverlay || !magModel) {
         console.log('renderMagvarOverlay: No canvas or magModel', canvasOverlay, magModel);
        return;
    }

    const ctx = canvasOverlay.getContext('2d');
    const { width, height } = canvasOverlay;
    ctx.clearRect(0, 0, width, height); // Clear the entire canvas

    // Get the projection from the globe wrapper (now expected to be on the container)
    const globeWrapper = canvasOverlay.parentElement?.__globeWrapper;
    if (!globeWrapper?.projection) {
         console.log('renderMagvarOverlay: No globe wrapper or projection');
        return;
    }

    const projection = globeWrapper.projection;
    const currentRotate = projection.rotate();
    const currentScale = projection.scale();

    // Determine if projection has changed significantly to warrant regenerating data (high detail) or just rendering (low detail)
    const rotationChange = !lastProjection || Math.abs(currentRotate[0] - lastProjection.rotate[0]) > 0.5 || Math.abs(currentRotate[1] - lastProjection.rotate[1]) > 0.5;
    const scaleChange = !lastProjection || Math.abs(currentScale - lastProjection.scale) / lastProjection.scale > 0.05;

    // Determine the detail level for rendering based on whether the globe is currently moving.
    // Regenerate data *only if* the required detail level is different from the cached data's detail level.
    const requiredDetailHigh = !(rotationChange || scaleChange);
    const requiredDetail = requiredDetailHigh ? Math.max(VECTOR_DETAIL.hi, magvarResolution) : Math.min(VECTOR_DETAIL.lo, magvarResolution);

    if (!cachedOverlayData || cachedOverlayData.generatedDetail !== requiredDetail) {
         console.log(`Regenerating data. Cached detail: ${cachedOverlayData?.generatedDetail}, Required detail: ${requiredDetail}`);
         generateMagneticField(requiredDetailHigh); // Pass the highDetail flag to generate the correct detail
    }

    // Draw vectors using the cached data and current projection
    drawMagvarVectors(ctx, projection);

    // Draw the legend
    drawMagvarLegend(ctx, width, height);

    // Update last projection after rendering is complete
    lastProjection = { rotate: [...currentRotate], scale: currentScale };
    isRendering = false; // Allow next render request
};
