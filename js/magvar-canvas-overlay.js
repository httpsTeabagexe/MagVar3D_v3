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

const REDRAW_WAIT = 16;
const VECTOR_DETAIL = { lo: 5, hi: 15 };

export function createMagvarOverlay(container, projection) {
    const existingOverlay = document.getElementById('magvar-overlay');
    if (existingOverlay) existingOverlay.remove();

    canvasOverlay = document.createElement('canvas');
    Object.assign(canvasOverlay, {
        id: 'magvar-overlay',
        width: container.clientWidth,
        height: container.clientHeight,
        style: {
            position: 'absolute',
            top: '0',
            left: '0',
            pointerEvents: 'none',
            opacity: '0.7',
            zIndex: '150',
            display: 'none',
            border: '1px solid red'
        }
    });

    container.appendChild(canvasOverlay);
    updateMagneticModel();
    generateMagneticField(true);
    renderMagvarOverlay();
    return canvasOverlay;
}

export function toggleMagvarOverlay(visible) {
    if (canvasOverlay) {
        canvasOverlay.style.display = visible ? 'block' : 'none';
        if (visible) renderMagvarOverlay();
    }
}

function updateMagneticModel() {
    try {
        magModel = geomagnetism.model(new Date(magvarYear, 0, 1), { allowOutOfBoundsModel: true });
    } catch {
        magModel = geomagnetism.model(null, { allowOutOfBoundsModel: true });
    }
}

export function setMagvarResolution(resolution) {
    if (magvarResolution !== resolution) {
        magvarResolution = resolution;
        cachedOverlayData = null;
        generateMagneticField(true);
        renderMagvarOverlay();
    }
}

export function setMagvarYear(year) {
    if (magvarYear !== year) {
        magvarYear = year;
        updateMagneticModel();
        cachedOverlayData = null;
        generateMagneticField(true);
        renderMagvarOverlay();
    }
}

function generateMagneticField(highDetail = false) {
    if (!canvasOverlay || !magModel) return;

    const globeWrapper = canvasOverlay.parentElement?.__globeWrapper;
    if (!globeWrapper?.projection) return;

    const { width, height } = canvasOverlay;
    const projection = globeWrapper.projection;

    lastProjection = { rotate: [...projection.rotate()], scale: projection.scale() };

    const detail = highDetail ? Math.max(VECTOR_DETAIL.hi, magvarResolution) : Math.min(VECTOR_DETAIL.lo, magvarResolution);
    const gridStep = 180 / detail;

    const field = { overlay: new ImageData(width, height), vectors: [], highDetail };
    for (let lat = -90 + gridStep / 2; lat < 90; lat += gridStep) {
        for (let lon = -180 + gridStep / 2; lon < 180; lon += gridStep) {
            try {
                const declination = magModel.point([lat, lon]).decl;
                field.vectors.push({ lat, lon, declination });
            } catch {}
        }
    }

    cachedOverlayData = field;
}

export function updateMagvarOverlay() {
    if (!canvasOverlay) return;

    if (renderingThrottle) clearTimeout(renderingThrottle);

    renderingThrottle = setTimeout(() => {
        if (!isRendering) {
            isRendering = true;
            generateMagneticField(false);
            renderMagvarOverlay();
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
    const { width, height } = canvasOverlay;
    ctx.clearRect(0, 0, width, height);

    const globeWrapper = canvasOverlay.parentElement?.__globeWrapper;
    if (!globeWrapper?.projection) return;

    const projection = globeWrapper.projection;
    const currentRotate = projection.rotate();
    const currentScale = projection.scale();

    const rotationChange = !lastProjection || Math.abs(currentRotate[0] - lastProjection.rotate[0]) > 0.5 || Math.abs(currentRotate[1] - lastProjection.rotate[1]) > 0.5;
    const scaleChange = !lastProjection || Math.abs(currentScale - lastProjection.scale) / lastProjection.scale > 0.05;

    if (!cachedOverlayData || rotationChange || scaleChange) {
        generateMagneticField(!(rotationChange || scaleChange));
    }

    drawMagvarVectors(ctx, projection);
    drawMagvarLegend(ctx, width, height);
}

function drawMagvarVectors(ctx, projection) {
    if (!cachedOverlayData?.vectors) return;

    const colorScale = declination => {
        const intensity = Math.min(Math.abs(declination) / 20, 1);
        return declination < 0
            ? `rgba(255, ${255 * (1 - intensity)}, ${255 * (1 - intensity)}, 0.8)`
            : `rgba(${255 * (1 - intensity)}, ${255 * (1 - intensity)}, 255, 0.8)`;
    };

    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const { lat, lon, declination } of cachedOverlayData.vectors) {
        const point = projection([lon, lat]);
        if (!point) continue;

        const λ = lon * Math.PI / 180, φ = lat * Math.PI / 180;
        const [λ0, φ0] = projection.rotate().map(d => -d * Math.PI / 180);
        const dot = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * (Math.cos(λ0) * Math.cos(λ) + Math.sin(λ0) * Math.sin(λ));
        if (dot < 0) continue;

        const trueNorth = projection([lon, lat + 1]);
        if (!trueNorth) continue;

        const dx = trueNorth[0] - point[0], dy = trueNorth[1] - point[1];
        const length = Math.sqrt(dx * dx + dy * dy) * 0.15;
        const angle = Math.atan2(dy, dx) + (declination * Math.PI / 180);
        const mx = point[0] + length * Math.cos(angle), my = point[1] + length * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(point[0], point[1]);
        ctx.lineTo(mx, my);
        ctx.strokeStyle = colorScale(declination);
        ctx.lineWidth = cachedOverlayData.highDetail ? 1.5 : 2;
        ctx.stroke();

        if (cachedOverlayData.highDetail) {
            const arrowSize = 3;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx - arrowSize * Math.cos(angle - Math.PI / 6), my - arrowSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(mx - arrowSize * Math.cos(angle + Math.PI / 6), my - arrowSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = colorScale(declination);
            ctx.fill();
        }
    }
}

function drawMagvarLegend(ctx, width, height) {
    const legendWidth = 200, legendHeight = 20;
    const legendX = width - legendWidth - 20, legendY = height - legendHeight - 20;

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

    if (cachedOverlayData && !cachedOverlayData.highDetail) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fillText('Low detail mode during rotation', legendX + legendWidth / 2, legendY - 25);
    }
}