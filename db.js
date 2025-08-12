const Database = require('better-sqlite3');
const db = new Database('arbitrage.db');

// init tables
db.prepare(`
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    dex_a TEXT,
    dex_b TEXT,
    pair TEXT,
    amount_in REAL,
    direction TEXT,
    buy_price REAL,
    sell_price REAL,
    estimated_profit REAL
  )
`).run();

module.exports = {
  insertScan: (record) => {
    const stmt = db.prepare(`INSERT INTO scans
      (timestamp,dex_a,dex_b,pair,amount_in,direction,buy_price,sell_price,estimated_profit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
      record.timestamp,
      record.dex_a,
      record.dex_b,
      record.pair,
      record.amount_in,
      record.direction,
      record.buy_price,
      record.sell_price,
      record.estimated_profit
    );
  },
  recentScans: (limit=50) => {
    return db.prepare(`SELECT * FROM scans ORDER BY timestamp DESC LIMIT ?`).all(limit);
  }
};
