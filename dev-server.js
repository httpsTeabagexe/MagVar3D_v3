// dev-server.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.argv[2] || 8080;

// Serve static files with proper MIME types
app.use(express.static('.', {
    setHeaders: (res, path) => {
        if (path.endsWith('.geojson')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// For SPA routing - serve index.html for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});