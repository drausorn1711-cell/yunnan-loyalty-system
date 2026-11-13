const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;
const dbDir = isVercel ? '/tmp' : __dirname;
const dbPath = path.join(dbDir, 'loyalty.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high performance
db.exec(`PRAGMA journal_mode = WAL;`);

// Initialize Database Tables
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      store_name TEXT NOT NULL,
      store_tagline TEXT,
      point_rate REAL DEFAULT 1.0,
      liff_url TEXT DEFAULT '',
      currency_symbol TEXT DEFAULT '฿',
      silver_min REAL DEFAULT 0,
      silver_multiplier REAL DEFAULT 1.0,
      gold_min REAL DEFAULT 1000,
      gold_multiplier REAL DEFAULT 1.2,
      platinum_min REAL DEFAULT 3000,
      platinum_multiplier REAL DEFAULT 1.5,
      diamond_min REAL DEFAULT 8000,
      diamond_multiplier REAL DEFAULT 2.0,
      theme_primary TEXT DEFAULT '#064e3b',
      line_channel_access_token TEXT DEFAULT '',
      line_channel_secret TEXT DEFAULT '',
      slipok_api_key TEXT DEFAULT '',
      slipok_branch_id TEXT DEFAULT '',
      store_bank_account TEXT DEFAULT '',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_slips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_ref TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      member_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      tier TEXT DEFAULT 'Silver',
      total_spent REAL DEFAULT 0,
      points_balance INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'ของพรีเมียม',
      points_required INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 10,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      min_tier TEXT DEFAULT 'Silver',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_code TEXT UNIQUE NOT NULL,
      member_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      purchase_amount REAL DEFAULT 0,
      points INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_code TEXT UNIQUE NOT NULL,
      member_id INTEGER NOT NULL,
      reward_id INTEGER NOT NULL,
      reward_name TEXT NOT NULL,
      points_spent INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      redeemed_at TEXT,
      FOREIGN KEY(member_id) REFERENCES members(id),
      FOREIGN KEY(reward_id) REFERENCES rewards(id)
    );
  `);

  // Add columns to settings if not existing
  const newCols = [
    'line_channel_access_token',
    'line_channel_secret',
    'slipok_api_key',
    'slipok_branch_id',
    'store_bank_account'
  ];
  for (const col of newCols) {
    try {
      db.exec(`ALTER TABLE settings ADD COLUMN ${col} TEXT DEFAULT '';`);
    } catch (e) {
      // Column already exists
    }
  }

  // Initialize or update settings for Yunnan Import
  const checkSettings = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (!checkSettings || checkSettings.count === 0) {
    db.prepare(`
      INSERT INTO settings (
        id, store_name, store_tagline, point_rate, liff_url,
        silver_min, silver_multiplier,
        gold_min, gold_multiplier,
        platinum_min, platinum_multiplier,
        diamond_min, diamond_multiplier,
        updated_at
      ) VALUES (
        1, 'ยูนนาน YUNNAN IMPORT', 'ระบบสะสมแต้มและสิทธิประโยชน์สมาชิก ยูนนาน (1 บาท = 1 แต้ม)',
        1.0, 'https://yunnan-loyalty-system.vercel.app/member.html',
        0, 1.0,
        1000, 1.2,
        3000, 1.5,
        8000, 2.0,
        datetime('now', 'localtime')
      )
    `).run();
  } else {
    // Update store name & tagline to Yunnan Import
    db.prepare(`
      UPDATE settings SET
        store_name = 'ยูนนาน YUNNAN IMPORT',
        store_tagline = 'ระบบสะสมแต้มและสิทธิประโยชน์สมาชิก ยูนนาน (1 บาท = 1 แต้ม)',
        liff_url = 'https://yunnan-loyalty-system.vercel.app/member.html' WHERE id = 1 AND (liff_url IS NULL OR liff_url = '' OR liff_url LIKE '%yunnan-import%')
    `).run();
  }
}

// Clear all data to make it completely empty (หน้าเปล่า)
function clearAllData() {
  db.exec(`
    DELETE FROM redemptions;
    DELETE FROM transactions;
    DELETE FROM rewards;
    DELETE FROM members;
  `);
}

// Helper: Calculate member tier based on total spent
function calculateTier(spent, settings) {
  if (spent >= settings.diamond_min) return 'Diamond';
  if (spent >= settings.platinum_min) return 'Platinum';
  if (spent >= settings.gold_min) return 'Gold';
  return 'Silver';
}

// Helper: Calculate points multiplier based on tier
function getMultiplier(tier, settings) {
  switch (tier) {
    case 'Diamond': return settings.diamond_multiplier || 2.0;
    case 'Platinum': return settings.platinum_multiplier || 1.5;
    case 'Gold': return settings.gold_multiplier || 1.2;
    default: return settings.silver_multiplier || 1.0;
  }
}

initDatabase();

module.exports = {
  db,
  initDatabase,
  clearAllData,
  calculateTier,
  getMultiplier
};
