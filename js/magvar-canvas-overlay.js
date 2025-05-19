// magvar-canvas-overlay.js
import geomagnetism from 'geomagnetism';

let magvarResolution = 8;
let magvarYear = new Date().getFullYear();
let canvasOverlay = null;
let magModel = null;

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

// Initial render
renderMagvarOverlay();

return canvasOverlay;
}

function updateMagneticModel() {
try {
// Create model for specific year
magModel = geomagnetism.model(new Date(magvarYear, 0, 1), { allowOutOfBoundsModel: true });
} catch (err) {
console.error("Error creating magnetic model:", err);
// Fallback to current date if there's an error
magModel = geomagnetism.model(null, { allowOutOfBoundsModel: true });
}
}

export function toggleMagvarOverlay(visible) {
if (canvasOverlay) {
canvasOverlay.style.display = visible ? 'block' : 'none';
}
}

export function setMagvarResolution(resolution) {
magvarResolution = resolution;
renderMagvarOverlay();
}

export function setMagvarYear(year) {
magvarYear = year;
// Update the magnetic model for the new year
updateMagneticModel();
renderMagvarOverlay();
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

// Draw vectors
drawMagvarVectors(ctx, projection, magvarResolution);

// Draw legend
drawMagvarLegend(ctx, width, height);
}

function drawMagvarVectors(ctx, projection, resolution) {
// Calculate grid step based on resolution
const gridStep = 180 / resolution;
const vectorLength = 15; // Length of the magnetic vector lines

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

// Create grid of points
for (let lat = -90 + gridStep/2; lat < 90; lat += gridStep) {
for (let lon = -180 + gridStep/2; lon < 180; lon += gridStep) {
// Check if point is visible (in front of the globe)
const point = projection([lon, lat]);
if (!point) continue;

// Calculate magnetic declination using geomagnetism
// Use the model's point method correctly
const info = magModel.point([lat, lon]);
const declination = info.decl; // Using decl property as per documentation

// Calculate vector direction
const trueNorth = projection([lon, lat + 1]);
if (!trueNorth) continue;

// Calculate vector direction and length
const dx = trueNorth[0] - point[0];
const dy = trueNorth[1] - point[1];
const length = Math.sqrt(dx*dx + dy*dy) * 0.15;

// Calculate magnetic north direction
const angle = Math.atan2(dy, dx) + (declination * Math.PI / 180);
const mx = point[0] + (length * Math.cos(angle));
const my = point[1] + (length * Math.sin(angle));

// Draw vector
ctx.beginPath();
ctx.moveTo(point[0], point[1]);
ctx.lineTo(mx, my);
ctx.strokeStyle = colorScale(declination);
ctx.lineWidth = 1.5;
ctx.stroke();

// Arrow head
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
ctx.fillStyle = colorScale(declination);
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
gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)'); // Negative declination (red)
gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)'); // Zero declination (white)
gradient.addColorStop(1, 'rgba(0, 0, 255, 0.8)'); // Positive declination (blue)

// Draw legend bar
ctx.fillStyle = gradient;
ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
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
}