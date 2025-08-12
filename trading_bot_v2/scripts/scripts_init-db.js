const Database = require('../src/db');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
    try {
        console.log('🚀 Initializing Crypto Arbitrage Bot Database...');
        
        // Create logs directory if it doesn't exist
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            console.log('✅ Created logs directory');
        }

        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('✅ Created data directory');
        }

        // Initialize default configuration
        await Database.setConfig('bot_version', '2.0.0', 'Bot version');
        await Database.setConfig('initialized_at', new Date().toISOString(), 'Initialization timestamp');
        await Database.setConfig('min_profit_threshold', '1.0', 'Minimum profit threshold in USD');
        await Database.setConfig('poll_interval_ms', '5000', 'Polling interval in milliseconds');
        await Database.setConfig('max_daily_trades', '100', 'Maximum trades per day');
        
        console.log('✅ Database initialized successfully!');
        console.log('🎯 You can now start the bot with: npm start');
        console.log('📊 Dashboard will be available at: http://localhost:3000');
        
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    } finally {
        Database.close();
    }
}

if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };