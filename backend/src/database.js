const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'deposit.db');
let db = null;
let SQL = null;

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('保存数据库失败:', e.message);
  }
}

function prepare(sql) {
  return {
    run(...args) {
      const params = args.map(a => a === undefined ? null : a);
      db.run(sql, params);
      saveDatabase();
      return { changes: db.getRowsModified() };
    },
    get(...args) {
      const params = args.map(a => a === undefined ? null : a);
      const results = db.exec(sql, params);
      if (!results || results.length === 0 || results[0].values.length === 0) return undefined;
      const cols = results[0].columns;
      const row = results[0].values[0];
      const obj = {};
      cols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    },
    all(...args) {
      const params = args.map(a => a === undefined ? null : a);
      const results = db.exec(sql, params);
      if (!results || results.length === 0) return [];
      const cols = results[0].columns;
      return results[0].values.map(row => {
        const obj = {};
        cols.forEach((c, i) => obj[c] = row[i]);
        return obj;
      });
    }
  };
}

function exec(sql) {
  db.run(sql);
  saveDatabase();
}

function pragma(_sql) {}

async function initDatabase() {
  SQL = await initSqlJs();
  let dbData = null;
  try {
    if (fs.existsSync(dbPath)) {
      dbData = fs.readFileSync(dbPath);
    }
  } catch (e) {}
  db = new SQL.Database(dbData);

  exec(`
    CREATE TABLE IF NOT EXISTS lease_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_contact TEXT,
      device_name TEXT NOT NULL,
      device_code TEXT NOT NULL,
      deposit_amount REAL NOT NULL DEFAULT 0,
      rent_amount REAL DEFAULT 0,
      rental_start_date TEXT NOT NULL,
      rental_end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      paid_deposit REAL DEFAULT 0,
      origin_warehouse TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouse_acceptances (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      device_code TEXT NOT NULL,
      returned_date TEXT NOT NULL,
      accessories TEXT,
      missing_accessories TEXT,
      damage_level TEXT NOT NULL DEFAULT 'NONE',
      overdue_days INTEGER DEFAULT 0,
      reviewer TEXT,
      remark TEXT,
      review_remark TEXT,
      is_locked INTEGER DEFAULT 0,
      warehouse_code TEXT,
      is_cross_warehouse INTEGER DEFAULT 0,
      review_status TEXT DEFAULT 'PENDING',
      review_reviewer TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cross_warehouse_returns (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      acceptance_id TEXT NOT NULL,
      receive_warehouse TEXT NOT NULL,
      origin_warehouse TEXT NOT NULL,
      device_code TEXT NOT NULL,
      returned_date TEXT NOT NULL,
      photos TEXT,
      accessories TEXT,
      temp_remark TEXT,
      temp_operator TEXT,
      review_status TEXT DEFAULT 'PENDING',
      review_remark TEXT,
      review_operator TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      refund_id TEXT,
      dispute_type TEXT NOT NULL,
      dispute_reason TEXT NOT NULL,
      disputed_amount REAL DEFAULT 0,
      customer_contact TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      lock_refund INTEGER DEFAULT 1,
      lock_reason TEXT,
      operator TEXT,
      handler TEXT,
      resolved_at TEXT,
      resolution TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dispute_timeline (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      action TEXT NOT NULL,
      operator TEXT,
      remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS acceptance_diffs (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      acceptance_id TEXT NOT NULL,
      diff_type TEXT NOT NULL,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      diff_amount REAL DEFAULT 0,
      operator TEXT,
      remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deduction_rules (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL,
      rule_code TEXT NOT NULL,
      rule_name TEXT NOT NULL,
      deduction_amount REAL NOT NULL DEFAULT 0,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deduction_items (
      id TEXT PRIMARY KEY,
      acceptance_id TEXT NOT NULL,
      refund_id TEXT,
      rule_id TEXT,
      deduction_type TEXT NOT NULL,
      deduction_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refunds (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      acceptance_id TEXT NOT NULL,
      refund_no TEXT UNIQUE NOT NULL,
      deposit_amount REAL NOT NULL DEFAULT 0,
      total_deduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      applicant TEXT,
      approver TEXT,
      approved_at TEXT,
      remark TEXT,
      is_locked INTEGER DEFAULT 0,
      lock_reason TEXT,
      locked_by TEXT,
      locked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      warehouse_code TEXT UNIQUE NOT NULL,
      warehouse_name TEXT NOT NULL,
      address TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_timeline (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      operator TEXT,
      remark TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const warehouseCount = prepare('SELECT COUNT(*) as cnt FROM warehouses').get();
  if (!warehouseCount || warehouseCount.cnt === 0) {
    const insertWarehouse = prepare(`
      INSERT INTO warehouses (id, warehouse_code, warehouse_name, address, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    const now = new Date().toISOString();
    insertWarehouse.run('wh_beijing', 'WH001', '北京中心仓', '北京市朝阳区建国路88号', now);
    insertWarehouse.run('wh_shanghai', 'WH002', '上海分仓', '上海市浦东新区张江路100号', now);
    insertWarehouse.run('wh_guangzhou', 'WH003', '广州分仓', '广州市天河区珠江新城', now);
    insertWarehouse.run('wh_shenzhen', 'WH004', '深圳分仓', '深圳市南山区科技园', now);
  }

  const ruleCount = prepare('SELECT COUNT(*) as cnt FROM deduction_rules').get();
  if (!ruleCount || ruleCount.cnt === 0) {
    const insertRule = prepare(`
      INSERT INTO deduction_rules (id, rule_type, rule_code, rule_name, deduction_amount, description, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const now = new Date().toISOString();
    insertRule.run('rule_damage_none', 'DAMAGE', 'DAMAGE_NONE', '无损坏', 0, '设备完好无损', now);
    insertRule.run('rule_damage_light', 'DAMAGE', 'DAMAGE_LIGHT', '轻微损坏', 100, '外观轻微划痕', now);
    insertRule.run('rule_damage_medium', 'DAMAGE', 'DAMAGE_MEDIUM', '中度损坏', 500, '部件需要维修', now);
    insertRule.run('rule_damage_severe', 'DAMAGE', 'DAMAGE_SEVERE', '严重损坏', 2000, '设备无法使用', now);
    insertRule.run('rule_accessory_missing', 'ACCESSORY', 'ACCESSORY_MISSING', '配件缺失', 200, '每缺失一件配件', now);
    insertRule.run('rule_overdue', 'OVERDUE', 'OVERDUE_DAY', '逾期费用', 50, '每天逾期费用', now);
  }
}

const initPromise = initDatabase();

module.exports = {
  prepare: (sql) => {
    if (!db) throw new Error('数据库未初始化');
    return prepare(sql);
  },
  exec: (sql) => {
    if (!db) throw new Error('数据库未初始化');
    return exec(sql);
  },
  pragma,
  waitForInit: () => initPromise
};
