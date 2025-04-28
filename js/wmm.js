// js/wmm.js
import geomagnetism from 'geomagnetism'; // Import the library

/**
 * Get current date as decimal year
 * (Keeping this useful utility function)
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
 * Convert a decimal year (e.g., 2023.5) to a JavaScript Date object.
 * @param {number} decimalYear - The decimal year.
 * @returns {Date} The corresponding Date object.
 */
function decimalYearToDate(decimalYear) {
    const year = Math.floor(decimalYear);
    const remainder = decimalYear - year;
    const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
    const dayOfYear = Math.floor(remainder * daysInYear); // 0-based day index
    const date = new Date(Date.UTC(year, 0, 0)); // Start of the year
    date.setUTCDate(dayOfYear); // Add the calculated days
    return date;
}


/**
 * Calculate magnetic variation (declination) using the geomagnetism library.
 * This function now uses the accurate WMM model provided by the library.
 *
 * @param {number} longitude - Longitude in decimal degrees.
 * @param {number} latitude - Latitude in decimal degrees.
 * @param {number} altitudeKm - Altitude in kilometers above mean sea level.
 * @param {number} decimalYear - Date as a decimal year (e.g., 2023.5).
 * @returns {number | null} Magnetic declination in degrees, or null if calculation fails.
 */
export function calculateMagneticVariation(longitude, latitude, altitudeKm, decimalYear) {
    try {
        // The library expects altitude in meters
        const altitudeMeters = altitudeKm * 1000;

        // Convert decimal year to Date object for the library
        const dateObject = decimalYearToDate(decimalYear);

        // Get the magnetic model for the specified date
        // The library automatically uses the correct WMM coefficients based on the date
        const model = geomagnetism.model(dateObject); // <-- Pass Date object here

        // Get all magnetic field components
        const geo = model.point({
            lat: latitude,
            lon: longitude,
            alt: altitudeMeters
        });

        // Return the declination (often denoted as 'dec' or 'decl')
        if (geo && typeof geo.decl === 'number') {
            return geo.decl;
        } else {
            console.warn(`Geomagnetism calculation failed for ${latitude}, ${longitude}, ${altitudeKm}km, ${decimalYear}`);
            return null;
        }
    } catch (error) {
        // Add a check for the specific error related to date
        if (error instanceof TypeError && error.message.includes("date.getTime is not a function")) {
            console.error(`Error calculating magnetic variation: Invalid date format passed to geomagnetism.model. Input decimalYear: ${decimalYear}`, error);
        } else {
            console.error(`Error calculating magnetic variation for ${latitude}, ${longitude}, ${altitudeKm}km, ${decimalYear}:`, error);
        }
        return null;
    }
}

// /**
//  * Placeholder for any asynchronous initialization if needed in the future.
//  * Currently, geomagnetism initializes synchronously with bundled coefficients.
//  * @returns {Promise<boolean>} Always resolves true currently.
//  */
// export async function loadWmmData() {
//     // No external WMM.COF loading needed with this library
//     console.log("Geomagnetism library initialized with internal WMM model.");
//     return true; // Indicate success
// }

// Remove the old functions and variables:
// - factorial
// - legendreP
// - legendrePD
// - parseWmmCoefficients
// - wmmCoefficients
// - wmmEpoch (library handles epoch internally)
