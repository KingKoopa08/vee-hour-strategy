#!/usr/bin/env node
// Script to fix WebSocket URL for direct IP access

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing WebSocket URL for direct IP access...\n');

const htmlFile = 'volume-movers-page.html';
const filePath = path.join(__dirname, htmlFile);

if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${htmlFile}`);
    process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the WebSocket URL logic
const oldPattern = /\/\/ Connect to WebSocket\s+function connect\(\) \{\s+const wsHost = window\.location\.hostname \|\| 'localhost';\s+const wsProtocol = window\.location\.protocol === 'https:' \? 'wss:' : 'ws:';\s+const wsPort = window\.location\.hostname === 'localhost' \? ':3051' : '';\s+const wsPath = window\.location\.hostname === 'localhost' \? '' : '\/ws';\s+const wsUrl = wsProtocol \+ '\/\/' \+ wsHost \+ wsPort \+ wsPath;/s;

const newWebSocketLogic = `        // Connect to WebSocket
        function connect() {
            const wsHost = window.location.hostname || 'localhost';
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

            // Handle different environments
            let wsUrl;
            if (wsHost === 'localhost' || wsHost === '127.0.0.1') {
                // Local development
                wsUrl = \`ws://\${wsHost}:3051\`;
            } else if (wsHost === 'daily3club.com') {
                // Production domain with nginx proxy
                wsUrl = \`\${wsProtocol}//\${wsHost}/ws\`;
            } else {
                // Direct IP access - connect directly to WebSocket port
                wsUrl = \`ws://\${wsHost}:3051\`;
            }`;

// Simple find and replace approach
const oldLogic = `            const wsHost = window.location.hostname || 'localhost';
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsPort = window.location.hostname === 'localhost' ? ':3051' : '';
            const wsPath = window.location.hostname === 'localhost' ? '' : '/ws';
            const wsUrl = wsProtocol + '//' + wsHost + wsPort + wsPath;`;

const newLogic = `            const wsHost = window.location.hostname || 'localhost';
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

            // Handle different environments
            let wsUrl;
            if (wsHost === 'localhost' || wsHost === '127.0.0.1') {
                // Local development
                wsUrl = \`ws://\${wsHost}:3051\`;
            } else if (wsHost === 'daily3club.com') {
                // Production domain with nginx proxy
                wsUrl = \`\${wsProtocol}//\${wsHost}/ws\`;
            } else {
                // Direct IP access - connect directly to WebSocket port
                wsUrl = \`ws://\${wsHost}:3051\`;
            }`;

if (content.includes(oldLogic)) {
    content = content.replace(oldLogic, newLogic);
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated: ${htmlFile}`);
    console.log('\n✅ WebSocket URL fix complete!');
    console.log('\nThe WebSocket connections will now:');
    console.log('- Use ws://localhost:3051 for local development');
    console.log('- Use wss://daily3club.com/ws for production domain');
    console.log('- Use ws://IP:3051 for direct IP access (like 15.204.86.6)');
} else {
    console.log(`⚠️  WebSocket logic not found or already updated in ${htmlFile}`);
}