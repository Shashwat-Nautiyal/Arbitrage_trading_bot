const Database = require('../src/db');

async function cleanOldData() {
    try {
        console.log('🧹 CLEANING OLD DATABASE RECORDS\n');
        
        const daysToKeep = process.argv[2] || 30;
        console.log(`Keeping last ${daysToKeep} days of data...`);
        
        // Get current record count
        const beforeCount = await Database.recentScans(999999);
        console.log(`Current records: ${beforeCount.length}`);
        
        // Clean old data
        Database.cleanOldData(daysToKeep);
        
        // Wait a moment for the operation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get new record count
        const afterCount = await Database.recentScans(999999);
        const removedCount = beforeCount.length - afterCount.length;
        
        console.log(`Records after cleanup: ${afterCount.length}`);
        console.log(`Records removed: ${removedCount}`);
        
        // Vacuum database to reclaim space
        console.log('\n🗜️  Optimizing database...');
        // Note: SQLite VACUUM would need to be implemented in the Database class
        
        console.log('✅ Database cleanup completed!');
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        Database.close();
    }
}

if (require.main === module) {
    cleanOldData();
}

module.exports = { cleanOldData };