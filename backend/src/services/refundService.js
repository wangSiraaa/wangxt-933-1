const db = require('../database');
const { generateId, generateRefundNo, nowISO, REVIEW_STATUS } = require('../utils');
const { getOrderById, updateOrderStatus, ORDER_STATUS, addTimeline } = require('./orderService');
const { getAcceptanceById, generateDeductionItems, lockAcceptance, getCrossWarehouseByOrderId } = require('./acceptanceService');
const { getOpenDisputeByOrderId, checkOpenDispute } = require('./disputeService');

const REFUND_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

function validateRefundPreconditions(orderId) {
  const order = getOrderById(orderId);
  if (!order) throw new Error('订单不存在');

  if (order.status === ORDER_STATUS.CREATED) {
    throw new Error('订单尚未缴纳押金，无法申请退款');
  }

  const acceptance = getAcceptanceByOrderIdInternal(orderId);
  if (!acceptance) {
    throw new Error('设备未归还，仓库未完成验收，不能退还押金');
  }

  if (acceptance.is_cross_warehouse && acceptance.review_status !== REVIEW_STATUS.REVIEWED) {
    const crossReturn = getCrossWarehouseByOrderId(orderId);
    if (crossReturn && crossReturn.review_status !== REVIEW_STATUS.REVIEWED) {
      throw new Error('跨仓归还待原责任仓复核，复核完成后才能退款');
    }
    if (!crossReturn && acceptance.review_status !== REVIEW_STATUS.REVIEWED) {
      throw new Error('跨仓验收待复核，复核完成后才能退款');
    }
  }

  const openDispute = getOpenDisputeByOrderId(orderId);
  if (openDispute) {
    throw new Error(`该订单存在未处理的争议: ${openDispute.dispute_reason || ''}，请先处理争议`);
  }

  return { order, acceptance };
}

function createRefund(orderId, applicant, remark) {
  const { order, acceptance } = validateRefundPreconditions(orderId);

  const existingRefund = db.prepare(
    `SELECT * FROM refunds WHERE order_id = ? AND status IN ('PENDING', 'APPROVED', 'COMPLETED')`
  ).get(orderId);
  if (existingRefund) {
    throw new Error('该订单已有退款申请，不能重复发起退款');
  }

  const openDispute = checkOpenDispute(orderId);
  if (openDispute) {
    throw new Error('该订单存在未处理的争议，请先处理争议');
  }

  const acceptanceWithItems = generateDeductionItems(acceptance.id);

  let totalDeduction = 0;
  for (const item of acceptanceWithItems.deduction_items) {
    if (!item.refund_id) {
      totalDeduction += item.amount;
    }
  }

  const depositAmount = order.paid_deposit || 0;
  if (totalDeduction > depositAmount) {
    totalDeduction = depositAmount;
    addTimeline(orderId, 'DEDUCTION_CAPPED', applicant,
      `扣款总额(${totalDeduction}元)超过押金(${depositAmount}元)，已按押金上限扣减`);
  }
  const refundAmount = Math.max(0, depositAmount - totalDeduction);

  const refundId = generateId();
  const refundNo = generateRefundNo();
  const now = nowISO();

  const stmt = db.prepare(`
    INSERT INTO refunds (
      id, order_id, acceptance_id, refund_no, deposit_amount, total_deduction,
      refund_amount, status, applicant, approver, approved_at, remark, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
  `);

  stmt.run(
    refundId, orderId, acceptance.id, refundNo,
    depositAmount, totalDeduction, refundAmount,
    REFUND_STATUS.PENDING, applicant || 'system', remark || '', now, now
  );

  const updateItemStmt = db.prepare(`
    UPDATE deduction_items SET refund_id = ? WHERE acceptance_id = ? AND refund_id IS NULL
  `);
  updateItemStmt.run(refundId, acceptance.id);

  updateOrderStatus(orderId, ORDER_STATUS.REFUND_PENDING, applicant, `退款申请已创建: ${refundNo}`);

  return getRefundById(refundId);
}

