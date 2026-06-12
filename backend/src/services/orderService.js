const dbModule = require('../database');
const { generateId, generateOrderNo, nowISO } = require('../utils');
const db = dbModule;

const ORDER_STATUS = {
  CREATED: 'CREATED',
  DEPOSIT_PAID: 'DEPOSIT_PAID',
  DEVICE_RETURNED: 'DEVICE_RETURNED',
  ACCEPTED: 'ACCEPTED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
  CLOSED: 'CLOSED'
};

function addTimeline(orderId, status, operator, remark) {
  const stmt = db.prepare(`
    INSERT INTO status_timeline (id, order_id, status, operator, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(generateId(), orderId, status, operator || 'system', remark || '', nowISO());
}

function createOrder(data) {
  const id = generateId();
  const orderNo = data.order_no || generateOrderNo();
  const now = nowISO();

  const stmt = db.prepare(`
    INSERT INTO lease_orders (
      id, order_no, customer_name, customer_contact, device_name, device_code,
      deposit_amount, rent_amount, rental_start_date, rental_end_date,
      status, paid_deposit, origin_warehouse, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, orderNo,
    data.customer_name, data.customer_contact || '',
    data.device_name, data.device_code,
    data.deposit_amount || 0, data.rent_amount || 0,
    data.rental_start_date, data.rental_end_date,
    ORDER_STATUS.CREATED,
    data.paid_deposit || 0,
    data.origin_warehouse || '',
    now, now
  );

  addTimeline(id, ORDER_STATUS.CREATED, data.operator, '订单创建');
  return getOrderById(id);
}

function payDeposit(orderId, amount, operator) {
  const order = getOrderById(orderId);
  if (!order) throw new Error('订单不存在');
  if (order.status !== ORDER_STATUS.CREATED) throw new Error('订单状态不允许缴纳押金');

  const now = nowISO();
  const newPaid = (order.paid_deposit || 0) + amount;
  const newStatus = newPaid >= order.deposit_amount ? ORDER_STATUS.DEPOSIT_PAID : order.status;

  const stmt = db.prepare(`
    UPDATE lease_orders SET paid_deposit = ?, status = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(newPaid, newStatus, now, orderId);

  if (newStatus === ORDER_STATUS.DEPOSIT_PAID) {
    addTimeline(orderId, ORDER_STATUS.DEPOSIT_PAID, operator, `押金已缴纳: ${amount}`);
  }
  return getOrderById(orderId);
}

function getAllOrders() {
  const rows = db.prepare('SELECT * FROM lease_orders ORDER BY created_at DESC').all();
  return rows;
}

function getOrderById(id) {
  const order = db.prepare('SELECT * FROM lease_orders WHERE id = ?').get(id);
  if (!order) return null;

  order.timeline = db.prepare(
    'SELECT * FROM status_timeline WHERE order_id = ? ORDER BY created_at ASC'
  ).all(id);

  const acceptance = db.prepare(
    'SELECT * FROM warehouse_acceptances WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(id);
  order.acceptance = acceptance || null;

  if (acceptance) {
    acceptance.deduction_items = db.prepare(
      'SELECT * FROM deduction_items WHERE acceptance_id = ?'
    ).all(acceptance.id);
  }

  order.refunds = db.prepare(
    'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC'
  ).all(id);

  const crossReturn = db.prepare(
    'SELECT * FROM cross_warehouse_returns WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(id);
  order.cross_warehouse = crossReturn || null;

  order.acceptance_diffs = db.prepare(
    'SELECT * FROM acceptance_diffs WHERE order_id = ? ORDER BY created_at DESC'
  ).all(id);

  order.dispute = db.prepare(
    'SELECT * FROM disputes WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(id) || null;

  order.open_dispute = db.prepare(
    `SELECT * FROM disputes WHERE order_id = ? AND status IN ('OPEN', 'PROCESSING') ORDER BY created_at DESC LIMIT 1`
  ).get(id) || null;

  return order;
}

function getOrderByNo(orderNo) {
  const order = db.prepare('SELECT * FROM lease_orders WHERE order_no = ?').get(orderNo);
  return order ? getOrderById(order.id) : null;
}

function updateOrderStatus(orderId, status, operator, remark) {
  const now = nowISO();
  const stmt = db.prepare('UPDATE lease_orders SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, now, orderId);
  addTimeline(orderId, status, operator, remark);
  return getOrderById(orderId);
}

module.exports = {
  ORDER_STATUS,
  createOrder,
  payDeposit,
  getAllOrders,
  getOrderById,
  getOrderByNo,
  updateOrderStatus,
  addTimeline
};
