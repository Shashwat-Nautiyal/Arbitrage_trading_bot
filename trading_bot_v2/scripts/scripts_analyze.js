const Database = require('../src/db');

async function analyzePerformance() {
    try {
        console.log('\n📊 ARBITRAGE BOT PERFORMANCE ANALYSIS\n');
        
        // Get recent opportunities
        const recentOpportunities = await Database.recentScans(1000);
        const profitableOps = recentOpportunities.filter(op => op.estimated_profit > 0);
        
        // Calculate statistics
        const totalOpportunities = recentOpportunities.length;
        const profitableCount = profitableOps.length;
        const profitabilityRate = ((profitableCount / totalOpportunities) * 100).toFixed(2);
        
        const totalProfit = profitableOps.reduce((sum, op) => sum + op.estimated_profit, 0);
        const avgProfit = profitableCount > 0 ? (totalProfit / profitableCount).toFixed(2) : 0;
        const maxProfit = profitableCount > 0 ? Math.max(...profitableOps.map(op => op.estimated_profit)).toFixed(2) : 0;
        
        // Exchange analysis
        const exchangeStats = {};
        profitableOps.forEach(op => {
            const key = `${op.dex_a}_${op.dex_b}`;
            if (!exchangeStats[key]) {
                exchangeStats[key] = { count: 0, totalProfit: 0 };
            }
            exchangeStats[key].count++;
            exchangeStats[key].totalProfit += op.estimated_profit;
        });
        
        console.log(`📈 SUMMARY STATISTICS:`);
        console.log(`Total Opportunities Scanned: ${totalOpportunities}`);
        console.log(`Profitable Opportunities: ${profitableCount}`);
        console.log(`Profitability Rate: ${profitabilityRate}%`);
        console.log(`Total Potential Profit: $${totalProfit.toFixed(2)}`);
        console.log(`Average Profit per Opportunity: $${avgProfit}`);
        console.log(`Maximum Single Opportunity: $${maxProfit}`);
        
        console.log(`\n🔄 TOP EXCHANGE PAIRS:`);
        const sortedExchanges = Object.entries(exchangeStats)
            .sort((a, b) => b[1].totalProfit - a[1].totalProfit)
            .slice(0, 5);
            
        sortedExchanges.forEach(([pair, stats], index) => {
            const [buyExchange, sellExchange] = pair.split('_');
            const avgPairProfit = (stats.totalProfit / stats.count).toFixed(2);
            console.log(`${index + 1}. ${buyExchange} → ${sellExchange}: ${stats.count} opportunities, $${stats.totalProfit.toFixed(2)} total, $${avgPairProfit} avg`);
        });
        
        // Time-based analysis
        const last24h = recentOpportunities.filter(op => 
            Date.now() - op.timestamp < 24 * 60 * 60 * 1000
        );
        const profitable24h = last24h.filter(op => op.estimated_profit > 0);
        
        console.log(`\n⏰ LAST 24 HOURS:`);
        console.log(`Opportunities: ${last24h.length}`);
        console.log(`Profitable: ${profitable24h.length}`);
        console.log(`Rate: ${last24h.length > 0 ? ((profitable24h.length / last24h.length) * 100).toFixed(2) : 0}%`);
        
        // Get daily summary
        const dailySummary = await Database.getDailySummary(7);
        console.log(`\n📅 DAILY BREAKDOWN (Last 7 Days):`);
        dailySummary.forEach(day => {
            console.log(`${day.date}: ${day.profitable_opportunities}/${day.total_opportunities} profitable ($${(day.total_potential_profit || 0).toFixed(2)} potential)`);
        });

        // Export data to CSV
        await exportOpportunitiesToCSV(profitableOps);
        
        console.log(`\n✅ Analysis complete!`);
        
    } catch (error) {
        console.error('❌ Analysis failed:', error);
    } finally {
        Database.close();
    }
}

async function exportOpportunitiesToCSV(opportunities) {
    const fs = require('fs');
    const path = require('path');
    
    const csvDir = path.join(__dirname, '../data');
    if (!fs.existsSync(csvDir)) {
        fs.mkdirSync(csvDir, { recursive: true });
    }
    
    const csvPath = path.join(csvDir, `profitable_opportunities_${new Date().toISOString().split('T')[0]}.csv`);
    
    const headers = 'Date,Exchange A,Exchange B,Pair,Direction,Buy Price,Sell Price,Profit,Spread %\n';
    const rows = opportunities.map(op => {
        const date = new Date(op.timestamp).toISOString();
        return `${date},${op.dex_a},${op.dex_b},${op.pair},${op.direction},${op.buy_price},${op.sell_price},${op.estimated_profit},${op.price_difference_pct}`;
    }).join('\n');
    
    fs.writeFileSync(csvPath, headers + rows);
    console.log(`📄 Exported ${opportunities.length} profitable opportunities to: ${csvPath}`);
}

if (require.main === module) {
    analyzePerformance();
}

module.exports = { analyzePerformance };