const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor(dbPath = 'arbitrage_bot.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.init();
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('Connected to SQLite database:', this.dbPath);
        });
        this.createTables();
    }

    createTables() {
        const schema = `
            -- Main table for storing arbitrage scan results
            CREATE TABLE IF NOT EXISTS arbitrage_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                dex_a TEXT NOT NULL,
                dex_b TEXT NOT NULL,
                pair TEXT NOT NULL,
                amount_in REAL NOT NULL,
                direction TEXT NOT NULL,
                buy_price REAL NOT NULL,
                sell_price REAL NOT NULL,
                price_difference REAL NOT NULL,
                price_difference_pct REAL NOT NULL,
                estimated_profit REAL NOT NULL,
                gas_cost_estimate REAL DEFAULT 0,
                execution_status TEXT DEFAULT 'detected',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Table for storing individual exchange prices
            CREATE TABLE IF NOT EXISTS price_feeds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exchange TEXT NOT NULL,
                pair TEXT NOT NULL,
                price REAL NOT NULL,
                volume REAL,
                liquidity_token0 REAL,
                liquidity_token1 REAL,
                timestamp INTEGER NOT NULL,
                block_number INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Table for tracking successful arbitrage executions
            CREATE TABLE IF NOT EXISTS executed_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id INTEGER,
                transaction_hash TEXT,
                buy_exchange TEXT NOT NULL,
                sell_exchange TEXT NOT NULL,
                pair TEXT NOT NULL,
                amount_in REAL NOT NULL,
                amount_out REAL NOT NULL,
                actual_profit REAL NOT NULL,
                gas_used REAL,
                gas_cost REAL,
                execution_time REAL,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (scan_id) REFERENCES arbitrage_scans (id)
            );

            -- Table for storing configuration and settings
            CREATE TABLE IF NOT EXISTS bot_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL,
                description TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Table for tracking bot performance metrics
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL,
                total_scans INTEGER DEFAULT 0,
                opportunities_found INTEGER DEFAULT 0,
                trades_executed INTEGER DEFAULT 0,
                successful_trades INTEGER DEFAULT 0,
                failed_trades INTEGER DEFAULT 0,
                total_profit REAL DEFAULT 0,
                total_gas_cost REAL DEFAULT 0,
                net_profit REAL DEFAULT 0,
                success_rate REAL DEFAULT 0,
                avg_profit_per_trade REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Indexes for better query performance
            CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_timestamp ON arbitrage_scans(timestamp);
            CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_pair ON arbitrage_scans(pair);
            CREATE INDEX IF NOT EXISTS idx_arbitrage_scans_profit ON arbitrage_scans(estimated_profit);
            CREATE INDEX IF NOT EXISTS idx_price_feeds_exchange_pair ON price_feeds(exchange, pair);
            CREATE INDEX IF NOT EXISTS idx_price_feeds_timestamp ON price_feeds(timestamp);
            CREATE INDEX IF NOT EXISTS idx_executed_trades_status ON executed_trades(status);
            CREATE INDEX IF NOT EXISTS idx_performance_metrics_date ON performance_metrics(date);

            -- Views for common queries
            CREATE VIEW IF NOT EXISTS profitable_opportunities AS
            SELECT 
                id,
                timestamp,
                dex_a,
                dex_b,
                pair,
                direction,
                buy_price,
                sell_price,
                estimated_profit,
                price_difference_pct,
                datetime(timestamp/1000, 'unixepoch') as human_timestamp
            FROM arbitrage_scans
            WHERE estimated_profit > 0
            ORDER BY estimated_profit DESC;

            CREATE VIEW IF NOT EXISTS daily_summary AS
            SELECT 
                DATE(datetime(timestamp/1000, 'unixepoch')) as date,
                COUNT(*) as total_opportunities,
                COUNT(CASE WHEN estimated_profit > 0 THEN 1 END) as profitable_opportunities,
                AVG(estimated_profit) as avg_profit,
                MAX(estimated_profit) as max_profit,
                SUM(estimated_profit) as total_potential_profit
            FROM arbitrage_scans
            GROUP BY DATE(datetime(timestamp/1000, 'unixepoch'))
            ORDER BY date DESC;
        `;

        this.db.exec(schema, (err) => {
            if (err) {
                console.error('Error creating database schema:', err.message);
                throw err;
            }
            console.log('Database schema created successfully');
        });
    }

    // Insert arbitrage scan result
    insertScan(data) {
        const {
            timestamp, dex_a, dex_b, pair, amount_in, direction,
            buy_price, sell_price, estimated_profit
        } = data;

        const price_difference = Math.abs(sell_price - buy_price);
        const price_difference_pct = ((price_difference / buy_price) * 100);

        const sql = `INSERT INTO arbitrage_scans 
            (timestamp, dex_a, dex_b, pair, amount_in, direction, buy_price, sell_price, 
             price_difference, price_difference_pct, estimated_profit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        this.db.run(sql, [
            timestamp, dex_a, dex_b, pair, amount_in, direction,
            buy_price, sell_price, price_difference, price_difference_pct, estimated_profit
        ], function(err) {
            if (err) {
                console.error('Error inserting scan:', err.message);
            } else {
                console.log(`Inserted scan with ID: ${this.lastID}`);
            }
        });
    }

    // Insert price feed data
    insertPriceFeed(data) {
        const {
            exchange, pair, price, volume, liquidity_token0, liquidity_token1,
            timestamp, block_number
        } = data;

        const sql = `INSERT INTO price_feeds 
            (exchange, pair, price, volume, liquidity_token0, liquidity_token1, timestamp, block_number) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        this.db.run(sql, [
            exchange, pair, price, volume, liquidity_token0, liquidity_token1,
            timestamp, block_number
        ], function(err) {
            if (err) {
                console.error('Error inserting price feed:', err.message);
            }
        });
    }

    // Insert executed trade
    insertExecutedTrade(data) {
        const sql = `INSERT INTO executed_trades 
            (scan_id, transaction_hash, buy_exchange, sell_exchange, pair, amount_in, 
             amount_out, actual_profit, gas_used, gas_cost, execution_time, status, 
             error_message, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        this.db.run(sql, [
            data.scan_id, data.transaction_hash, data.buy_exchange, data.sell_exchange,
            data.pair, data.amount_in, data.amount_out, data.actual_profit,
            data.gas_used, data.gas_cost, data.execution_time, data.status,
            data.error_message, data.timestamp
        ], function(err) {
            if (err) {
                console.error('Error inserting executed trade:', err.message);
            } else {
                console.log(`Inserted executed trade with ID: ${this.lastID}`);
            }
        });
    }

    // Get recent scans
    recentScans(limit = 100) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM arbitrage_scans 
                        ORDER BY timestamp DESC LIMIT ?`;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    console.error('Error fetching recent scans:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get profitable opportunities
    getProfitableOpportunities(limit = 50) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM profitable_opportunities LIMIT ?`;
            
            this.db.all(sql, [limit], (err, rows) => {
                if (err) {
                    console.error('Error fetching profitable opportunities:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get daily summary
    getDailySummary(days = 7) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM daily_summary LIMIT ?`;
            
            this.db.all(sql, [days], (err, rows) => {
                if (err) {
                    console.error('Error fetching daily summary:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get performance metrics for a date range
    getPerformanceMetrics(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM performance_metrics 
                        WHERE date BETWEEN ? AND ? 
                        ORDER BY date DESC`;
            
            this.db.all(sql, [startDate, endDate], (err, rows) => {
                if (err) {
                    console.error('Error fetching performance metrics:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Update daily performance metrics
    updateDailyMetrics(date) {
        const sql = `
            INSERT OR REPLACE INTO performance_metrics 
            (date, total_scans, opportunities_found, total_profit, net_profit, avg_profit_per_trade)
            SELECT 
                DATE(datetime(timestamp/1000, 'unixepoch')) as date,
                COUNT(*) as total_scans,
                COUNT(CASE WHEN estimated_profit > 0 THEN 1 END) as opportunities_found,
                SUM(estimated_profit) as total_profit,
                SUM(estimated_profit) as net_profit,
                AVG(estimated_profit) as avg_profit_per_trade
            FROM arbitrage_scans 
            WHERE DATE(datetime(timestamp/1000, 'unixepoch')) = ?
        `;

        this.db.run(sql, [date], function(err) {
            if (err) {
                console.error('Error updating daily metrics:', err.message);
            } else {
                console.log(`Updated daily metrics for ${date}`);
            }
        });
    }

    // Get configuration value
    getConfig(key) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT value FROM bot_config WHERE key = ?`;
            
            this.db.get(sql, [key], (err, row) => {
                if (err) {
                    console.error('Error fetching config:', err.message);
                    reject(err);
                } else {
                    resolve(row ? row.value : null);
                }
            });
        });
    }

    // Set configuration value
    setConfig(key, value, description = null) {
        const sql = `INSERT OR REPLACE INTO bot_config 
                    (key, value, description, updated_at) 
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
        
        this.db.run(sql, [key, value, description], function(err) {
            if (err) {
                console.error('Error setting config:', err.message);
            } else {
                console.log(`Updated config: ${key} = ${value}`);
            }
        });
    }

    // Clean old data (older than specified days)
    cleanOldData(days = 30) {
        const sql = `DELETE FROM arbitrage_scans 
                    WHERE datetime(timestamp/1000, 'unixepoch') < datetime('now', '-${days} days')`;
        
        this.db.run(sql, function(err) {
            if (err) {
                console.error('Error cleaning old data:', err.message);
            } else {
                console.log(`Cleaned ${this.changes} old records`);
            }
        });
    }

    // Close database connection
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = new Database();