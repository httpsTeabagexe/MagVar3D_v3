// js/wgs84.js
import { WGS84, config } from './config.js';

/**
 * Convert geodetic coordinates (longitude, latitude) to 3D Cartesian coordinates (ECEF)
 */
function geodeticToCartesian(longitude, latitude) {
    const lon = longitude * Math.PI / 180;
    const lat = latitude * Math.PI / 180;
    const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * Math.pow(Math.sin(lat), 2));
    const x = N * Math.cos(lat) * Math.cos(lon);
    const y = N * Math.cos(lat) * Math.sin(lon);
    const z = (N * (1 - WGS84.e2)) * Math.sin(lat);
    return [x, y, z];
}

/**
 * Apply rotation to 3D Cartesian coordinates
 */
function rotateCartesian(point, rotation) {
    const [x, y, z] = point;
    const lambda = rotation[0] * Math.PI / 180; // longitude
    const phi = rotation[1] * Math.PI / 180;    // latitude
    const gamma = rotation[2] * Math.PI / 180;  // roll

    const x1 = x * Math.cos(lambda) - y * Math.sin(lambda);
    const y1 = x * Math.sin(lambda) + y * Math.cos(lambda);
    const z1 = z;

    const x2 = x1;
    const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);
    const z2 = y1 * Math.sin(phi) + z1 * Math.cos(phi);

    const x3 = x2 * Math.cos(gamma) + z2 * Math.sin(gamma);
    const y3 = y2;
    const z3 = -x2 * Math.sin(gamma) + z2 * Math.cos(gamma);

    return [x3, y3, z3];
}

/**
 * Project 3D point to 2D screen coordinates with depth test
 */
function projectToScreen(point, scale) {
    const [x, y, z] = point;
    const normX = x / WGS84.a;
    const normY = y / WGS84.a;
    const normZ = z / WGS84.a;
    const scaledX = normX * scale;
    const scaledY = normY * scale;

    if (normZ < 0) { // Behind the globe
        return null;
    }
    return [scaledX, scaledY, normZ]; // Return z for depth sorting/opacity
}

/**
 * Apply different projection types based on config
 */
export function applyProjection(lon, lat, scale, rotation) {
    const currentProjection = config.projection; // Access from imported config

    if (currentProjection !== 'orthographic') {
        switch (currentProjection) {
            case 'equirectangular':
                const x = (lon / 180) * scale;
                const y = (lat / 90) * scale * 0.5;
                return [x, -y, 1]; // Invert Y for SVG coordinate system

            case 'mercator':
                const mercLatRad = lat * Math.PI / 180;
                const mercY = Math.log(Math.tan((Math.PI / 4) + (mercLatRad / 2)));
                return [(lon / 180) * scale, -mercY / Math.PI * scale, 1]; // Invert and scale Y

            case 'stereographic':
                const centerLonRad = rotation[0] * Math.PI / 180;
                const centerLatRad = rotation[1] * Math.PI / 180;
                const lonRad = lon * Math.PI / 180;
                const latRad = lat * Math.PI / 180;

                const cosLat = Math.cos(latRad);
                const sinLat = Math.sin(latRad);
                const cosCenterLat = Math.cos(centerLatRad);
                const sinCenterLat = Math.sin(centerLatRad);
                const cosLonDiff = Math.cos(lonRad - centerLonRad);

                const k = 2 / (1 + sinLat * sinCenterLat + cosLat * cosCenterLat * cosLonDiff);
                if (!isFinite(k)) return null; // Avoid issues at antipodal point

                const stereX = k * cosLat * Math.sin(lonRad - centerLonRad);
                const stereY = k * (cosCenterLat * sinLat - sinCenterLat * cosLat * cosLonDiff);
                return [stereX * scale, -stereY * scale, 1]; // Invert Y

            default: // Fallback to equirectangular
                const defX = (lon / 180) * scale;
                const defY = (lat / 90) * scale * 0.5;
                return [defX, -defY, 1];
        }
    }

    // Orthographic projection
    const cartesian = geodeticToCartesian(lon, lat);
    const rotated = rotateCartesian(cartesian, rotation);
    const projected = projectToScreen(rotated, scale);

    // Invert Y for SVG coordinate system if projected
    return projected ? [projected[0], -projected[1], projected[2]] : null;
}


/**
 * Convert screen coordinates to longitude/latitude
 */
