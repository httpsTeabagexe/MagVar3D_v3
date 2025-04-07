// js/wmm.js
import { WGS84 } from './config.js';

let wmmCoefficients = null;
let wmmEpoch = 2025.0; // Default epoch

/**
 * Factorial helper
 */
function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
}

/**
 * Simplified Legendre function (placeholder - real WMM needs proper Schmidt polynomials)
 */
function legendreP(n, m, x) {
    // VERY basic placeholder. A real implementation needs proper recurrence relations.
    if (m < 0 || m > n || Math.abs(x) > 1) return 0;
    if (n === 0 && m === 0) return 1;
    if (n === 1 && m === 0) return x;
    if (n === 1 && m === 1) return -Math.sqrt(1 - x * x);
    if (n === 2 && m === 0) return 0.5 * (3 * x * x - 1);
    if (n === 2 && m === 1) return -3 * x * Math.sqrt(1 - x * x);
    if (n === 2 && m === 2) return 3 * (1 - x * x);
    // Add more terms or use recurrence if needed for higher degrees/orders
    // For now, return 0 for unhandled cases
    return 0;
    // Note: This needs Schmidt quasi-normalization factor applied separately.
}

/**
 * Simplified derivative of Legendre (placeholder)
 */
function legendrePD(n, m, x) {
    // Placeholder derivative calculation
    if (m < 0 || m > n || Math.abs(x) > 1) return 0;
    const h = 0.001;
    // Use central difference for approximation if P is defined nearby
    if(Math.abs(x+h) <= 1 && Math.abs(x-h) <= 1){
        return (legendreP(n, m, x + h) - legendreP(n, m, x - h)) / (2 * h);
    } else if (Math.abs(x+h) <= 1) { // Forward difference
        return (legendreP(n, m, x + h) - legendreP(n, m, x)) / h;
    } else if (Math.abs(x-h) <= 1) { // Backward difference
        return (legendreP(n, m, x) - legendreP(n, m, x - h)) / h;
    }
    return 0; // Default if cannot compute derivative
}


/**
 * Parse WMM coefficient file data
 */
function parseWmmCoefficients(data) {
    const lines = data.trim().split('\n');
    const coeffs = [];
    const headerMatch = lines[0].trim().match(/(\d+\.\d+)\s+(\S+)\s+(.+)/);
    if (headerMatch) {
        wmmEpoch = parseFloat(headerMatch[1]);
        console.log(`Loaded WMM model: ${headerMatch[2]}, epoch ${wmmEpoch}, dated ${headerMatch[3]}`);
    } else {
        console.warn("Could not parse WMM header.");
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.indexOf('9999') === 0 || line.length < 10) continue; // Skip end marker or short lines
        const values = line.split(/\s+/).map(v => parseFloat(v));
        if (values.length >= 6) {
            coeffs.push({
                n: values[0], m: values[1], g: values[2], h: values[3], gDot: values[4], hDot: values[5]
            });
        }
    }
    return coeffs;
}

/**
 * Calculate magnetic variation (declination) using WMM
 * WARNING: Uses simplified Legendre placeholders. Accuracy is limited.
 */