function getAcceptanceByOrderIdInternal(orderId) {
  return db.prepare(
    'SELECT * FROM warehouse_acceptances WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
}

function approveRefund(refundId, approver, remark) {
  const refund = getRefundById(refundId);
  if (!refund) throw new Error('退款记录不存在');
  if (refund.status !== REFUND_STATUS.PENDING) throw new Error('退款状态不允许审批');
  if (refund.is_locked) {
    throw new Error(`退款已锁定，原因: ${refund.lock_reason || '争议处理中'}`);
  }

  const openDispute = getOpenDisputeByOrderId(refund.order_id);
  if (openDispute) {
    throw new Error(`该订单存在未处理的争议: ${openDispute.dispute_reason || ''}，请先处理争议`);
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE refunds SET status = ?, approver = ?, approved_at = ?, remark = COALESCE(remark, '') || ?, updated_at = ?
    WHERE id = ?
  `);
  const suffix = remark ? ` [审批: ${remark}]` : '';
  stmt.run(REFUND_STATUS.APPROVED, approver || 'system', now, suffix, now, refundId);

  updateOrderStatus(refund.order_id, ORDER_STATUS.REFUND_APPROVED, approver, `退款已审批通过`);

  return getRefundById(refundId);
}

function completeRefund(refundId, operator) {
  const refund = getRefundById(refundId);
  if (!refund) throw new Error('退款记录不存在');
  if (refund.status !== REFUND_STATUS.APPROVED) throw new Error('退款未审批通过，无法完成');
  if (refund.is_locked) {
    throw new Error(`退款已锁定，原因: ${refund.lock_reason || '争议处理中'}`);
  }

  const openDispute = getOpenDisputeByOrderId(refund.order_id);
  if (openDispute) {
    throw new Error(`该订单存在未处理的争议: ${openDispute.dispute_reason || ''}，请先处理争议`);
  }

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE refunds SET status = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(REFUND_STATUS.COMPLETED, now, refundId);

  lockAcceptance(refund.acceptance_id, operator);
  updateOrderStatus(refund.order_id, ORDER_STATUS.REFUND_COMPLETED, operator, `退款已完成: ${refund.refund_amount}元`);

  return getRefundById(refundId);
}

function rejectRefund(refundId, approver, reason) {
  const refund = getRefundById(refundId);
  if (!refund) throw new Error('退款记录不存在');
  if (refund.status !== REFUND_STATUS.PENDING) throw new Error('退款状态不允许驳回');

  const now = nowISO();
  const stmt = db.prepare(`
    UPDATE refunds SET status = ?, approver = ?, approved_at = ?, remark = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(REFUND_STATUS.REJECTED, approver || 'system', now, `[驳回] ${reason || ''}`, now, refundId);

  const clearItems = db.prepare(`
    UPDATE deduction_items SET refund_id = NULL WHERE refund_id = ?
  `);
  clearItems.run(refundId);

  addTimeline(refund.order_id, 'REFUND_REJECTED', approver, `退款申请被驳回: ${reason || ''}`);

  return getRefundById(refundId);
}

function getRefundById(id) {
  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(id);
  if (!refund) return null;

  refund.deduction_items = db.prepare(
    'SELECT * FROM deduction_items WHERE refund_id = ?'
  ).all(id);

  refund.order = getOrderById(refund.order_id);
  refund.acceptance = getAcceptanceById(refund.acceptance_id);

  refund.cross_warehouse = db.prepare(
    'SELECT * FROM cross_warehouse_returns WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(refund.order_id) || null;

  refund.dispute = db.prepare(
    'SELECT * FROM disputes WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(refund.order_id) || null;

  refund.open_dispute = db.prepare(
    `SELECT * FROM disputes WHERE order_id = ? AND status IN ('OPEN', 'PROCESSING') ORDER BY created_at DESC LIMIT 1`
  ).get(refund.order_id) || null;

  refund.acceptance_diffs = db.prepare(
    'SELECT * FROM acceptance_diffs WHERE order_id = ? ORDER BY created_at DESC'
  ).all(refund.order_id);

  return refund;
}

function getRefundByOrderId(orderId) {
  const refund = db.prepare(
    'SELECT * FROM refunds WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
  return refund ? getRefundById(refund.id) : null;
}

function getAllRefunds() {
  const refunds = db.prepare('SELECT * FROM refunds ORDER BY created_at DESC').all();
  return refunds.map(r => {
    const order = db.prepare('SELECT * FROM lease_orders WHERE id = ?').get(r.order_id);
    return { ...r, order };
  });
}

module.exports = {
  REFUND_STATUS,
  createRefund,
  approveRefund,
  completeRefund,
  rejectRefund,
  getRefundById,
  getRefundByOrderId,
  getAllRefunds,
  validateRefundPreconditions
};
