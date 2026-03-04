const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'datepicker.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS free_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_normalized TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name_normalized, date)
  );
  CREATE INDEX IF NOT EXISTS idx_free_dates_date ON free_dates(date);
  CREATE INDEX IF NOT EXISTS idx_free_dates_name ON free_dates(name_normalized);
`);

const stmts = {
  add: db.prepare(`
    INSERT OR IGNORE INTO free_dates (name, name_normalized, date)
    VALUES (?, ?, ?)
  `),
  remove: db.prepare(`
    DELETE FROM free_dates WHERE name_normalized = ? AND date = ?
  `),
  getByMonth: db.prepare(`
    SELECT name, date FROM free_dates
    WHERE date >= ? AND date < ?
    ORDER BY date
  `),
  getPeople: db.prepare(`
    SELECT DISTINCT name FROM free_dates ORDER BY name_normalized
  `),
};

function normalize(name) {
  return name.trim().toLowerCase();
}

function addFreeDate(name, date) {
  const result = stmts.add.run(name.trim(), normalize(name), date);
  return { added: result.changes > 0 };
}

function removeFreeDate(name, date) {
  const result = stmts.remove.run(normalize(name), date);
  return { removed: result.changes > 0 };
}

function getFreeDatesByMonth(yearMonth) {
  // yearMonth = "YYYY-MM"
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  // Calculate next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const rows = stmts.getByMonth.all(start, end);

  // Group by date
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.date]) {
      grouped[row.date] = [];
    }
    grouped[row.date].push(row.name);
  }
  return grouped;
}

function getPeople() {
  return stmts.getPeople.all().map(r => r.name);
}

module.exports = { addFreeDate, removeFreeDate, getFreeDatesByMonth, getPeople };
