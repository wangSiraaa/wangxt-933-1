const db = require('../database');
const { generateId, nowISO, DISPUTE_STATUS, DISPUTE_TYPE } = require('../utils');
const { getOrderById, getOrderByNo, updateOrderStatus, ORDER_STATUS, addTimeline } = require('./orderService');

function getRefundByIdInternal(id) {
  return db.prepare('SELECT * FROM refunds WHERE id = ?').get(id);
}

function getRefundByOrderIdInternal(orderId) {
  return db.prepare(
    'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
}

function addDisputeTimeline(disputeId, action, operator, remark) {
  const stmt = db.prepare(`
    INSERT INTO dispute_timeline (id, dispute_id, action, operator, remark, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(generateId(), disputeId, action, operator || 'system', remark || '', nowISO());
}

function checkOpenDispute(orderId, excludeDisputeId = null) {
  const sql = `SELECT * FROM disputes 
    WHERE order_id = ? AND status IN ('OPEN', 'PROCESSING')
    ${excludeDisputeId ? 'AND id != ?' : ''}
    LIMIT 1`;
  const params = excludeDisputeId ? [orderId, excludeDisputeId] : [orderId];
  return db.prepare(sql).get(...params);
}

function createDispute(data) {
  const order = data.order_no
    ? getOrderByNo(data.order_no)
    : getOrderById(data.order_id);
  if (!order) throw new Error('订单不存在');

  const existingOpen = checkOpenDispute(order.id, data.id);
  if (existingOpen) {
    throw new Error('同一订单不能同时存在多个未关闭的争议');
  }

  const refund = data.refund_id ? getRefundByIdInternal(data.refund_id) : getRefundByOrderIdInternal(order.id);
  const refundId = refund ? refund.id : null;

  const now = nowISO();
  const id = generateId();

  const lockRefund = data.lock_refund !== undefined ? data.lock_refund : 1;
  let lockReason = data.lock_reason || '';

  if (lockRefund && !lockReason) {
    lockReason = `客户对${getDisputeTypeLabel(data.dispute_type)}有异议，争议处理中，退款已锁定`;
  }

  const stmt = db.prepare(`
    INSERT INTO disputes (
      id, order_id, refund_id, dispute_type, dispute_reason, disputed_amount,
      customer_contact, status, lock_refund, lock_reason, operator,
      handler, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, order.id, refundId, data.dispute_type || DISPUTE_TYPE.OTHER,
    data.dispute_reason || '', data.disputed_amount || 0,
    data.customer_contact || '', DISPUTE_STATUS.OPEN,
    lockRefund, lockReason, data.operator || '',
    data.handler || '', now, now
  );

  if (lockRefund && refundId) {
    const lockStmt = db.prepare(`
      UPDATE refunds SET is_locked = 1, lock_reason = ?, locked_by = ?, locked_at = ?, updated_at = ?
      WHERE id = ?
    `);
    lockStmt.run(lockReason, data.operator || 'system', now, now, refundId);
  }

  addDisputeTimeline(id, 'DISPUTE_CREATED', data.operator,
    `争议已创建，类型: ${getDisputeTypeLabel(data.dispute_type)}，争议金额: ${data.disputed_amount || 0}`);
  addTimeline(order.id, 'DISPUTE_OPENED', data.operator,
    `客户提出争议: ${data.dispute_reason || ''}`);

  return getDisputeById(id);
}

function getDisputeTypeLabel(type) {
  const labels = {
    [DISPUTE_TYPE.DAMAGE]: '损坏扣款',
    [DISPUTE_TYPE.ACCESSORY]: '配件扣款',
    [DISPUTE_TYPE.OVERDUE]: '逾期扣款',
    [DISPUTE_TYPE.OTHER]: '其他'
  };
  return labels[type] || type;
}

function processDispute(disputeId, data) {
  const dispute = getDisputeById(disputeId);
  if (!dispute) throw new Error('争议记录不存在');
  if (dispute.status !== DISPUTE_STATUS.OPEN && dispute.status !== DISPUTE_STATUS.PROCESSING) {
    throw new Error('当前争议状态不允许处理');
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE disputes SET
      status = ?, handler = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(DISPUTE_STATUS.PROCESSING, data.handler || dispute.handler, now, disputeId);

  addDisputeTimeline(disputeId, 'DISPUTE_PROCESSING', data.handler,
    `争议已由 ${data.handler} 开始处理`);

  return getDisputeById(disputeId);
}

function resolveDispute(disputeId, data) {
  const dispute = getDisputeById(disputeId);
  if (!dispute) throw new Error('争议记录不存在');
  if (dispute.status === DISPUTE_STATUS.RESOLVED || dispute.status === DISPUTE_STATUS.CLOSED) {
    throw new Error('该争议已处理完成');
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE disputes SET
      status = ?, resolution = ?, resolved_at = ?,
      handler = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    DISPUTE_STATUS.RESOLVED, data.resolution || '',
    now, data.handler || dispute.handler, now, disputeId
  );

  if (dispute.refund_id && dispute.lock_refund) {
    const unlockStmt = db.prepare(`
      UPDATE refunds SET is_locked = 0, lock_reason = NULL, locked_by = NULL, locked_at = NULL, updated_at = ?
      WHERE id = ?
    `);
    unlockStmt.run(now, dispute.refund_id);
  }

  addDisputeTimeline(disputeId, 'DISPUTE_RESOLVED', data.handler,
    `争议已解决，处理方案: ${data.resolution || ''}`);
  addTimeline(dispute.order_id, 'DISPUTE_RESOLVED', data.handler,
    `争议已解决: ${data.resolution || ''}`);

  return getDisputeById(disputeId);
}

function rejectDispute(disputeId, data) {
  const dispute = getDisputeById(disputeId);
  if (!dispute) throw new Error('争议记录不存在');
  if (dispute.status === DISPUTE_STATUS.RESOLVED || dispute.status === DISPUTE_STATUS.CLOSED) {
    throw new Error('该争议已处理完成');
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE disputes SET
      status = ?, resolution = ?, resolved_at = ?,
      handler = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    DISPUTE_STATUS.REJECTED, `[驳回] ${data.reason || ''}`,
    now, data.handler || dispute.handler, now, disputeId
  );

  if (dispute.refund_id && dispute.lock_refund) {
    const unlockStmt = db.prepare(`
      UPDATE refunds SET is_locked = 0, lock_reason = NULL, locked_by = NULL, locked_at = NULL, updated_at = ?
      WHERE id = ?
    `);
    unlockStmt.run(now, dispute.refund_id);
  }

  addDisputeTimeline(disputeId, 'DISPUTE_REJECTED', data.handler,
    `争议已驳回，原因: ${data.reason || ''}`);
  addTimeline(dispute.order_id, 'DISPUTE_REJECTED', data.handler,
    `争议已驳回: ${data.reason || ''}`);

  return getDisputeById(disputeId);
}

function closeDispute(disputeId, data) {
  const dispute = getDisputeById(disputeId);
  if (!dispute) throw new Error('争议记录不存在');
  if (dispute.status !== DISPUTE_STATUS.RESOLVED && dispute.status !== DISPUTE_STATUS.REJECTED) {
    throw new Error('请先解决或驳回争议后再关闭');
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE disputes SET status = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(DISPUTE_STATUS.CLOSED, now, disputeId);

  addDisputeTimeline(disputeId, 'DISPUTE_CLOSED', data.operator, '争议已关闭');

  return getDisputeById(disputeId);
}

function getDisputeById(id) {
  const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(id);
  if (!dispute) return null;

  dispute.timeline = db.prepare(
    'SELECT * FROM dispute_timeline WHERE dispute_id = ? ORDER BY created_at ASC'
  ).all(id);
  dispute.order = getOrderById(dispute.order_id);
  if (dispute.refund_id) {
    dispute.refund = getRefundByIdInternal(dispute.refund_id);
  }

  return dispute;
}

function getDisputeByOrderId(orderId) {
  const dispute = db.prepare(
    'SELECT * FROM disputes WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
  return dispute ? getDisputeById(dispute.id) : null;
}

function getOpenDisputeByOrderId(orderId) {
  const dispute = db.prepare(
    `SELECT * FROM disputes WHERE order_id = ? AND status IN ('OPEN', 'PROCESSING') ORDER BY created_at DESC LIMIT 1`
  ).get(orderId);
  return dispute ? getDisputeById(dispute.id) : null;
}

function getAllDisputes(status = null) {
  let sql = 'SELECT * FROM disputes';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const disputes = db.prepare(sql).all(...params);
  return disputes.map(d => {
    const order = db.prepare('SELECT * FROM lease_orders WHERE id = ?').get(d.order_id);
    return { ...d, order: order };
  });
}

function lockRefund(refundId, data) {
  const refund = getRefundByIdInternal(refundId);
  if (!refund) throw new Error('退款记录不存在');
  if (refund.status === 'COMPLETED') throw new Error('退款已完成，无法锁定');

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE refunds SET is_locked = 1, lock_reason = ?, locked_by = ?, locked_at = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(data.lock_reason || '争议处理中', data.operator || 'system', now, now, refundId);

  addTimeline(refund.order_id, 'REFUND_LOCKED', data.operator,
    `退款已锁定，原因: ${data.lock_reason || '争议处理中'}`);

  return getRefundByIdInternal(refundId);
}

function unlockRefund(refundId, data) {
  const refund = getRefundByIdInternal(refundId);
  if (!refund) throw new Error('退款记录不存在');

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE refunds SET is_locked = 0, lock_reason = NULL, locked_by = NULL, locked_at = NULL, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(now, refundId);

  addTimeline(refund.order_id, 'REFUND_UNLOCKED', data.operator, '退款锁定已解除');

  return getRefundByIdInternal(refundId);
}

module.exports = {
  DISPUTE_STATUS,
  DISPUTE_TYPE,
  createDispute,
  processDispute,
  resolveDispute,
  rejectDispute,
  closeDispute,
  getDisputeById,
  getDisputeByOrderId,
  getOpenDisputeByOrderId,
  getAllDisputes,
  lockRefund,
  unlockRefund,
  checkOpenDispute
};
