// Script to update WebSocket URLs for production
const fs = require('fs');
const path = require('path');

// Files that need WebSocket URL updates
const htmlFiles = [
    'volume-movers-page.html',
    'gainers-page.html',
    'rising-stocks-page.html'
];

function updateWebSocketUrl(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace WebSocket connection logic to handle both local and production
        const oldWsLogic = `const wsHost = window.location.hostname || 'localhost';
            const wsUrl = 'ws://' + wsHost + ':3051';`;

        const newWsLogic = `const wsHost = window.location.hostname || 'localhost';
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsPort = window.location.hostname === 'localhost' ? ':3051' : '';
            const wsPath = window.location.hostname === 'localhost' ? '' : '/ws';
            const wsUrl = wsProtocol + '//' + wsHost + wsPort + wsPath;`;

        if (content.includes(oldWsLogic)) {
            content = content.replace(oldWsLogic, newWsLogic);
            fs.writeFileSync(filePath, content);
            console.log(`✅ Updated: ${filePath}`);
        } else {
            console.log(`⚠️  Already updated or different format: ${filePath}`);
        }
    } catch (error) {
        console.error(`❌ Error updating ${filePath}:`, error.message);
    }
}

console.log('🔄 Updating WebSocket URLs for production...\n');

htmlFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        updateWebSocketUrl(filePath);
    } else {
        console.log(`❌ File not found: ${file}`);
    }
});

console.log('\n✅ WebSocket URL update complete!');
console.log('\nThe WebSocket connections will now:');
console.log('- Use ws://localhost:3051 for local development');
console.log('- Use wss://daily3club.com/ws for production (proxied through Nginx)');