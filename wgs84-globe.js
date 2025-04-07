/**
 * WGS84 Earth Globe Renderer with World Magnetic Model 2025 integration
 *
 * Created for httpsTeabagexe
 * 2025-03-21 17:44:45 UTC
 */

document.addEventListener('DOMContentLoaded', () => {
    // WGS84 parameters (official values)
    const WGS84 = {
        a: 6378137.0,              // semi-major axis (equatorial radius) in meters
        b: 6356752.314245,         // semi-minor axis (polar radius) in meters
        f: 1/298.257223563,        // flattening
        e2: 0.00669437999014,      // first eccentricity squared
    };

    // Configuration
    const config = {
        width: window.innerWidth,
        windowHeight: window.innerHeight,  // Renamed to avoid duplication
        sensitivity: 75,
        defaultScale: 280,
        maxScale: 1200,
        minScale: 150,
        rotation: [0, 0, 0], // [lambda, phi, gamma] in radians
        topoJsonUrl: './earth-topo.json',
        wmmCofUrl: './WMM.COF',
        datasources: {
            temperature: null,
            windspeed: null,
            humidity: null,
            magvar: './WMM.COF' // Initially set, will be validated
        },
        showGraticule: true,
        showGridDots: false,
        showLabels: false,
        outlineOnly: false,
        overlayType: 'none',
        displayMode: 'gradient',
        height: 0,           // height in km (keeping this name for consistency)
        maxHeight: 10,       // max height in km representation
        overlayOpacity: 0.7,
        vectorDensity: 5,
        isolineSpacing: 'medium',
        autoRotate: false,
        rotationSpeed: 0,
        projection: 'orthographic',
        landColor: '#303030',     // cambecc style darker gray
        landStrokeColor: '#222222',
        landStrokeWidth: 0.1,
        oceanColor: '#181818',    // cambecc style almost black
        graticuleColor: '#555555',
        graticuleWidth: 0.1,
        graticuleOpacity: 0.5
    };

    // WMM coefficients storage
    let wmmCoefficients = null;
    let wmmEpoch = 2025.0; // Default epoch, will be updated from file

    // Data availability flags
    const dataAvailable = {
        temperature: false,
        windspeed: false,
        humidity: false,
        magvar: false
    };

// Create the SVG container
    const svg = d3.select('#globe')
        .append('svg')
        .attr('width', config.width)
        .attr('height', config.windowHeight);

    // Add a CSS class to help identify elements
    svg.attr('class', 'earth');

    // Create a group for the globe
    const globeGroup = svg.append('g')
        .attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

    // Create a visual boundary for the Earth
    const earthBoundary = globeGroup.append('ellipse')
        .attr('class', 'earth-boundary')
        .attr('rx', config.defaultScale)
        .attr('ry', config.defaultScale * (WGS84.b / WGS84.a))  // Apply correct flattening
        .attr('fill', config.oceanColor)
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 0.5);

    // Create a group for overlay visualization
    const overlayGroup = globeGroup.append('g')
        .attr('class', 'overlay-visualization')
        .style('opacity', config.overlayOpacity);

    // Add a loading indicator
    const loadingText = svg.append('text')
        .attr('x', config.width / 2)
        .attr('y', config.height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .text('Loading Earth Data...');

    // Marker and info window
    const marker = d3.select('#marker');
    const infoWindow = d3.select('#info-window');

    // Current point of interest (POI)
    let currentPOI = null;

    // ==================== WMM IMPLEMENTATION ====================

    /**
     * Parse WMM coefficient file
     */
    function parseWmmCoefficients(data) {
        const lines = data.trim().split('\n');
        const coeffs = [];

        // Parse header (first line)
        const headerMatch = lines[0].trim().match(/(\d+\.\d+)\s+(\S+)\s+(.+)/);
        if (headerMatch) {
            wmmEpoch = parseFloat(headerMatch[1]);
            console.log(`Loaded WMM model: ${headerMatch[2]}, epoch ${wmmEpoch}, dated ${headerMatch[3]}`);
        } else {
            console.warn("Could not parse WMM header properly");
        }

        // Parse coefficient lines (skip header)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip end marker lines (lines of 9's)
            if (line.indexOf('9999') === 0) continue;

            // Parse coefficient line
            const values = line.split(/\s+/).map(v => parseFloat(v));
            if (values.length >= 6) {
                coeffs.push({
                    n: values[0],      // degree
                    m: values[1],      // order
                    g: values[2],      // g coefficient
                    h: values[3],      // h coefficient
                    gDot: values[4],   // secular variation of g
                    hDot: values[5]    // secular variation of h
                });
            }
        }

        return coeffs;
    }

    /**
     * Calculate magnetic variation (declination) using WMM
     * @param {number} longitude - Longitude in degrees
     * @param {number} latitude - Latitude in degrees
     * @param {number} altitudeKm - Altitude above sea level in kilometers
     * @param {number} date - Decimal year (e.g., 2025.3 for April 2025)
     * @returns {number} Magnetic declination in degrees (positive east, negative west)
     */
    function calculateMagneticVariation(longitude, latitude, altitudeKm, date) {
        if (!wmmCoefficients) {
            console.error("WMM coefficients not loaded");
            return 0;
        }

        // Convert to radians
        const lon = longitude * Math.PI / 180;
        const lat = latitude * Math.PI / 180;

        // Convert altitude from km to meters
        const altitudeM = altitudeKm * 1000;

        // Calculate time difference from epoch
        const yearsSinceEpoch = date - wmmEpoch;

        // Compute geocentric radius at the given latitude
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);

        // Earth radius at this latitude (considering ellipsoid)
        const r = Math.sqrt(Math.pow(WGS84.a * cosLat, 2) + Math.pow(WGS84.b * sinLat, 2));

        // Geocentric radius (distance from center of Earth)
        const geocentricR = r + altitudeM;

        // Calculate spherical harmonics
        let x = 0, y = 0, z = 0;  // Field components in geocentric system

        // Reference radius for the model (Earth's mean radius in km)
        const a = 6371.2;

        // Loop through all coefficients
        for (const coeff of wmmCoefficients) {
            // Update coefficients for secular variation
            const g = coeff.g + coeff.gDot * yearsSinceEpoch;
            const h = coeff.h + coeff.hDot * yearsSinceEpoch;

            const n = coeff.n;
            const m = coeff.m;

            // Skip coefficient handling if n or m is invalid
            if (n < 1 || m > n) continue;

            // Ratio of reference radius to current radius raised to power (n+2)
            const ratio = Math.pow(a / geocentricR, n + 2);

            // Schmidt quasi-normalized associated Legendre functions
            // This is a simplified implementation - a full implementation would use
            // recurrence relations for better numerical stability
            let P_nm = legendre(n, m, sinLat);

            // Spherical harmonic terms
            let cos_m_lon = Math.cos(m * lon);
            let sin_m_lon = Math.sin(m * lon);

            // Add contribution to field components
            // These formulas are derived from the gradient of the potential
            x += ratio * (g * cos_m_lon + h * sin_m_lon) * dP_nm_dtheta(n, m, lat);
            y += ratio * m * (g * sin_m_lon - h * cos_m_lon) * P_nm / cosLat;
            z -= (n + 1) * ratio * (g * cos_m_lon + h * sin_m_lon) * P_nm;
        }

        // Calculate declination (magnetic variation)
        return Math.atan2(y, x) * 180 / Math.PI;
    }

    /**
     * Helper function for Legendre polynomials
     * Note: This is a simplified implementation suitable for our needs
     */
    function legendre(n, m, sinLat) {
        const cosLat = Math.sqrt(1 - sinLat * sinLat);

        if (n === 1 && m === 0) {
            return sinLat;
        }
        if (n === 1 && m === 1) {
            return cosLat;
        }

        // Use recurrence relation for higher terms
        // This is a very simplified version - proper implementations use stable recurrence relations
        let p;

        if (m === n) {
            p = cosLat * legendre(n-1, n-1, sinLat);
        } else if (m === 0) {
            p = sinLat * legendre(n-1, 0, sinLat) - (n-1)/n * legendre(n-2, 0, sinLat);
        } else {
            p = sinLat * legendre(n-1, m, sinLat) - (n-1+m)/n * legendre(n-2, m, sinLat);
        }

        // Apply Schmidt normalization
        if (m > 0) {
            p *= Math.sqrt(2 * factorial(n-m) / factorial(n+m));
        }

        return p;
    }

    /**
     * Derivative of Legendre polynomial
     * Simplified implementation
     */
    function dP_nm_dtheta(n, m, theta) {
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        // Simplified derivative computation
        if (Math.abs(sinTheta) > 0.999) {
            // Near poles, use approximation
            return n * cosTheta / sinTheta * legendre(n, m, sinTheta);
        }

        // Use recurrence relation for derivative
        return n * sinTheta * legendre(n, m, sinTheta) - (n+m) * legendre(n-1, m, sinTheta);
    }

    /**
     * Factorial helper
     */
    function factorial(n) {
        if (n <= 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    /**
     * Get current date as decimal year
     */
    function getCurrentDecimalYear() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

        // Calculate day of year (1-based)
        const start = new Date(Date.UTC(year, 0, 1));
        const diff = now - start;
        const dayOfYear = Math.floor(diff / 86400000) + 1;

        return year + (dayOfYear - 1) / daysInYear;
    }

    // ==================== WGS84 CORE FUNCTIONS ====================

    /**
     * Convert geodetic coordinates (longitude, latitude) to 3D Cartesian coordinates (ECEF)
     * based on the WGS84 ellipsoid
     * FIXED: Corrected sign conventions for proper east-west orientation
     */
    function geodeticToCartesian(longitude, latitude) {
        // Convert degrees to radians
        const lon = longitude * Math.PI / 180;
        const lat = latitude * Math.PI / 180;

        // Compute N (radius of curvature in the prime vertical)
        const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * Math.pow(Math.sin(lat), 2));

        // Compute Cartesian coordinates (fixed sign convention)
        // Note: In this convention, positive X is at 0° longitude (Greenwich)
        const x = N * Math.cos(lat) * Math.cos(lon);
        const y = N * Math.cos(lat) * Math.sin(lon);
        const z = (N * (1 - WGS84.e2)) * Math.sin(lat);

        return [x, y, z];
    }

    /**
     * Apply rotation to 3D Cartesian coordinates
     * FIXED: Corrected rotation matrix for proper orientation
     */
    function rotateCartesian(point, rotation) {
        const [x, y, z] = point;
        // Convert rotation from degrees to radians
        const lambda = rotation[0] * Math.PI / 180; // longitude rotation
        const phi = rotation[1] * Math.PI / 180;    // latitude rotation
        const gamma = rotation[2] * Math.PI / 180;  // roll rotation

        // Step 1: Rotate around Z axis (lambda/longitude)
        const x1 = x * Math.cos(lambda) - y * Math.sin(lambda);
        const y1 = x * Math.sin(lambda) + y * Math.cos(lambda);
        const z1 = z;

        // Step 2: Rotate around X axis (phi/latitude)
        const x2 = x1;
        const y2 = y1 * Math.cos(phi) - z1 * Math.sin(phi);
        const z2 = y1 * Math.sin(phi) + z1 * Math.cos(phi);

        // Step 3: Rotate around Y axis (gamma/roll)
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

        // Normalize by the semi-major axis to get a unit size
        const normX = x / WGS84.a;
        const normY = y / WGS84.a;
        const normZ = z / WGS84.a;

        // Apply scale
        const scaledX = normX * scale;
        const scaledY = normY * scale;

        // Only draw points on the visible hemisphere (z > 0 means in front of the globe)
        // FIXED: Corrected depth test condition for proper visibility
        if (normZ < 0) { // Behind the globe
            return null;
        }

        return [scaledX, scaledY, normZ]; // Return z for depth sorting
    }

    /**
     * Convert screen coordinates to longitude/latitude
     * FIXED: Updated for correct coordinate conversion
     */
    function screenToLonLat(screenX, screenY, scale, rotation) {
        // Adjust coordinates to be relative to the globe center
        const x = (screenX - config.width / 2) / scale;
        const y = (screenY - config.height / 2) / scale;

        // Calculate the distance from the center
        const distanceSquared = x * x + y * y;

        // If the point is outside the globe, return null
        if (distanceSquared > 1.0) {
            return null;
        }

        // Calculate z coordinate on the unit sphere
        const z = Math.sqrt(1.0 - distanceSquared);

        // Convert to cartesian coordinates
        let cartesian = [x, y, z];

        // Apply inverse rotations in reverse order
        const lambda = -rotation[0] * Math.PI / 180;
        const phi = -rotation[1] * Math.PI / 180;
        const gamma = -rotation[2] * Math.PI / 180;

        // Undo gamma rotation (around Y)
        let x1 = cartesian[0] * Math.cos(gamma) - cartesian[2] * Math.sin(gamma);
        let y1 = cartesian[1];
        let z1 = cartesian[0] * Math.sin(gamma) + cartesian[2] * Math.cos(gamma);

        // Undo phi rotation (around X)
        let x2 = x1;
        let y2 = y1 * Math.cos(phi) + z1 * Math.sin(phi);
        let z2 = -y1 * Math.sin(phi) + z1 * Math.cos(phi);

        // Undo lambda rotation (around Z)
        let x3 = x2 * Math.cos(lambda) + y2 * Math.sin(lambda);
        let y3 = -x2 * Math.sin(lambda) + y2 * Math.cos(lambda);
        let z3 = z2;

        // Convert to lat/lon
        const lon = Math.atan2(y3, x3) * 180 / Math.PI;
        const lat = Math.asin(z3) * 180 / Math.PI;

        return [lon, lat];
    }

    /**
     * Apply different projection types based on config
     */
    function applyProjection(lon, lat, scale, rotation) {
        // If not orthographic, skip 3D transformation
        if (config.projection !== 'orthographic') {
            // Apply simple 2D projections directly
            switch (config.projection) {
                case 'equirectangular':
                    // FIXED: Corrected sign for proper east-west orientation
                    const x = (lon / 180) * scale;
                    const y = (lat / 90) * scale * 0.5;
                    return [x, y, 1]; // z = 1 means always visible

                case 'mercator':
                    const mercY = Math.log(Math.tan((Math.PI / 4) + (lat * Math.PI / 360)));
                    // FIXED: Corrected sign for proper east-west orientation
                    return [(lon / 180) * scale, mercY * scale * 0.5, 1];

                case 'stereographic':
                    const stereoLon = lon * Math.PI / 180;
                    const stereoLat = lat * Math.PI / 180;
                    const k = 2 / (1 + Math.sin(stereoLat) * Math.sin(rotation[1] * Math.PI / 180) +
                        Math.cos(stereoLat) * Math.cos(rotation[1] * Math.PI / 180) *
                        Math.cos(stereoLon - rotation[0] * Math.PI / 180));
                    // FIXED: Corrected sign for proper east-west orientation
                    const stereX = k * Math.cos(stereoLat) * Math.sin(stereoLon - rotation[0] * Math.PI / 180);
                    const stereY = k * (Math.cos(rotation[1] * Math.PI / 180) * Math.sin(stereoLat) -
                        Math.sin(rotation[1] * Math.PI / 180) * Math.cos(stereoLat) *
                        Math.cos(stereoLon - rotation[0] * Math.PI / 180));
                    return [stereX * scale * 0.5, stereY * scale * 0.5, 1];

                default:
                    // Default to simple equirectangular if unknown
                    // FIXED: Corrected sign for proper east-west orientation
                    const defX = (lon / 180) * scale;
                    const defY = (lat / 90) * scale * 0.5;
                    return [defX, defY, 1];
            }
        }

        // For orthographic, use our 3D WGS84 projection
        const cartesian = geodeticToCartesian(lon, lat);
        const rotated = rotateCartesian(cartesian, rotation);
        return projectToScreen(rotated, scale);
    }

    /**
     * Process a collection of coordinates (a ring or line)
     */
    function processCoordinates(coordinates, scale, rotation) {
        const segments = [];
        let currentSegment = [];
        let lastVisibleIndex = -1;

        // Process each coordinate
        for (let i = 0; i < coordinates.length; i++) {
            const [lon, lat] = coordinates[i];

            // Project using the selected projection
            const projected = applyProjection(lon, lat, scale, rotation);

            if (projected) {
                const [x, y] = projected;

                // If this is the first visible point after invisible ones,
                // or the first point overall, start a new segment
                if (lastVisibleIndex !== i - 1 || currentSegment.length === 0) {
                    // If we already have points in the current segment, save it
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment);
                        currentSegment = [];
                    }
                    currentSegment.push(`M${x},${y}`);
                } else {
                    currentSegment.push(`L${x},${y}`);
                }

                lastVisibleIndex = i;
            }
        }

        // Add the last segment if it has points
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }

        // Join all segments
        return segments.map(segment => segment.join(' ')).join(' ');
    }

    /**
     * Generate path data for a GeoJSON feature
     */
    function featureToPathData(feature, scale, rotation) {
        if (!feature || !feature.geometry) {
            return '';
        }

        const type = feature.geometry.type;
        let pathData = '';

        switch (type) {
            case 'Polygon':
                // For Polygons, each ring is an array of coordinates
                for (const ring of feature.geometry.coordinates) {
                    const ringPath = processCoordinates(ring, scale, rotation);
                    if (ringPath) {
                        pathData += ringPath + ' Z '; // Close the path
                    }
                }
                break;

            case 'MultiPolygon':
                // For MultiPolygons, each polygon is an array of rings
                for (const polygon of feature.geometry.coordinates) {
                    for (const ring of polygon) {
                        const ringPath = processCoordinates(ring, scale, rotation);
                        if (ringPath) {
                            pathData += ringPath + ' Z '; // Close the path
                        }
                    }
                }
                break;

            case 'LineString':
                // For LineStrings, directly process the coordinates
                pathData = processCoordinates(feature.geometry.coordinates, scale, rotation);
                break;

            case 'MultiLineString':
                // For MultiLineStrings, each line is an array of coordinates
                for (const line of feature.geometry.coordinates) {
                    const linePath = processCoordinates(line, scale, rotation);
                    if (linePath) {
                        pathData += linePath + ' ';
                    }
                }
                break;
        }

        return pathData;
    }

    /**
     * Draw graticule (grid lines)
     */
    function drawGraticule(scale, rotation) {
        // Clear existing graticule
        globeGroup.selectAll('.graticule').remove();

        if (!config.showGraticule) {
            return;
        }

        // Draw parallels (lines of latitude) - more points for smoother curves
        for (let lat = -80; lat <= 80; lat += 10) {
            const pathData = [];

            for (let lon = -180; lon <= 180; lon += 2) { // Smaller step for smoother curves
                const projected = applyProjection(lon, lat, scale, rotation);

                if (projected) {
                    const [x, y] = projected;
                    pathData.push((pathData.length === 0 ? 'M' : 'L') + x + ',' + y);
                } else if (pathData.length > 0) {
                    // If we've moved to the back, start a new segment when we come back
                    globeGroup.append('path')
                        .attr('class', 'graticule')
                        .attr('d', pathData.join(' '))
                        .attr('fill', 'none')
                        .attr('stroke', config.graticuleColor)
                        .attr('stroke-width', config.graticuleWidth)
                        .attr('stroke-opacity', config.graticuleOpacity);

                    pathData.length = 0; // Clear the array
                }
            }

            if (pathData.length > 0) {
                globeGroup.append('path')
                    .attr('class', 'graticule')
                    .attr('d', pathData.join(' '))
                    .attr('fill', 'none')
                    .attr('stroke', config.graticuleColor)
                    .attr('stroke-width', config.graticuleWidth)
                    .attr('stroke-opacity', config.graticuleOpacity);
            }
        }

        // Draw meridians (lines of longitude)
        for (let lon = -180; lon < 180; lon += 10) {
            const pathData = [];

            for (let lat = -90; lat <= 90; lat += 2) { // Smaller step for smoother curves
                const projected = applyProjection(lon, lat, scale, rotation);

                if (projected) {
                    const [x, y] = projected;
                    pathData.push((pathData.length === 0 ? 'M' : 'L') + x + ',' + y);
                } else if (pathData.length > 0) {
                    // If we've moved to the back, start a new segment when we come back
                    globeGroup.append('path')
                        .attr('class', 'graticule')
                        .attr('d', pathData.join(' '))
                        .attr('fill', 'none')
                        .attr('stroke', config.graticuleColor)
                        .attr('stroke-width', config.graticuleWidth)
                        .attr('stroke-opacity', config.graticuleOpacity);

                    pathData.length = 0; // Clear the array
                }
            }

            if (pathData.length > 0) {
                globeGroup.append('path')
                    .attr('class', 'graticule')
                    .attr('d', pathData.join(' '))
                    .attr('fill', 'none')
                    .attr('stroke', config.graticuleColor)
                    .attr('stroke-width', config.graticuleWidth)
                    .attr('stroke-opacity', config.graticuleOpacity);
            }
        }
    }

    /**
     * Draw grid dots
     */
    function drawGridDots(scale, rotation) {
        // Clear existing grid dots
        globeGroup.selectAll('.grid-dots').remove();

        if (!config.showGridDots) {
            return;
        }

        // Create a group for the dots
        const dotsGroup = globeGroup.append('g')
            .attr('class', 'grid-dots');

        // Define grid spacing (in degrees)
        const spacing = 5; // 5-degree spacing for dots

        // Create dots at intersections of longitude and latitude lines
        for (let lat = -85; lat <= 85; lat += spacing) {
            for (let lon = -180; lon < 180; lon += spacing) {
                const projected = applyProjection(lon, lat, scale, rotation);

                if (projected) {
                    const [x, y, z] = projected;

                    // Add a small circle (dot) at this position
                    dotsGroup.append('circle')
                        .attr('cx', x)
                        .attr('cy', y)
                        .attr('r', 0.5) // Small radius for subtle dots
                        .attr('fill-opacity', z); // Fade dots based on depth
                }
            }
        }
    }

    /**
     * Get overlay data from appropriate source
     */
    function getOverlayValue(lon, lat, height) {
        // Check if data for this overlay type is available
        if (!dataAvailable[config.overlayType]) {
            return null; // Data not available
        }

        switch (config.overlayType) {
            case 'magvar':
                // Use WMM to calculate magnetic variation
                return calculateMagneticVariation(lon, lat, height, getCurrentDecimalYear());

            case 'temperature':
            case 'windspeed':
            case 'humidity':
                // These would retrieve data from their respective sources
                // Since they're unavailable in this implementation, return null
                return null;

            default:
                return null;
        }
    }

    /**
     * Get color for overlay value
     */
    function getOverlayColor(value, type) {
        if (value === null) return '#888888'; // Gray for unavailable data

        switch (type || config.overlayType) {
            case 'magvar':
                // Magnetic variation color scale (degrees)
                if (value > 15) return '#FF0000'; // Strong easterly
                if (value > 5) return '#FF8C00';
                if (value > -5) return '#FFFF00'; // Near zero
                if (value > -15) return '#32CD32';
                return '#0000FF'; // Strong westerly

            case 'temperature':
                // Temperature color scale (°C)
                if (value > 40) return '#FF0000'; // Extremely hot
                if (value > 30) return '#FF4500';
                if (value > 20) return '#FF8C00';
                if (value > 10) return '#FFA500';
                if (value > 0) return '#FFD700';
                if (value > -10) return '#87CEEB';
                if (value > -20) return '#1E90FF';
                if (value > -30) return '#0000FF';
                if (value > -40) return '#000080';
                return '#191970'; // Freezing

            case 'windspeed':
                // Wind speed color scale (m/s)
                if (value > 50) return '#FF00FF'; // Hurricane force
                if (value > 40) return '#FF0000';
                if (value > 30) return '#FF4500';
                if (value > 20) return '#FFA500';
                if (value > 15) return '#FFD700';
                if (value > 10) return '#ADFF2F';
                if (value > 5) return '#32CD32';
                return '#006400'; // Light breeze

            case 'humidity':
                // Humidity color scale (%)
                if (value > 90) return '#0000FF'; // Very humid
                if (value > 80) return '#0066FF';
                if (value > 70) return '#0099FF';
                if (value > 60) return '#00CCFF';
                if (value > 50) return '#00FFCC';
                if (value > 40) return '#66FF99';
                if (value > 30) return '#99FF66';
                if (value > 20) return '#FFFF00';
                if (value > 10) return '#FFCC00';
                return '#FF9900'; // Very dry

            default:
                return '#CCCCCC';
        }
    }

    /**
     * Format overlay value for display
     */
    function formatOverlayValue(value, type) {
        if (value === null) return "Data unavailable";

        switch (type || config.overlayType) {
            case 'magvar':
                // Format with E/W suffix for east/west declination
                if (value > 0) {
                    return value.toFixed(1) + '° E';
                } else if (value < 0) {
                    return Math.abs(value).toFixed(1) + '° W';
                } else {
                    return '0°';
                }

            case 'temperature':
                return value.toFixed(1) + ' °C';

            case 'windspeed':
                return value.toFixed(1) + ' m/s';

            case 'humidity':
                return value.toFixed(0) + '%';

            default:
                return value.toString();
        }
    }

    /**
     * Get vector angle based on overlay type
     */
    function getVectorAngle(lon, lat, height) {
        // Only magnetic variation is implemented with real data
        if (config.overlayType === 'magvar' && dataAvailable.magvar) {
            // Magnetic declination is the angle itself
            const magvar = getOverlayValue(lon, lat, height);
            if (magvar !== null) {
                return magvar; // 0 degrees is true north, magvar is the deviation
            }
        }

        // Default direction (north)
        return 0;
    }

    /**
     * Draw gradient overlay
     */
    function drawGradientOverlay(scale, rotation) {
        // Clear existing overlay
        overlayGroup.selectAll('*').remove();

        if (config.overlayType === 'none' || config.displayMode !== 'gradient') {
            // Hide legend
            document.getElementById('overlay-legend').classList.remove('visible');
            return;
        }

        // Check if data is available for this overlay
        if (!dataAvailable[config.overlayType]) {
            // Show data unavailable message
            showDataUnavailableMessage(config.overlayType);
            return;
        }

        // Show and update legend
        updateOverlayLegend();

        // Create grid for gradient overlay
        const gridSpacing = 4; // 4 degree spacing

        for (let lat = -88; lat <= 88; lat += gridSpacing) {
            for (let lon = -180; lon < 180; lon += gridSpacing) {
                const projected = applyProjection(lon, lat, scale, rotation);

                if (projected) {
                    const [x, y, z] = projected;

                    // Calculate value at this point with current height
                    const value = getOverlayValue(lon, lat, config.height);

                    // Get color based on value
                    const color = getOverlayColor(value);

                    // Create a grid cell
                    overlayGroup.append('rect')
                        .attr('x', x - (scale * 0.02))
                        .attr('y', y - (scale * 0.02))
                        .attr('width', scale * 0.04)
                        .attr('height', scale * 0.04)
                        .attr('fill', color)
                        .attr('opacity', 0.7 * z)
                        .attr('data-lon', lon)
                        .attr('data-lat', lat)
                        .attr('data-value', value);
                }
            }
        }

        // Set group opacity
        overlayGroup.style('opacity', config.overlayOpacity);
    }

    /**
     * Draw vector overlay
     */
    function drawVectorOverlay(scale, rotation) {
        // Clear existing overlay
        overlayGroup.selectAll('*').remove();

        if (config.overlayType === 'none' || config.displayMode !== 'vector') {
            // Hide legend
            document.getElementById('overlay-legend').classList.remove('visible');
            return;
        }

        // Check if data is available for this overlay
        if (!dataAvailable[config.overlayType]) {
            // Show data unavailable message
            showDataUnavailableMessage(config.overlayType);
            return;
        }

        // Show and update legend
        updateOverlayLegend();

        // Define grid spacing based on density setting
        const spacing = 15 - config.vectorDensity; // 5-14 degree spacing

        // Create vectors at grid points
        for (let lat = -80; lat <= 80; lat += spacing) {
            for (let lon = -180; lon < 180; lon += spacing) {
                const projected = applyProjection(lon, lat, scale, rotation);

                if (projected) {
                    const [x, y, z] = projected;

                    // Get data value at this point with current height
                    const value = getOverlayValue(lon, lat, config.height);

                    if (value === null) continue; // Skip if data not available

                    // Determine color based on value
                    const color = getOverlayColor(value);

                    // Get direction angle and normalize to [-180, 180]
                    const angle = getVectorAngle(lon, lat, config.height);

                    // Calculate vector length based on value
                    const length = (config.overlayType === 'magvar')
                        ? Math.min(10, Math.abs(value) / 2 + 3)
                        : 5 + Math.abs(value) / 10;

                    // Calculate vector endpoint
                    const radians = angle * Math.PI / 180;
                    const endX = x + Math.sin(radians) * length;
                    const endY = y - Math.cos(radians) * length;

                    // Draw the vector
                    overlayGroup.append('line')
                        .attr('x1', x)
                        .attr('y1', y)
                        .attr('x2', endX)
                        .attr('y2', endY)
                        .attr('stroke', color)
                        .attr('stroke-width', 1)
                        .attr('opacity', z);

                    // Add arrowhead
                    const arrowSize = 2;
                    const arrowAngle1 = radians - Math.PI * 0.9;
                    const arrowAngle2 = radians + Math.PI * 0.9;

                    const arrowX1 = endX + Math.sin(arrowAngle1) * arrowSize;
                    const arrowY1 = endY - Math.cos(arrowAngle1) * arrowSize;
                    const arrowX2 = endX + Math.sin(arrowAngle2) * arrowSize;
                    const arrowY2 = endY - Math.cos(arrowAngle2) * arrowSize;

                    overlayGroup.append('path')
                        .attr('d', `M${endX},${endY} L${arrowX1},${arrowY1} L${arrowX2},${arrowY2} Z`)
                        .attr('fill', color)
                        .attr('opacity', z);
                }
            }
        }

        // Set group opacity
        overlayGroup.style('opacity', config.overlayOpacity);
    }

    /**
     * Draw isoline overlay
     */
    function drawIsolineOverlay(scale, rotation) {
        // Clear existing overlay
        overlayGroup.selectAll('*').remove();

        if (config.overlayType === 'none' || config.displayMode !== 'isoline') {
            // Hide legend
            document.getElementById('overlay-legend').classList.remove('visible');
            return;
        }

        // Check if data is available for this overlay
        if (!dataAvailable[config.overlayType]) {
            // Show data unavailable message
            showDataUnavailableMessage(config.overlayType);
            return;
        }

        // Show and update legend
        updateOverlayLegend();

        // Determine isoline spacing based on overlay type and spacing setting
        let isolineStep;
        let minValue, maxValue;

        switch (config.overlayType) {
            case 'magvar':
                minValue = -20;
                maxValue = 20;
                if (config.isolineSpacing === 'coarse') isolineStep = 5;
                else if (config.isolineSpacing === 'fine') isolineStep = 1;
                else isolineStep = 2; // medium
                break;

            default:
                minValue = -20;
                maxValue = 20;
                isolineStep = 5;
        }

        // Create isolines
        for (let isoValue = minValue; isoValue <= maxValue; isoValue += isolineStep) {
            const pathData = [];

            // Sample points to find where value matches our target
            for (let lat = -80; lat <= 80; lat += 2) {
                let foundPoints = [];

                // Scan across longitude to find points where value matches our target
                for (let lon = -180; lon < 180-1; lon += 1) {
                    const value1 = getOverlayValue(lon, lat, config.height);
                    const value2 = getOverlayValue(lon+1, lat, config.height);

                    if (value1 === null || value2 === null) continue; // Skip if data not available

                    // Check if our target value is between these two points
                    if ((value1 <= isoValue && value2 >= isoValue) ||
                        (value1 >= isoValue && value2 <= isoValue)) {

                        // Interpolate to find the exact longitude where value matches
                        const ratio = Math.abs((isoValue - value1) / (value2 - value1));
                        const exactLon = lon + ratio;

                        foundPoints.push(exactLon);
                    }
                }

                // For each found point, add to the path
                for (const lon of foundPoints) {
                    const projected = applyProjection(lon, lat, scale, rotation);

                    if (projected) {
                        const [x, y] = projected;

                        if (pathData.length === 0) {
                            pathData.push(`M${x},${y}`);
                        } else {
                            // Check distance to last point - if too far, start a new segment
                            const lastCommand = pathData[pathData.length-1];
                            const lastX = parseFloat(lastCommand.split(',')[0].substring(1));
                            const lastY = parseFloat(lastCommand.split(',')[1]);

                            const distance = Math.sqrt(Math.pow(x-lastX, 2) + Math.pow(y-lastY, 2));

                            if (distance > 50) {
                                pathData.push(`M${x},${y}`);
                            } else {
                                pathData.push(`L${x},${y}`);
                            }
                        }
                    }
                }
            }

            if (pathData.length > 0) {
                // Determine color based on value
                const color = getOverlayColor(isoValue);

                overlayGroup.append('path')
                    .attr('d', pathData.join(' '))
                    .attr('fill', 'none')
                    .attr('stroke', color)
                    .attr('stroke-width', 1)
                    .attr('stroke-opacity', 0.8)
                    .attr('data-value', isoValue);

                // Add labels to the isolines (reduced frequency)
                if (isoValue % (isolineStep * 2) === 0) {
                    // Extract points along the path to place labels
                    const labelPoints = extractLabelPoints(pathData, 3);

                    labelPoints.forEach(point => {
                        overlayGroup.append('text')
                            .attr('x', point.x)
                            .attr('y', point.y)
                            .attr('font-size', '8px')
                            .attr('fill', color)
                            .attr('text-anchor', 'middle')
                            .attr('dy', '0.3em')
                            .text(formatOverlayValue(isoValue));
                    });
                }
            }
        }

        // Set group opacity
        overlayGroup.style('opacity', config.overlayOpacity);
    }

    /**
     * Show message when data is unavailable
     */
    function showDataUnavailableMessage(dataType) {
        // Clear existing overlay
        overlayGroup.selectAll('*').remove();

        // Add a message to the overlay group
        overlayGroup.append('text')
            .attr('x', 0)
            .attr('y', 0)
            .attr('text-anchor', 'middle')
            .attr('font-size', '14px')
            .attr('fill', 'white')
            .text(`${dataType.charAt(0).toUpperCase() + dataType.slice(1)} data unavailable`);

        // Show legend with unavailable message
        const legend = document.getElementById('overlay-legend');
        legend.classList.add('visible');

        // Update legend title
        const legendTitle = legend.querySelector('h3');
        if (legendTitle) {
            legendTitle.textContent = `${dataType.charAt(0).toUpperCase() + dataType.slice(1)} - Unavailable`;
        }

        // Update legend content
        const legendLabels = document.getElementById('legend-labels');
        if (legendLabels) {
            legendLabels.innerHTML = '<span>Data source unavailable</span>';
        }

        // Update legend bar
        const legendBar = document.getElementById('legend-bar');
        if (legendBar) {
            legendBar.style.background = '#888888';
        }
    }

    /**
     * Extract points for isoline labels
     */
    function extractLabelPoints(pathData, frequency) {
        const points = [];

        // Very simple extraction - just get points along the path
        // In a real implementation, this would be more sophisticated

        for (let i = 0; i < pathData.length; i++) {
            const cmd = pathData[i];
            if (cmd.startsWith('M') && i % frequency === 0) {
                const [x, y] = cmd.substring(1).split(',').map(parseFloat);
                points.push({x, y});
            }
        }

        return points;
    }

    /**
     * Update overlay legend
     */
    function updateOverlayLegend() {
        const legend = document.getElementById('overlay-legend');
        legend.classList.add('visible');

        // Update legend title
        const legendTitle = legend.querySelector('h3');
        if (legendTitle) {
            let title;
            switch (config.overlayType) {
                case 'magvar': title = 'Magnetic Variation'; break;
                case 'temperature': title = 'Temperature'; break;
                case 'windspeed': title = 'Wind Speed'; break;
                case 'humidity': title = 'Humidity'; break;
                default: title = 'Data';
            }

            if (config.height > 0) {
                title += ` at ${config.height} km`;
            }

            legendTitle.textContent = title;
        }

        // Update legend gradient bar
        const legendBar = document.getElementById('legend-bar');
        if (legendBar) {
            let gradientString = 'linear-gradient(to bottom, ';

            switch (config.overlayType) {
                case 'magvar':
                    gradientString += '#FF0000, #FF8C00, #FFFF00, #32CD32, #0000FF)';
                    break;
                case 'temperature':
                    gradientString += '#FF0000, #FFA500, #FFD700, #87CEEB, #0000FF, #191970)';
                    break;
                case 'windspeed':
                    gradientString += '#FF00FF, #FF0000, #FFA500, #FFD700, #32CD32, #006400)';
                    break;
                case 'humidity':
                    gradientString += '#0000FF, #00CCFF, #00FFCC, #99FF66, #FFFF00, #FF9900)';
                    break;
                default:
                    gradientString += '#FFFFFF, #888888, #000000)';
            }

            legendBar.style.background = gradientString;
        }

        // Update legend labels
        const legendLabels = document.getElementById('legend-labels');
        if (legendLabels) {
            legendLabels.innerHTML = '';

            let labels;
            switch (config.overlayType) {
                case 'magvar':
                    labels = ['20° E', '10° E', '0°', '10° W', '20° W'];
                    break;
                case 'temperature':
                    labels = ['40 °C', '20 °C', '0 °C', '-20 °C', '-40 °C'];
                    break;
                case 'windspeed':
                    labels = ['50 m/s', '40 m/s', '30 m/s', '20 m/s', '10 m/s', '0 m/s'];
                    break;
                case 'humidity':
                    labels = ['90%', '70%', '50%', '30%', '10%'];
                    break;
                default:
                    labels = ['Max', 'Mid', 'Min'];
            }

            labels.forEach(label => {
                const span = document.createElement('span');
                span.textContent = label;
                legendLabels.appendChild(span);
            });
        }
    }

    /**
     * Show overlay tooltip on hover
     */
    function showOverlayTooltip(x, y) {
        if (config.overlayType === 'none') return;

        // Convert screen coordinates to lon/lat
        const lonLat = screenToLonLat(x, y, currentScale, currentRotation);

        if (lonLat) {
            const [lon, lat] = lonLat;

            // Check if data is available
            if (!dataAvailable[config.overlayType]) {
                const tooltip = d3.select('#tooltip');
                tooltip
                    .style('left', `${x + 15}px`)
                    .style('top', `${y + 15}px`)
                    .style('opacity', 1)
                    .html(`
                        ${lat.toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}<br>
                        ${config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1)}: 
                        <strong>Data unavailable</strong>
                    `);
                return;
            }

            // Calculate the value at this location
            const value = getOverlayValue(lon, lat, config.height);

            // Format the value
            const formattedValue = formatOverlayValue(value);

            // Show tooltip with lat/lon and value
            const tooltip = d3.select('#tooltip');
            tooltip
                .style('left', `${x + 15}px`)
                .style('top', `${y + 15}px`)
                .style('opacity', 1)
                .html(`
                    ${lat.toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${lon.toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}<br>
                    ${config.overlayType === 'magvar' ? 'Magnetic Variation' :
                    config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1)}: 
                    <strong>${formattedValue}</strong>
                    ${config.height > 0 ? `<br>Altitude: ${config.height} km` : ''}
                `);
        }
    }

    /**
     * Hide tooltip
     */
    function hideTooltip() {
        d3.select('#tooltip').style('opacity', 0);
    }

    /**
     * Extract topojson data from worldData safely
     */
    function extractLandFeatures(worldData) {
        if (!worldData) return null;

        try {
            // Check if we have objects and land property
            if (!worldData.objects || typeof worldData.objects !== 'object') {
                console.error("Invalid TopoJSON: missing 'objects' property", worldData);
                return null;
            }

            // Try to find the land object - in earth-topo.json this is the key
            let landObject;
            if (worldData.objects.land) {
                landObject = worldData.objects.land;
            } else {
                // Look for any geometric object if land is not found
                const objectKeys = Object.keys(worldData.objects);
                for (const key of objectKeys) {
                    const obj = worldData.objects[key];
                    if (obj && obj.type && (obj.type === 'GeometryCollection' || obj.type === 'Feature')) {
                        landObject = obj;
                        console.log(`Using object key: ${key} instead of 'land'`);
                        break;
                    }
                }
            }

            if (!landObject) {
                console.error("No suitable geometry object found in TopoJSON");
                return null;
            }

            // Convert to GeoJSON
            return topojson.feature(worldData, landObject);
        } catch (error) {
            console.error("Error extracting land features:", error);
            return null;
        }
    }

    /**
     * Draw or update country labels
     */
    function drawLabels(land, scale, rotation) {
        if (!config.showLabels) {
            globeGroup.selectAll('.label').remove();
            return;
        }

        // Define major country centroids (lon, lat, name)
        const countries = [
            [-100, 40, "USA"],
            [-110, 60, "Canada"],
            [-60, -20, "Brazil"],
            [0, 50, "UK"],
            [10, 50, "Germany"],
            [2, 46, "France"],
            [15, 40, "Italy"],
            [103, 35, "China"],
            [139, 36, "Japan"],
            [78, 22, "India"],
            [133, -25, "Australia"],
            [24, -30, "South Africa"],
            [45, 60, "Russia"]
        ];

        // Remove existing labels
        globeGroup.selectAll('.label').remove();

        // Add labels for major countries
        countries.forEach((country) => {
            const [lon, lat, name] = country;

            // Project using the selected projection
            const projected = applyProjection(lon, lat, scale, rotation);

            if (projected) {
                const [x, y, z] = projected;

                // Create the label
                globeGroup.append('text')
                    .attr('class', 'label')
                    .attr('x', x)
                    .attr('y', y)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', `${Math.max(8, scale/50)}px`)
                    .attr('fill', 'rgba(255,255,255,0.7)')
                    .attr('opacity', z > 0 ? 1 : 0)  // Only show if on front side
                    .attr('pointer-events', 'none')
                    .text(name);
            }
        });
    }

    /**
     * Set current point of interest
     */
    function setPOI(x, y) {
        // Convert screen coordinates to lon/lat
        const lonLat = screenToLonLat(x, y, currentScale, currentRotation);

        if (lonLat) {
            const [lon, lat] = lonLat;

            // Set current POI
            currentPOI = {
                lon: lon,
                lat: lat,
                screenX: x,
                screenY: y
            };

            // Update marker and info window
            updatePOI();
        }
    }

    /**
     * Update POI marker and info window
     */
    function updatePOI() {
        if (!currentPOI) {
            // Hide marker and info window
            marker.style('display', 'none');
            infoWindow.style('display', 'none');
            return;
        }

        // Project POI to screen coordinates
        const projected = applyProjection(currentPOI.lon, currentPOI.lat, currentScale, currentRotation);

        if (projected) {
            const [x, y, z] = projected;

            // Update marker position
            marker
                .style('display', 'block')
                .style('left', `${x + config.width / 2}px`)
                .style('top', `${y + config.height / 2}px`);

            // Get data for info window
            let infoContent = `
                <strong>Location:</strong> ${currentPOI.lat.toFixed(2)}° ${currentPOI.lat >= 0 ? 'N' : 'S'}, 
                ${currentPOI.lon.toFixed(2)}° ${currentPOI.lon >= 0 ? 'E' : 'W'}<br>
            `;

            // Add data based on current overlay
            if (config.overlayType !== 'none') {
                if (dataAvailable[config.overlayType]) {
                    const value = getOverlayValue(currentPOI.lon, currentPOI.lat, config.height);
                    const formattedValue = formatOverlayValue(value);

                    infoContent += `<strong>${config.overlayType === 'magvar' ? 'Magnetic Variation' :
                        config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1)}:</strong> 
                                ${formattedValue}<br>`;
                } else {
                    infoContent += `<strong>${config.overlayType.charAt(0).toUpperCase() + config.overlayType.slice(1)}:</strong> 
                                Data unavailable<br>`;
                }
            }

            // Add height information
            if (config.height > 0) {
                infoContent += `<strong>Altitude:</strong> ${config.height} km`;
            }

            // Update info window
            infoWindow
                .style('display', 'block')
                .style('left', `${x + config.width / 2}px`)
                .style('top', `${y + config.height / 2 - 10}px`)
                .html(infoContent);
        } else {
            // POI is not visible, hide marker and info window
            marker.style('display', 'none');
            infoWindow.style('display', 'none');
        }
    }

    /**
     * Render the entire globe with proper WGS84 ellipsoidal shape
     */
    function renderGlobe(worldData, scale, rotation) {
        // Update the Earth boundary
        if (config.projection === 'orthographic') {
            // For orthographic, use an ellipse with proper WGS84 flattening
            earthBoundary
                .attr('rx', scale)
                .attr('ry', scale * (WGS84.b / WGS84.a))  // Apply correct flattening
                .attr('fill', config.oceanColor);
        } else {
            // For 2D projections, use a rectangle for the ocean background
            earthBoundary
                .attr('rx', scale * 2)
                .attr('ry', scale)
                .attr('fill', config.oceanColor);
        }

        // If we have a topojson file, render it
        if (worldData) {
            try {
                // Convert from TopoJSON to GeoJSON (or use simplified data if conversion fails)
                const land = extractLandFeatures(worldData);

                if (land) {
                    // Remove existing land paths
                    globeGroup.selectAll('.land').remove();

                    if (land.type === 'FeatureCollection') {
                        // Handle a collection of features (most common case)
                        land.features.forEach((feature, index) => {
                            const pathData = featureToPathData(feature, scale, rotation);

                            if (pathData) {
                                globeGroup.append('path')
                                    .attr('class', `land land-${index}`)
                                    .attr('d', pathData)
                                    .attr('fill', config.outlineOnly ? 'none' : config.landColor)
                                    .attr('stroke', config.landStrokeColor)
                                    .attr('stroke-width', config.outlineOnly ? 0.4 : config.landStrokeWidth);
                            }
                        });
                    } else if (land.type === 'Feature') {
                        // Handle a single feature
                        const pathData = featureToPathData(land, scale, rotation);

                        if (pathData) {
                            globeGroup.append('path')
                                .attr('class', 'land')
                                .attr('d', pathData)
                                .attr('fill', config.outlineOnly ? 'none' : config.landColor)
                                .attr('stroke', config.landStrokeColor)
                                .attr('stroke-width', config.outlineOnly ? 0.4 : config.landStrokeWidth);
                        }
                    }

                    // Draw labels if enabled
                    drawLabels(land, scale, rotation);
                } else {
                    // Fallback to a simple ellipse representation if land extraction failed
                    earthBoundary.attr('fill', config.oceanColor);
                }
            } catch (error) {
                console.error("Error rendering land:", error);
                // Just ensure the globe is visible even if rendering fails
                earthBoundary.attr('fill', config.oceanColor);
            }
        }

        // Draw the graticule
        drawGraticule(scale, rotation);

        // Draw grid dots if enabled
        drawGridDots(scale, rotation);

        // Draw overlay based on the selected display mode
        if (config.overlayType !== 'none') {
            switch (config.displayMode) {
                case 'gradient':
                    drawGradientOverlay(scale, rotation);
                    break;
                case 'vector':
                    drawVectorOverlay(scale, rotation);
                    break;
                case 'isoline':
                    drawIsolineOverlay(scale, rotation);
                    break;
            }
        } else {
            // Clear overlay if none selected
            overlayGroup.selectAll('*').remove();
            document.getElementById('overlay-legend').classList.remove('visible');
        }

        // Update location display
        updateLocationDisplay(rotation);

        // Update status info
        d3.select('#status span').text(`WGS84 Earth | Scale: ${scale.toFixed(0)}`);

        // Update marker if there is a POI
        updatePOI();
    }

    /**
     * Update the location display with current view info
     */
    function updateLocationDisplay(rotation) {
        // Get the center of the current view
        const centerLon = rotation[0];
        const centerLat = rotation[1];

        // Convert to formatted string (with N/S/E/W suffixes)
        const lonSuffix = centerLon >= 0 ? 'E' : 'W';
        const latSuffix = centerLat >= 0 ? 'N' : 'S';

        const lonFormatted = Math.abs(centerLon).toFixed(1) + '° ' + lonSuffix;
        const latFormatted = Math.abs(centerLat).toFixed(1) + '° ' + latSuffix;

        // Update the display
        d3.select('#location span').text(`${latFormatted}, ${lonFormatted}`);
    }

    /**
     * Update data source information
     */
    function updateDataSourceInfo(source) {
        // Update the data source information with current UTC time
        d3.select('#data-info span').text(`Source: ${source} | 2025-03-21 17:50:26 UTC`);
    }

    // ==================== INTERACTION HANDLERS ====================

    // Current state
    let currentScale = config.defaultScale;
    let currentRotation = [0, 0, 0]; // [lambda, phi, gamma]
    let worldData = null;
    let autoRotateTimer = null;

    // Handle drag to rotate - optimized for smoother performance
    const dragBehavior = d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged);

    svg.call(dragBehavior);

    function dragStarted(event) {
        event.sourceEvent.stopPropagation();
    }

    // Use requestAnimationFrame for smoother rendering during drag
    let dragRequestId = null;

    function dragged(event) {
        // Stop autorotation if user drags
        if (config.autoRotate) {
            stopAutoRotation();
        }

        const x = event.dx;
        const y = event.dy;

        // FIXED: Corrected rotation direction for natural interaction
        // Dragging right should rotate the globe east (positive direction)
        currentRotation[0] += x / config.sensitivity * 10;
        currentRotation[1] -= y / config.sensitivity * 10;

        // Limit vertical rotation to prevent upside-down views
        currentRotation[1] = Math.max(-90, Math.min(90, currentRotation[1]));

        // Cancel any existing animation frame
        if (dragRequestId) {
            cancelAnimationFrame(dragRequestId);
        }

        // Schedule rendering on the next animation frame for performance
        dragRequestId = requestAnimationFrame(() => {
            renderGlobe(worldData, currentScale, currentRotation);
            dragRequestId = null;
        });
    }

    // Handle zoom with improved performance
    const zoomBehavior = d3.zoom()
        .scaleExtent([0.3, 4])
        .on('zoom', zoomed);

    svg.call(zoomBehavior);

    let zoomRequestId = null;

    function zoomed(event) {
        const newScale = event.transform.k * config.defaultScale;
        currentScale = Math.min(Math.max(newScale, config.minScale), config.maxScale);

        // Cancel any existing animation frame
        if (zoomRequestId) {
            cancelAnimationFrame(zoomRequestId);
        }

        // Schedule rendering on the next animation frame for performance
        zoomRequestId = requestAnimationFrame(() => {
            renderGlobe(worldData, currentScale, currentRotation);
            zoomRequestId = null;
        });
    }

    // Autorotation function
    function startAutoRotation() {
        config.autoRotate = true;

        if (autoRotateTimer) {
            clearInterval(autoRotateTimer);
        }

        autoRotateTimer = setInterval(() => {
            // FIXED: Make autorotation go in the correct direction (west to east)
            currentRotation[0] += config.rotationSpeed / 100;
            renderGlobe(worldData, currentScale, currentRotation);
        }, 50);
    }

    function stopAutoRotation() {
        config.autoRotate = false;

        if (autoRotateTimer) {
            clearInterval(autoRotateTimer);
            autoRotateTimer = null;
        }
    }

    // Navigate to specific view
    function navigateTo(longitude, latitude) {
        // Stop autorotation if active
        if (config.autoRotate) {
            stopAutoRotation();
        }

        // Animate to the new location
        const startRotation = [...currentRotation];
        // Set target rotation directly (not negated)
        const targetRotation = [longitude, latitude, 0];
        const duration = 1000; // ms
        const startTime = Date.now();

        function animateNavigation() {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Ease in-out function for smoother animation
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            // Interpolate rotation
            currentRotation = [
                startRotation[0] + easeT * (targetRotation[0] - startRotation[0]),
                startRotation[1] + easeT * (targetRotation[1] - startRotation[1]),
                startRotation[2] + easeT * (targetRotation[2] - startRotation[2])
            ];

            renderGlobe(worldData, currentScale, currentRotation);

            if (t < 1) {
                requestAnimationFrame(animateNavigation);
            }
        }

        animateNavigation();
    }

    // Handle click to set POI
    svg.on('click', (event) => {
        // Get click position
        const x = event.clientX;
        const y = event.clientY;

        // Set POI at clicked location
        setPOI(x, y);
    });

    // Handle mousemove for overlay tooltip
    svg.on('mousemove', (event) => {
        if (config.overlayType !== 'none') {
            showOverlayTooltip(event.clientX, event.clientY);
        }
    });

    svg.on('mouseout', () => {
        hideTooltip();
    });

    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            config.width = window.innerWidth;
            config.height = window.innerHeight;

            svg.attr('width', config.width)
                .attr('height', config.height);

            loadingText
                .attr('x', config.width / 2)
                .attr('y', config.height / 2);

            globeGroup.attr('transform', `translate(${config.width / 2}, ${config.height / 2})`);

            renderGlobe(worldData, currentScale, currentRotation);
        }, 100);
    });

    // Initial animation with smooth rendering
    function animateIn() {
        // Start from an interesting angle showing the Atlantic
        const startRotation = [-30, 20, 0];
        const endRotation = [0, 10, 0];
        const duration = 1500;
        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);

            // Ease in-out function for smoother animation
            const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            // Interpolate rotation
            currentRotation = [
                startRotation[0] + easeT * (endRotation[0] - startRotation[0]),
                startRotation[1] + easeT * (endRotation[1] - startRotation[1]),
                startRotation[2] + easeT * (endRotation[2] - startRotation[2])
            ];

            renderGlobe(worldData, currentScale, currentRotation);

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        }

        animate();
    }

    // Fallback to simplified world data if loading fails
    function createSimplifiedWorldData() {
        return {
            type: "Topology",
            objects: {
                land: {
                    type: "GeometryCollection",
                    geometries: [
                        // North America
                        {
                            type: "Polygon",
                            coordinates: [[[-169, 72], [-169, 30], [-60, 11], [-50, 30], [-50, 72], [-169, 72]]]
                        },
                        // South America
                        {
                            type: "Polygon",
                            coordinates: [[[-90, 15], [-90, -60], [-35, -60], [-35, 15], [-90, 15]]]
                        },
                        // Europe
                        {
                            type: "Polygon",
                            coordinates: [[[-10, 35], [-10, 70], [40, 70], [40, 35], [-10, 35]]]
                        },
                        // Africa
                        {
                            type: "Polygon",
                            coordinates: [[[-20, 35], [-20, -40], [50, -40], [50, 35], [-20, 35]]]
                        },
                        // Asia
                        {
                            type: "Polygon",
                            coordinates: [[[40, 35], [40, 80], [180, 80], [180, 35], [40, 35]]]
                        },
                        // Australia
                        {
                            type: "Polygon",
                            coordinates: [[[110, -10], [110, -45], [155, -45], [155, -10], [110, -10]]]
                        },
                        // Antarctica
                        {
                            type: "Polygon",
                            coordinates: [[[-180, -60], [-180, -90], [180, -90], [180, -60], [-180, -60]]]
                        }
                    ]
                }
            }
        };
    }

    // Function to update UI elements based on data availability
    function updateDataAvailabilityUI() {
        // Get all overlay options
        const overlaySelect = document.getElementById('overlay-type');
        const options = overlaySelect.querySelectorAll('option');

        // Update each option based on data availability
        options.forEach(option => {
            const dataType = option.value;
            if (dataType !== 'none') {
                if (!dataAvailable[dataType]) {
                    option.textContent = option.textContent + ' (unavailable)';
                    option.classList.add('unavailable');
                }
            }
        });
    }

    // ==================== MENU FUNCTIONALITY ====================

    // Menu button and panels
    const menuButton = document.getElementById('menu-button');
    const menuPanel = document.getElementById('menu-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsButton = document.getElementById('settings-button');
    const backButton = document.getElementById('back-button');

    // Overlay menu elements
    const overlayTypeSelect = document.getElementById('overlay-type');
    const modeGradientBtn = document.getElementById('mode-gradient');
    const modeVectorBtn = document.getElementById('mode-vector');
    const modeIsolineBtn = document.getElementById('mode-isoline');
    const heightSlider = document.getElementById('height-level');
    const heightValue = document.getElementById('height-value');

    // Menu button functionality
    menuButton.addEventListener('click', () => {
        menuPanel.classList.toggle('visible');
        settingsPanel.classList.remove('visible');
    });

    // Settings button functionality
    settingsButton.addEventListener('click', () => {
        settingsPanel.classList.add('visible');
        menuPanel.classList.remove('visible');
    });

    // Back button functionality
    backButton.addEventListener('click', () => {
        settingsPanel.classList.remove('visible');
        menuPanel.classList.add('visible');
    });

    // Display options
    const graticuleCheckbox = document.getElementById('show-graticule');
    const gridDotsCheckbox = document.getElementById('show-grid-dots');
    const outlineOnlyCheckbox = document.getElementById('outline-only');
    const labelsCheckbox = document.getElementById('show-labels');

    graticuleCheckbox.addEventListener('change', () => {
        config.showGraticule = graticuleCheckbox.checked;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    gridDotsCheckbox.addEventListener('change', () => {
        config.showGridDots = gridDotsCheckbox.checked;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    outlineOnlyCheckbox.addEventListener('change', () => {
        config.outlineOnly = outlineOnlyCheckbox.checked;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    labelsCheckbox.addEventListener('change', () => {
        config.showLabels = labelsCheckbox.checked;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Overlay type selection
    overlayTypeSelect.addEventListener('change', () => {
        config.overlayType = overlayTypeSelect.value;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Display mode buttons
    modeGradientBtn.addEventListener('click', () => {
        config.displayMode = 'gradient';
        modeGradientBtn.classList.add('active');
        modeVectorBtn.classList.remove('active');
        modeIsolineBtn.classList.remove('active');
        renderGlobe(worldData, currentScale, currentRotation);
    });

    modeVectorBtn.addEventListener('click', () => {
        config.displayMode = 'vector';
        modeVectorBtn.classList.add('active');
        modeGradientBtn.classList.remove('active');
        modeIsolineBtn.classList.remove('active');
        renderGlobe(worldData, currentScale, currentRotation);
    });

    modeIsolineBtn.addEventListener('click', () => {
        config.displayMode = 'isoline';
        modeIsolineBtn.classList.add('active');
        modeGradientBtn.classList.remove('active');
        modeVectorBtn.classList.remove('active');
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Height/altitude slider
    heightSlider.addEventListener('input', () => {
        config.height = parseInt(heightSlider.value);
        heightValue.textContent = config.height + ' km';

        if (config.overlayType !== 'none') {
            renderGlobe(worldData, currentScale, currentRotation);
        }
    });

    // Settings panel controls

    // Grid opacity control
    const gridOpacitySlider = document.getElementById('grid-opacity');

    gridOpacitySlider.addEventListener('input', () => {
        config.graticuleOpacity = parseInt(gridOpacitySlider.value) / 100;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Grid color selection
    const gridColorSelect = document.getElementById('grid-color');

    gridColorSelect.addEventListener('change', () => {
        config.graticuleColor = gridColorSelect.value;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Overlay settings
    const overlayOpacitySlider = document.getElementById('overlay-opacity');
    const vectorDensitySlider = document.getElementById('vector-density');
    const isolineSpacingSelect = document.getElementById('isoline-spacing');

    overlayOpacitySlider.addEventListener('input', () => {
        config.overlayOpacity = parseInt(overlayOpacitySlider.value) / 100;
        overlayGroup.style('opacity', config.overlayOpacity);
    });

    vectorDensitySlider.addEventListener('input', () => {
        config.vectorDensity = parseInt(vectorDensitySlider.value);
        if (config.overlayType !== 'none' && config.displayMode === 'vector') {
            renderGlobe(worldData, currentScale, currentRotation);
        }
    });

    isolineSpacingSelect.addEventListener('change', () => {
        config.isolineSpacing = isolineSpacingSelect.value;
        if (config.overlayType !== 'none' && config.displayMode === 'isoline') {
            renderGlobe(worldData, currentScale, currentRotation);
        }
    });

    // Land and ocean color options
    const colorOptions = document.querySelectorAll('.color-option');

    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Get the parent div to determine if this is a land or ocean color
            const isOcean = option.parentNode.textContent.trim().startsWith('Ocean');

            // Remove selected class from all options in this category
            option.parentNode.querySelectorAll('.color-option').forEach(opt => {
                opt.classList.remove('selected');
            });

            // Add selected class to clicked option
            option.classList.add('selected');

            // Set the appropriate color
            if (isOcean) {
                config.oceanColor = option.getAttribute('data-color');
            } else {
                config.landColor = option.getAttribute('data-color');
            }

            renderGlobe(worldData, currentScale, currentRotation);
        });
    });

    // Projection selector
    const projectionSelector = document.getElementById('projection-select');

    projectionSelector.addEventListener('change', () => {
        config.projection = projectionSelector.value;
        renderGlobe(worldData, currentScale, currentRotation);
    });

    // Rotation speed slider
    const rotationSpeedSlider = document.getElementById('rotation-speed');

    rotationSpeedSlider.addEventListener('input', () => {
        config.rotationSpeed = parseInt(rotationSpeedSlider.value);

        if (config.rotationSpeed > 0) {
            startAutoRotation();
        } else {
            stopAutoRotation();
        }
    });

    // View presets (updated with correct coordinates)
    document.getElementById('view-north-america').addEventListener('click', () => navigateTo(-100, 40));
    document.getElementById('view-south-america').addEventListener('click', () => navigateTo(-60, -20));
    document.getElementById('view-europe').addEventListener('click', () => navigateTo(-10, 50));
    document.getElementById('view-africa').addEventListener('click', () => navigateTo(20, 0));
    document.getElementById('view-asia').addEventListener('click', () => navigateTo(100, 35));
    document.getElementById('view-australia').addEventListener('click', () => navigateTo(135, -25));
    document.getElementById('view-pacific').addEventListener('click', () => navigateTo(180, 0));
    document.getElementById('view-atlantic').addEventListener('click', () => navigateTo(-30, 0));

    // ==================== DATA LOADING ====================

    // Load WMM coefficients
    function loadWmmCoefficients() {
        console.log("Loading WMM coefficients from:", config.wmmCofUrl);

        fetch(config.wmmCofUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}, URL: ${response.url}`);
                }
                return response.text();
            })
            .then(data => {
                wmmCoefficients = parseWmmCoefficients(data);
                console.log(`Loaded ${wmmCoefficients.length} WMM coefficients`);

                // Mark magnetic variation data as available
                dataAvailable.magvar = true;

                // Update UI to reflect data availability
                updateDataAvailabilityUI();

                // If current overlay type is magvar, redraw
                if (config.overlayType === 'magvar') {
                    renderGlobe(worldData, currentScale, currentRotation);
                }
            })
            .catch(error => {
                console.error("Error loading WMM coefficients:", error);
                dataAvailable.magvar = false;
                updateDataAvailabilityUI();
            });
    }

    // Load the actual TopoJSON data
    let startTime = Date.now();

    // Load Earth topology data
    fetch(config.topoJsonUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}, URL: ${response.url}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`Data loaded in ${Date.now() - startTime}ms`);

            worldData = data;

            // Remove loading indicator
            loadingText.remove();

            // Update data source information
            updateDataSourceInfo('earth-topo.json');

            // Initial render of the globe
            renderGlobe(worldData, currentScale, currentRotation);

            // Start animation
            animateIn();

            // Load WMM coefficients after the globe is rendered
            loadWmmCoefficients();
        })
        .catch(error => {
            console.error("Error loading TopoJSON:", error);

            // Show error message
            loadingText.text("Using simplified Earth data (couldn't load earth-topo.json)");

            // Use fallback data
            console.log("Using simplified world data as fallback");
            worldData = createSimplifiedWorldData();

            // Update data source information
            updateDataSourceInfo('simplified-data (fallback)');

            // Set a short timeout to allow the error message to be read
            setTimeout(() => {
                loadingText.remove();
                renderGlobe(worldData, currentScale, currentRotation);
                animateIn();

                // Load WMM coefficients after the globe is rendered
                loadWmmCoefficients();
            }, 2000);
        });

    // Update the timestamp in the footer to match the provided time
    document.querySelector('footer').textContent = `Created for httpsTeabagexe | 2025-03-21 17:50:26 UTC`;

    // Update the data info timestamp
    const dataInfo = document.getElementById('data-info');
    if (dataInfo) {
        const span = dataInfo.querySelector('span');
        span.textContent = `Source: earth-topo.json | 2025-03-21 17:50:26 UTC`;
    }
});