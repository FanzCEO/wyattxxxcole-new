import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wyattxxxcole',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection
pool.getConnection()
  .then(conn => {
    console.log('Database connected successfully to MariaDB');
    conn.release();
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
  });

// Helper class to provide SQLite-like synchronous-style API
// but actually uses async/await under the hood
const db = {
  pool,

  // Execute a query (for INSERT, UPDATE, DELETE)
  async execute(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return result;
  },

  // Query and get all results
  async query(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },

  // Get single row
  async get(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  },

  // Get all rows
  async all(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },

  // Run a query (alias for execute)
  async run(sql, params = []) {
    const [result] = await pool.execute(sql, params);
    return {
      lastInsertRowid: result.insertId,
      changes: result.affectedRows
    };
  },

  // Prepare statement (returns object with run, get, all methods)
  prepare(sql) {
    return {
      run: async (...params) => {
        const [result] = await pool.execute(sql, params);
        return {
          lastInsertRowid: result.insertId,
          changes: result.affectedRows
        };
      },
      get: async (...params) => {
        const [rows] = await pool.execute(sql, params);
        return rows[0] || null;
      },
      all: async (...params) => {
        const [rows] = await pool.execute(sql, params);
        return rows;
      }
    };
  },

  // Transaction helper
  async transaction(callback) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
};

export default db;
