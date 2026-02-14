/**
 * CookieCache - SQLite-based cookie persistence and caching
 * Stores Cloudflare cookies for reuse across sessions
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

class CookieCache {
  constructor(dbPath = 'cloudfreed.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create cookies table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS cookies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            name TEXT NOT NULL,
            value TEXT NOT NULL,
            path TEXT DEFAULT '/',
            expires INTEGER,
            httpOnly BOOLEAN DEFAULT 0,
            secure BOOLEAN DEFAULT 0,
            created_at INTEGER NOT NULL,
            last_used INTEGER NOT NULL,
            use_count INTEGER DEFAULT 0,
            UNIQUE(domain, name, path)
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Create index for faster domain lookups
          this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_domain ON cookies(domain)
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
  }

  /**
   * Get cookie for a specific domain
   * @param {string} domain - Domain to lookup
   * @param {string} name - Cookie name (default: cf_clearance)
   * @returns {Object|null} Cookie object or null if not found/expired
   */
  async get(domain, name = 'cf_clearance') {
    return new Promise((resolve, reject) => {
      const now = Date.now();

      this.db.get(`
        SELECT * FROM cookies 
        WHERE domain = ? AND name = ?
        ORDER BY created_at DESC 
        LIMIT 1
      `, [domain, name], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        // Check if cookie is expired
        if (row.expires && row.expires < now) {
          // Delete expired cookie
          await this.delete(domain, name);
          resolve(null);
          return;
        }

        // Update last used time and use count
        this.db.run(`
          UPDATE cookies 
          SET last_used = ?, use_count = use_count + 1
          WHERE id = ?
        `, [now, row.id]);

        resolve({
          name: row.name,
          value: row.value,
          domain: row.domain,
          path: row.path,
          expires: row.expires,
          httpOnly: Boolean(row.httpOnly),
          secure: Boolean(row.secure)
        });
      });
    });
  }

  /**
   * Set/update cookie in cache
   * @param {Object} cookie - Cookie object with domain, name, value, etc.
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  async set(cookie, ttl = null) {
    return new Promise((resolve, reject) => {
      const now = Date.now();
      const expires = ttl ? now + ttl : (cookie.expires || null);

      this.db.run(`
        INSERT INTO cookies (domain, name, value, path, expires, httpOnly, secure, created_at, last_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(domain, name, path) DO UPDATE SET
          value = excluded.value,
          expires = excluded.expires,
          last_used = excluded.last_used,
          use_count = 0
      `, [
        cookie.domain,
        cookie.name,
        cookie.value,
        cookie.path || '/',
        expires,
        cookie.httpOnly ? 1 : 0,
        cookie.secure ? 1 : 0,
        now,
        now
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Delete cookie from cache
   */
  async delete(domain, name = 'cf_clearance') {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM cookies WHERE domain = ? AND name = ?
      `, [domain, name], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Clean up expired cookies
   */
  async cleanup() {
    return new Promise((resolve, reject) => {
      const now = Date.now();

      this.db.run(`
        DELETE FROM cookies WHERE expires IS NOT NULL AND expires < ?
      `, [now], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Clear all cookies from cache
   */
  async clear() {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM cookies', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(use_count) as total_uses,
          AVG(use_count) as avg_uses
        FROM cookies
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default CookieCache;
