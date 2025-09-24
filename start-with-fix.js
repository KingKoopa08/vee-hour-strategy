const originalFile = require('./unified-scanner.js');
// Force the WebSocket fix in the HTML response
const express = require('express');
const app = express();

// Override the /gainers route
app.get('/gainers', (req, res) => {
    // Get the original HTML
    let html = `[ORIGINAL HTML WILL BE HERE]`;

    // Replace the WebSocket code
    html = html.replace(
        "const wsUrl = 'ws://' + wsHost + ':3051';",
        `const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol === 'wss:' ? protocol + '//' + wsHost + '/ws' : protocol + '//' + wsHost + ':3051';`
    );

    res.send(html);
});

// Start the server
console.log('Starting with WebSocket fix wrapper...');