export function screenToLonLat(screenX, screenY, scale, rotation, width, height) {
    const currentProjection = config.projection;

    // Adjust coordinates to be relative to the globe center
    const relX = screenX - width / 2;
    const relY = -(screenY - height / 2); // Invert Y back from SVG coordinates

    if (currentProjection === 'orthographic') {
        const x = relX / scale;
        const y = relY / scale;
        const distanceSquared = x * x + y * y;
        if (distanceSquared > 1.0) return null;
        const z = Math.sqrt(1.0 - distanceSquared);

        let cartesian = [x, y, z]; // Point on unit sphere

        // Apply inverse rotations
        const lambda = -rotation[0] * Math.PI / 180;
        const phi = -rotation[1] * Math.PI / 180;
        const gamma = -rotation[2] * Math.PI / 180;

        // Inverse gamma (around Y)
        let x1 = cartesian[0] * Math.cos(gamma) - cartesian[2] * Math.sin(gamma);
        let y1 = cartesian[1];
        let z1 = cartesian[0] * Math.sin(gamma) + cartesian[2] * Math.cos(gamma);
        // Inverse phi (around X)
        let x2 = x1;
        let y2 = y1 * Math.cos(phi) + z1 * Math.sin(phi);
        let z2 = -y1 * Math.sin(phi) + z1 * Math.cos(phi);
        // Inverse lambda (around Z)
        let x3 = x2 * Math.cos(lambda) + y2 * Math.sin(lambda);
        let y3 = -x2 * Math.sin(lambda) + y2 * Math.cos(lambda);
        let z3 = z2;

        const lon = Math.atan2(y3, x3) * 180 / Math.PI;
        const lat = Math.asin(z3) * 180 / Math.PI;
        return [lon, lat];

    } else if (currentProjection === 'equirectangular') {
        const lon = (relX / scale) * 180;
        const lat = (relY / (scale * 0.5)) * 90;
        // Clamp latitude
        const clampedLat = Math.max(-90, Math.min(90, lat));
        return [lon, clampedLat];

    } else if (currentProjection === 'mercator') {
        const lon = (relX / scale) * 180;
        const mercY = (relY / scale) * Math.PI;
        const latRad = 2 * Math.atan(Math.exp(mercY)) - Math.PI / 2;
        const lat = latRad * 180 / Math.PI;
        // Clamp latitude (Mercator goes to infinity at poles)
        const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
        return [lon, clampedLat];

    } else { // Stereographic or others - inverse is complex, return null for now
        console.warn(`screenToLonLat not fully implemented for ${currentProjection}`);
        return null;
    }
}

/**
 * Process a collection of coordinates (a ring or line) for path generation
 */
function processCoordinates(coordinates, scale, rotation) {
    const segments = [];
    let currentSegment = [];
    let lastProjected = null;
    let lastVisible = false;

    for (let i = 0; i < coordinates.length; i++) {
        const [lon, lat] = coordinates[i];
        const projected = applyProjection(lon, lat, scale, rotation);

        if (projected) { // Point is visible
            const [x, y] = projected;
            if (!lastVisible || currentSegment.length === 0) { // Start new segment if first visible or after invisible
                if(currentSegment.length > 0) segments.push(currentSegment); // Push previous segment
                currentSegment = [`M${x.toFixed(2)},${y.toFixed(2)}`];
            } else { // Continue segment
                // Basic line simplification - skip point if very close to previous
                const lastPt = currentSegment[currentSegment.length - 1].match(/(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/);
                if(lastPt){
                    const prevX = parseFloat(lastPt[1]);
                    const prevY = parseFloat(lastPt[3]);
                    if(Math.abs(x - prevX) > 0.1 || Math.abs(y - prevY) > 0.1){
                        currentSegment.push(`L${x.toFixed(2)},${y.toFixed(2)}`);
                    }
                } else {
                    currentSegment.push(`L${x.toFixed(2)},${y.toFixed(2)}`);
                }
            }
            lastVisible = true;
        } else { // Point is not visible
            lastVisible = false;
        }
        lastProjected = projected; // Store last projection result
    }
    if (currentSegment.length > 1) segments.push(currentSegment); // Push the last segment if it has lines

    return segments.map(segment => segment.join(' ')).join(' ');
}


/**
 * Generate path data for a GeoJSON feature
 */
export function featureToPathData(feature, scale, rotation) {
    if (!feature || !feature.geometry) return '';

    const type = feature.geometry.type;
    let pathData = '';

    switch (type) {
        case 'Polygon':
            for (const ring of feature.geometry.coordinates) {
                const ringPath = processCoordinates(ring, scale, rotation);
                if (ringPath) pathData += ringPath + 'Z ';
            }
            break;
        case 'MultiPolygon':
            for (const polygon of feature.geometry.coordinates) {
                for (const ring of polygon) {
                    const ringPath = processCoordinates(ring, scale, rotation);
                    if (ringPath) pathData += ringPath + 'Z ';
                }
            }
            break;
        case 'LineString':
            pathData = processCoordinates(feature.geometry.coordinates, scale, rotation);
            break;
        case 'MultiLineString':
            for (const line of feature.geometry.coordinates) {
                const linePath = processCoordinates(line, scale, rotation);
                if (linePath) pathData += linePath + ' ';
            }
            break;
    }
    return pathData.trim();
}