export function calculateMagneticVariation(longitude, latitude, altitudeKm, date) {
    if (!wmmCoefficients) return null; // Indicate data not ready

    const lonRad = longitude * Math.PI / 180;
    const latRad = latitude * Math.PI / 180;
    const altM = altitudeKm * 1000;
    const yearsSinceEpoch = date - wmmEpoch;

    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    // Geocentric coordinates (simplified - assuming spherical Earth for WMM radius)
    const r = WGS84.a + altM; // Use WGS84 mean radius + altitude
    const geocentricLat = latRad; // Approximation: geocentric lat ~= geodetic lat for WMM
    const sinPhi = Math.sin(geocentricLat);
    const cosPhi = Math.cos(geocentricLat);

    // WMM reference radius (km)
    const a_ref = 6371.2;
    const r_km = r / 1000; // Radius in km

    let X = 0, Y = 0, Z = 0; // North, East, Down components in geocentric frame

    for (const coeff of wmmCoefficients) {
        const n = coeff.n;
        const m = coeff.m;
        if (n === 0) continue; // n starts from 1

        const g = coeff.g + coeff.gDot * yearsSinceEpoch;
        const h = coeff.h + coeff.hDot * yearsSinceEpoch;

        const ratio_a_r = a_ref / r_km;
        const ratio_pow_n1 = Math.pow(ratio_a_r, n + 1);
        const ratio_pow_n2 = Math.pow(ratio_a_r, n + 2); // Used in B calculations

        // Schmidt quasi-normalized Legendre polynomials P_n^m(sinPhi) and derivatives dP/dPhi
        // WARNING: Using simplified placeholders! Replace with accurate calculation.
        const Pnm = legendreP(n, m, sinPhi);
        const dPnm = legendrePD(n, m, sinPhi); // Derivative w.r.t sinPhi, needs chain rule for dPhi

        // Schmidt normalization factor (simplified, often combined in Pnm calculation)
        let schmidtFactor = 1.0; // Placeholder
        // if (m > 0) {
        //     schmidtFactor = Math.sqrt(2 * factorial(n - m) / factorial(n + m));
        // }
        // Note: Proper implementations often use recursive formulas that include normalization.

        const Pnm_norm = Pnm * schmidtFactor;
        const dPnm_dPhi_norm = dPnm * cosPhi * schmidtFactor; // Apply chain rule dP/dPhi = dP/d(sinPhi) * cosPhi

        const cos_m_lon = Math.cos(m * lonRad);
        const sin_m_lon = Math.sin(m * lonRad);

        // Calculate Br, Btheta, Bphi (radial, colatitude, longitude components)
        // Br = -Sum[(n+1) * (a/r)^(n+2) * (g*cos + h*sin) * Pnm]
        // Btheta = Sum[(a/r)^(n+2) * (g*cos + h*sin) * dPnm/dtheta]
        // Bphi = Sum[(a/r)^(n+2) * m/cos(theta) * (g*sin - h*cos) * Pnm]
        // theta = colatitude = PI/2 - phi

        // Radial component (approx = -Z in NED frame if lat=geocentric)
        Z += -(n + 1) * ratio_pow_n2 * (g * cos_m_lon + h * sin_m_lon) * Pnm_norm;

        // North component (approx = -Btheta)
        X += -ratio_pow_n2 * (g * cos_m_lon + h * sin_m_lon) * dPnm_dPhi_norm; // Note the sign convention

        // East component (approx = Bphi)
        if (cosPhi !== 0) {
            Y += ratio_pow_n2 * m / cosPhi * (g * sin_m_lon - h * cos_m_lon) * Pnm_norm;
        }
    }


    // Convert magnetic field vector from geocentric (Xnorth, Yeast, Zdown)
    // back to geodetic coordinates if necessary (complex rotation).
    // For declination, often the geocentric approximation is used directly.

    // Calculate Declination (D) = atan2(Y / X)
    const declinationRad = Math.atan2(Y, X);
    const declinationDeg = declinationRad * 180 / Math.PI;

    return declinationDeg;
}


/**
 * Get current date as decimal year
 */
export function getCurrentDecimalYear() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const diff = now - start;
    const dayOfYear = Math.floor(diff / 86400000); // 0-based day index
    const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    return year + dayOfYear / daysInYear;
}

/**
 * Load and parse WMM coefficients from a URL
 */
export async function loadWmmData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        }
        const data = await response.text();
        wmmCoefficients = parseWmmCoefficients(data);
        console.log(`Loaded ${wmmCoefficients.length} WMM coefficients from ${url}. Epoch: ${wmmEpoch}`);
        return true; // Indicate success
    } catch (error) {
        console.error("Error loading WMM coefficients:", error);
        wmmCoefficients = null; // Ensure it's null on failure
        return false; // Indicate failure
    }
}