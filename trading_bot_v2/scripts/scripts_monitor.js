const Database = require('../src/db');

class BotMonitor {
    constructor(refreshInterval = 10000) {
        this.refreshInterval = refreshInterval;
        this.isRunning = false;
        this.stats = {
            totalScans: 0,
            profitableOpportunities: 0,
            lastUpdateTime: null,
            bestOpportunity: null
        };
    }

    async start() {
        console.clear();
        console.log('🤖 CRYPTO ARBITRAGE BOT MONITOR');
        console.log('================================\n');
        console.log('Press Ctrl+C to exit\n');
        
        this.isRunning = true;
        
        // Initial display
        await this.updateDisplay();
        
        // Start refresh timer
        this.intervalId = setInterval(async () => {
            if (this.isRunning) {
                await this.updateDisplay();
            }
        }, this.refreshInterval);
    }

    async updateDisplay() {
        try {
            // Clear screen and move cursor to top
            console.clear();
            
            console.log('🤖 CRYPTO ARBITRAGE BOT MONITOR');
            console.log('================================');
            console.log(`Last Update: ${new Date().toISOString()}\n`);
            
            // Get recent data
            const recentScans = await Database.recentScans(100);
            const profitableOps = recentScans.filter(op => op.estimated_profit > 0);
            const last24h = recentScans.filter(op => 
                Date.now() - op.timestamp < 24 * 60 * 60 * 1000
            );
            const profitable24h = last24h.filter(op => op.estimated_profit > 0);
            
            // Calculate metrics
            const totalProfit24h = profitable24h.reduce((sum, op) => sum + op.estimated_profit, 0);
            const successRate = last24h.length > 0 ? 
                ((profitable24h.length / last24h.length) * 100).toFixed(2) : 0;
            
            const bestOp = profitableOps.length > 0 ? 
                profitableOps.reduce((max, op) => 
                    op.estimated_profit > max.estimated_profit ? op : max
                ) : null;
            
            // Display current status
            console.log('📊 CURRENT STATUS:');
            console.log('==================');
            console.log(`Total Scans (24h):          ${last24h.length}`);
            console.log(`Profitable Opportunities:   ${profitable24h.length}`);
            console.log(`Success Rate:               ${successRate}%`);
            console.log(`Total Potential Profit:     $${totalProfit24h.toFixed(2)}`);
            
            if (bestOp) {
                const timeAgo = Math.round((Date.now() - bestOp.timestamp) / (1000 * 60));
                console.log(`Best Opportunity:           $${bestOp.estimated_profit.toFixed(2)} (${timeAgo}m ago)`);
                console.log(`Best Pair:                  ${bestOp.dex_a} → ${bestOp.dex_b}`);
            }
            
            console.log('\n📈 RECENT OPPORTUNITIES:');
            console.log('========================');
            
            const recentProfitable = profitableOps.slice(0, 5);
            if (recentProfitable.length > 0) {
                recentProfitable.forEach((op, index) => {
                    const timeAgo = Math.round((Date.now() - op.timestamp) / (1000 * 60));
                    const spread = op.price_difference_pct.toFixed(3);
                    console.log(`${index + 1}. $${op.estimated_profit.toFixed(2)} | ${op.dex_a}→${op.dex_b} | ${spread}% | ${timeAgo}m ago`);
                });
            } else {
                console.log('No profitable opportunities detected recently');
            }
            
            // Exchange prices
            console.log('\n💱 CURRENT EXCHANGE PRICES:');
            console.log('===========================');
            
            // Get latest price for each exchange
            const exchanges = ['Uniswap', 'Sushiswap', 'Quickswap'];
            for (const exchange of exchanges) {
                const latestPrice = recentScans.find(op => 
                    op.dex_a === exchange || op.dex_b === exchange
                );
                
                if (latestPrice) {
                    const price = latestPrice.dex_a === exchange ? 
                        latestPrice.buy_price : latestPrice.sell_price;
                    const timeAgo = Math.round((Date.now() - latestPrice.timestamp) / (1000 * 60));
                    console.log(`${exchange.padEnd(12)} $${price.toFixed(2)} (${timeAgo}m ago)`);
                }
            }
            
            // System info
            const uptime = Math.round(process.uptime() / 60);
            const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            
            console.log('\n⚙️  SYSTEM INFO:');
            console.log('================');
            console.log(`Monitor Uptime:             ${uptime} minutes`);
            console.log(`Memory Usage:               ${memUsage} MB`);
            console.log(`Refresh Interval:           ${this.refreshInterval / 1000}s`);
            
            console.log('\n💡 Press Ctrl+C to exit monitor');
            
        } catch (error) {
            console.error('❌ Monitor update failed:', error.message);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        Database.close();
        console.log('\n👋 Bot monitor stopped');
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    if (global.monitor) {
        global.monitor.stop();
    }
    process.exit(0);
});

if (require.main === module) {
    const refreshInterval = parseInt(process.argv[2]) || 10000;
    global.monitor = new BotMonitor(refreshInterval);
    global.monitor.start().catch(error => {
        console.error('❌ Monitor failed to start:', error);
        process.exit(1);
    });
}

module.exports = BotMonitor;