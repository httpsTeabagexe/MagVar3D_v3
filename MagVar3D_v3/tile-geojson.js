// Usage: node tile-geojson.js ne_110m_land.geojson 110m 36 tiles
//        node tile-geojson.js ne_50m_land.geojson 50m 18 tiles

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

if (process.argv.length < 6) {
    console.error("Usage: node tile-geojson.js input.geojson LODNAME tileSizeDeg outputDir");
    process.exit(1);
}

const [,, inputFile, lod, tileSizeDeg, outputDir] = process.argv;

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const geojson = JSON.parse(fs.readFileSync(inputFile));

const tileSize = Number(tileSizeDeg);

for (let lon = -180; lon < 180; lon += tileSize) {
    for (let lat = -90; lat < 90; lat += tileSize) {
        const tileBbox = [lon, lat, lon + tileSize, lat + tileSize];
        const tilePoly = turf.bboxPolygon(tileBbox);

        const features = geojson.features.filter(f =>
            turf.booleanIntersects(tilePoly, f)
        );

        if (features.length > 0) {
            const tileGeojson = {
                type: "FeatureCollection",
                features
            };
            const fname = `land_${lod}_${lon}_${lat}.json`;
            fs.writeFileSync(path.join(outputDir, fname), JSON.stringify(tileGeojson));
            console.log(`Wrote ${fname} (${features.length} features)`);
        }
    }
}