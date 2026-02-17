const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.dbPath = process.env.DB_TYPE === 'postgresql' ? null : './data/leads.db';
    this.db = null;
  }

  async initialize() {
    // Ensure data directory exists
    await fs.mkdir('./data', { recursive: true });
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Database connection error:', err.message);
          reject(err);
        } else {
          logger.info('✓ Database connected');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        email_domain TEXT,
        website TEXT,
        industry TEXT,
        size TEXT,
        hunter_data TEXT,
        apollo_data TEXT,
        status TEXT DEFAULT 'new',
        created_at DATETIME,
        updated_at DATETIME
      )`,
      
      `CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        title TEXT NOT NULL,
        location TEXT,
        posted_date TEXT,
        source TEXT,
        keyword TEXT,
        status TEXT DEFAULT 'new',
        created_at DATETIME,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        first_name TEXT,
        last_name TEXT,
        email TEXT UNIQUE,
        title TEXT,
        linkedin TEXT,
        confidence INTEGER,
        source TEXT,
        status TEXT DEFAULT 'new',
        last_contact_date DATETIME,
        gmail_message_id TEXT,
        created_at DATETIME,
        updated_at DATETIME,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS emails_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER,
        gmail_message_id TEXT,
        subject TEXT,
        body TEXT,
        sent_at DATETIME,
        status TEXT,
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS email_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER,
        gmail_message_id TEXT,
        subject TEXT,
        body TEXT,
        received_at DATETIME,
        intent TEXT,
        responded BOOLEAN DEFAULT 0,
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER,
        calendar_event_id TEXT,
        meeting_time DATETIME,
        duration_minutes INTEGER,
        status TEXT,
        notes TEXT,
        created_at DATETIME,
        FOREIGN KEY (contact_id) REFERENCES contacts(id)
      )`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }
    
    logger.info('✓ Database tables created');
  }

  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = new Database();
