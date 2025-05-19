import geomagnetism from 'geomagnetism';
import * as d3 from 'd3';

let magvarCanvas, magvarContext, projection, resolution = 10;
let colorScale = d3.scaleSequential(d3.interpolateRdBu).domain([-20, 20]); // domain in degrees
let selectedYear = 2025;
let overlayVisible = false;

// For caching grid data per year/resolution/projection
const gridCache = new Map();

export function createMagvarOverlay(svgContainer, geoProjection) {
    projection = geoProjection;
    const width = +svgContainer.attr("width");
    const height = +svgContainer.attr("height");

    // Remove any existing overlay
    d3.select("canvas.magvar-overlay").remove();

    magvarCanvas = d3.select(svgContainer.node().parentNode)
        .append("canvas")
        .attr("class", "magvar-overlay")
        .attr("width", width)
        .attr("height", height)
        .style("position", "absolute")
        .style("top", "0")
        .style("left", "0")
        .style("pointer-events", "none")
        .style("display", "none");

    magvarContext = magvarCanvas.node().getContext("2d");
    return magvarCanvas.node();
}

function getGridKey(year, res, proj) {
    // You could improve this by including projection parameters if needed
    return `${year}_${res}`;
}

function buildMagvarGrid(year = selectedYear, res = resolution) {
    const key = getGridKey(year, res, projection);
    if (gridCache.has(key)) return gridCache.get(key);

    // Build a grid covering the globe
    let grid = [];
    for (let lon = -180; lon <= 180; lon += res) {
        for (let lat = -90; lat <= 90; lat += res) {
            let decl = 0;
            try {
                const result = geomagnetism.model().date(new Date(year, 0, 1)).point([lat, lon]);
                decl = result.decl;
            } catch (e) {
                // Fallback for error
                decl = 0;
            }
            grid.push({ lon, lat, decl });
        }
    }
    gridCache.set(key, grid);
    return grid;
}

export function renderMagvarOverlay() {
    if (!magvarCanvas || !magvarContext || !projection || !overlayVisible) return;

    const width = +magvarCanvas.getAttribute("width");
    const height = +magvarCanvas.getAttribute("height");
    magvarContext.clearRect(0, 0, width, height);

    const grid = buildMagvarGrid(selectedYear, resolution);

    // Draw each grid point as a colored pixel or short vector
    grid.forEach(({ lon, lat, decl }) => {
        const pt = projection([lon, lat]);
        if (!pt) return; // skip points off the globe

        // Draw line for declination direction/magnitude
        const angle = (decl * Math.PI) / 180;
        const len = 12;
        const end = [
            pt[0] + Math.sin(angle) * len,
            pt[1] - Math.cos(angle) * len,
        ];

        magvarContext.beginPath();
        magvarContext.moveTo(pt[0], pt[1]);
        magvarContext.lineTo(end[0], end[1]);
        magvarContext.strokeStyle = colorScale(decl);
        magvarContext.lineWidth = 2;
        magvarContext.stroke();

        // Draw arrowhead
        const arrowSize = 3;
        const theta = Math.atan2(end[1] - pt[1], end[0] - pt[0]);
        magvarContext.beginPath();
        magvarContext.moveTo(end[0], end[1]);
        magvarContext.lineTo(
            end[0] - arrowSize * Math.cos(theta - Math.PI / 6),
            end[1] - arrowSize * Math.sin(theta - Math.PI / 6)
        );
        magvarContext.lineTo(
            end[0] - arrowSize * Math.cos(theta + Math.PI / 6),
            end[1] - arrowSize * Math.sin(theta + Math.PI / 6)
        );
        magvarContext.closePath();
        magvarContext.fillStyle = colorScale(decl);
        magvarContext.fill();
    });

    // Draw color bar legend (optional)
    drawColorBarLegend(magvarContext, width, height);
}

function drawColorBarLegend(ctx, width, height) {
    const barWidth = 200, barHeight = 12, margin = 12;
    const x0 = width - barWidth - margin, y0 = height - barHeight - margin;
    for (let i = 0; i < barWidth; i++) {
        const t = i / (barWidth - 1);
        const value = colorScale.domain()[0] + t * (colorScale.domain()[1] - colorScale.domain()[0]);
        ctx.fillStyle = colorScale(value);
        ctx.fillRect(x0 + i, y0, 1, barHeight);
    }
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x0, y0, barWidth, barHeight);

    ctx.fillStyle = "#000";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${colorScale.domain()[0]}°`, x0, y0 - 2);
    ctx.fillText(`${colorScale.domain()[1]}°`, x0 + barWidth - 25, y0 - 2);
}

export function toggleMagvarOverlay(show) {
    overlayVisible = show;
    if (magvarCanvas) {
        magvarCanvas.style.display = show ? "block" : "none";
        if (show) renderMagvarOverlay();
    }
}

export function setMagvarYear(year) {
    selectedYear = year;
    // Invalidate grid cache for this year if you want
    renderMagvarOverlay();
}

export function setMagvarResolution(newRes) {
    resolution = newRes;
    renderMagvarOverlay();
}