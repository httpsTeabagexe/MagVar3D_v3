// js/globe.js
import * as d3 from 'd3';
import { config } from './config.js';

const projectionMap = {
    orthographic: d3.geoOrthographic,
    mercator: d3.geoMercator,
    // Add more projections as needed
};

export function initGlobe(container) {
    // Dimensions
    let width = container.clientWidth;
    let height = container.clientHeight;
    let centerX = width / 2;
    let centerY = height / 2;

    // Canvas setup
    const canvas = d3.select(container).append("canvas")
        .attr("width", width)
        .attr("height", height)
        .node();
    const context = canvas.getContext("2d");

    // D3 projection and path
    const projectionFn = projectionMap[config.projection] || d3.geoOrthographic;
    const projection = projectionFn()
        .scale(Math.min(width, height) / 2 - 20)
        .translate([centerX, centerY])
        .precision(0.1)
        .clipAngle(90); // Crucial for clipping to the globe
    const path = d3.geoPath().projection(projection).context(context);

    // Graticule (simplified)
    const graticule = d3.geoGraticule().step([30, 30]);

    // Data holders
    let landData = null, lakesData = null;

    // Redraw function
    function redrawPaths() {
        context.clearRect(0, 0, width, height);

        // 1. Draw Ocean (Background) - Now using a circle clipped by the projection
        context.beginPath();
        context.arc(centerX, centerY, projection.scale(), 0, 2 * Math.PI);
        context.fillStyle = config.oceanColor;
        context.fill();

        // Atmospheric glow
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, projection.scale() + 20);
        gradient.addColorStop(0, "rgba(0, 45, 105, 0.9)");
        gradient.addColorStop(1, "rgba(0, 45, 105, 0)");
        context.beginPath();
        context.arc(centerX, centerY, projection.scale() + 20, 0, 2 * Math.PI);
        context.fillStyle = gradient;
        context.fill();

        // 2. Draw Land - Now drawn after the ocean
        if (landData) {
            context.beginPath();
            path(landData); // Draw land polygons
            context.fillStyle = config.landColor;
            context.fill();
            if (config.outlineOnly) {
                context.strokeStyle = config.landStrokeColor;
                context.lineWidth = config.landStrokeWidth;
                context.stroke();
            }
        }

        // Draw lakes after land
        if (lakesData) {
            context.beginPath();
            path(lakesData);
            context.fillStyle = "#5599DD";
            context.fill();
            if (config.outlineOnly) {
                context.strokeStyle = config.landStrokeColor;
                context.lineWidth = config.landStrokeWidth;
                context.stroke();
            }
        }

        // Graticule
        if (config.showGraticule) {
            context.save();
            context.globalAlpha = config.graticuleOpacity;
            context.beginPath();
            path(graticule());
            context.strokeStyle = config.graticuleColor;
            context.lineWidth = config.graticuleWidth;
            context.stroke();
            context.restore();
        }
    }

    // Data loading (lazy, can be extended for zoom-based loading)
    d3.json(config.lakesDataUrl).then(data => {
        lakesData = data;
        redrawPaths();
    });
    d3.json(config.landDataUrlHighRes).then(data => {
        landData = data;
        redrawPaths();
    });

    // Drag interaction with throttling
    let dragging = false;
    let lastDrag = 0;
    const drag = d3.drag()
        .on("start", () => {
            dragging = true;
        })
        .on("drag", (event) => {
            const r = projection.rotate();
            const sensitivity = config.sensitivity / projection.scale();
            const newLongitude = r[0] + event.dx * sensitivity;
            const newLatitude = r[1] - event.dy * sensitivity;
            projection.rotate([newLongitude, Math.max(-80, Math.min(80, newLatitude))]);
            if (dragging) {
                requestAnimationFrame(redrawPaths);
            }
        })
        .on("end", () => {
            dragging = false;
        });
    d3.select(canvas).call(drag);

    // Resize handler
    function resize() {
        width = container.clientWidth;
        height = container.clientHeight;
        centerX = width / 2;
        centerY = height / 2;
        canvas.width = width;
        canvas.height = height;
        projection
            .scale(Math.min(width, height) / 2 - 20)
            .translate([centerX, centerY]);
        redrawPaths();
    }

    window.addEventListener('resize', resize);

    // Public API
    return {
        projection,
        rotate: (lambda, phi) => {
            projection.rotate([lambda, phi]);
            redrawPaths();
        },
        resize
    };
}