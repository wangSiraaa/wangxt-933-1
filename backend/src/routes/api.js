const express = require('express');
const router = express.Router();
const {
  createOrder, payDeposit, getAllOrders, getOrderById, getOrderByNo, ORDER_STATUS
} = require('../services/orderService');
const {
  createAcceptance, createCrossWarehouseAcceptance, reviewCrossWarehouseAcceptance,
  getAcceptanceById, getAcceptanceByOrderId, getCrossWarehouseReturnById,
  getCrossWarehouseByOrderId, getWarehouseList, getAcceptanceDiffs,
  addReviewRemark, generateDeductionItems, getDeductionRules
} = require('../services/acceptanceService');
const {
  createRefund, approveRefund, completeRefund, rejectRefund,
  getRefundById, getRefundByOrderId, getAllRefunds, REFUND_STATUS,
  validateRefundPreconditions
} = require('../services/refundService');
const {
  createDispute, processDispute, resolveDispute, rejectDispute, closeDispute,
  getDisputeById, getDisputeByOrderId, getOpenDisputeByOrderId, getAllDisputes,
  lockRefund, unlockRefund, DISPUTE_STATUS, DISPUTE_TYPE
} = require('../services/disputeService');
const { REVIEW_STATUS } = require('../utils');

function handleError(res, error) {
  console.error('[API Error]', error.message);
  res.status(400).json({ success: false, error: error.message });
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/orders', (req, res) => {
  try {
    res.json({ success: true, data: getAllOrders() });
  } catch (e) { handleError(res, e); }
});

router.post('/orders', (req, res) => {
  try {
    res.json({ success: true, data: createOrder(req.body) });
  } catch (e) { handleError(res, e); }
});

router.get('/orders/:id', (req, res) => {
  try {
    const order = req.params.id.startsWith('LO')
      ? getOrderByNo(req.params.id)
      : getOrderById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: '订单不存在' });
    res.json({ success: true, data: order });
  } catch (e) { handleError(res, e); }
});

router.post('/orders/:id/pay-deposit', (req, res) => {
  try {
    const { amount, operator } = req.body;
    res.json({ success: true, data: payDeposit(req.params.id, amount, operator) });
  } catch (e) { handleError(res, e); }
});

router.post('/acceptances', (req, res) => {
  try {
    res.json({ success: true, data: createAcceptance(req.body) });
  } catch (e) { handleError(res, e); }
});

router.get('/acceptances/:id', (req, res) => {
  try {
    const acc = getAcceptanceById(req.params.id);
    if (!acc) return res.status(404).json({ success: false, error: '验收记录不存在' });
    res.json({ success: true, data: acc });
  } catch (e) { handleError(res, e); }
});

router.get('/acceptances/order/:orderId', (req, res) => {
  try {
    res.json({ success: true, data: getAcceptanceByOrderId(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.post('/acceptances/:id/generate-deductions', (req, res) => {
  try {
    res.json({ success: true, data: generateDeductionItems(req.params.id) });
  } catch (e) { handleError(res, e); }
});

router.post('/acceptances/:id/review-remark', (req, res) => {
  try {
    const { review_remark, operator } = req.body;
    res.json({ success: true, data: addReviewRemark(req.params.id, review_remark, operator) });
  } catch (e) { handleError(res, e); }
});

router.get('/deduction-rules', (req, res) => {
  try {
    res.json({ success: true, data: getDeductionRules() });
  } catch (e) { handleError(res, e); }
});

router.get('/warehouses', (req, res) => {
  try {
    res.json({ success: true, data: getWarehouseList() });
  } catch (e) { handleError(res, e); }
});

router.post('/cross-warehouse/acceptance', (req, res) => {
  try {
    res.json({ success: true, data: createCrossWarehouseAcceptance(req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/cross-warehouse/:id/review', (req, res) => {
  try {
    res.json({ success: true, data: reviewCrossWarehouseAcceptance(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.get('/cross-warehouse/:id', (req, res) => {
  try {
    const cross = getCrossWarehouseReturnById(req.params.id);
    if (!cross) return res.status(404).json({ success: false, error: '跨仓归还记录不存在' });
    res.json({ success: true, data: cross });
  } catch (e) { handleError(res, e); }
});

router.get('/cross-warehouse/order/:orderId', (req, res) => {
  try {
    res.json({ success: true, data: getCrossWarehouseByOrderId(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.get('/acceptance-diffs/order/:orderId', (req, res) => {
  try {
    res.json({ success: true, data: getAcceptanceDiffs(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds/:id/lock', (req, res) => {
  try {
    res.json({ success: true, data: lockRefund(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds/:id/unlock', (req, res) => {
  try {
    res.json({ success: true, data: unlockRefund(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.get('/refunds/:orderId/validate', (req, res) => {
  try {
    validateRefundPreconditions(req.params.orderId);
    res.json({ success: true, data: { valid: true, message: '可以申请退款' } });
  } catch (e) {
    res.json({ success: true, data: { valid: false, message: e.message } });
  }
});

router.post('/disputes', (req, res) => {
  try {
    res.json({ success: true, data: createDispute(req.body) });
  } catch (e) { handleError(res, e); }
});

router.get('/disputes', (req, res) => {
  try {
    res.json({ success: true, data: getAllDisputes(req.query.status) });
  } catch (e) { handleError(res, e); }
});

router.get('/disputes/:id', (req, res) => {
  try {
    const dispute = getDisputeById(req.params.id);
    if (!dispute) return res.status(404).json({ success: false, error: '争议记录不存在' });
    res.json({ success: true, data: dispute });
  } catch (e) { handleError(res, e); }
});

router.get('/disputes/order/:orderId', (req, res) => {
  try {
    res.json({ success: true, data: getDisputeByOrderId(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.get('/disputes/order/:orderId/open', (req, res) => {
  try {
    res.json({ success: true, data: getOpenDisputeByOrderId(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.post('/disputes/:id/process', (req, res) => {
  try {
    res.json({ success: true, data: processDispute(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/disputes/:id/resolve', (req, res) => {
  try {
    res.json({ success: true, data: resolveDispute(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/disputes/:id/reject', (req, res) => {
  try {
    res.json({ success: true, data: rejectDispute(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/disputes/:id/close', (req, res) => {
  try {
    res.json({ success: true, data: closeDispute(req.params.id, req.body) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds', (req, res) => {
  try {
    const { order_id, applicant, remark } = req.body;
    res.json({ success: true, data: createRefund(order_id, applicant, remark) });
  } catch (e) { handleError(res, e); }
});

router.get('/refunds', (req, res) => {
  try {
    res.json({ success: true, data: getAllRefunds() });
  } catch (e) { handleError(res, e); }
});

router.get('/refunds/:id', (req, res) => {
  try {
    const refund = getRefundById(req.params.id);
    if (!refund) return res.status(404).json({ success: false, error: '退款记录不存在' });
    res.json({ success: true, data: refund });
  } catch (e) { handleError(res, e); }
});

router.get('/refunds/order/:orderId', (req, res) => {
  try {
    res.json({ success: true, data: getRefundByOrderId(req.params.orderId) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds/:id/approve', (req, res) => {
  try {
    const { approver, remark } = req.body;
    res.json({ success: true, data: approveRefund(req.params.id, approver, remark) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds/:id/complete', (req, res) => {
  try {
    const { operator } = req.body;
    res.json({ success: true, data: completeRefund(req.params.id, operator) });
  } catch (e) { handleError(res, e); }
});

router.post('/refunds/:id/reject', (req, res) => {
  try {
    const { approver, reason } = req.body;
    res.json({ success: true, data: rejectRefund(req.params.id, approver, reason) });
  } catch (e) { handleError(res, e); }
});

router.get('/meta/statuses', (req, res) => {
  res.json({
    success: true,
    data: {
      order_status: ORDER_STATUS,
      refund_status: REFUND_STATUS,
      damage_levels: {
        NONE: '无损坏',
        LIGHT: '轻微损坏',
        MEDIUM: '中度损坏',
        SEVERE: '严重损坏'
      },
      review_status: {
        PENDING: '待复核',
        REVIEWED: '已复核',
        REJECTED: '复核驳回'
      },
      dispute_status: DISPUTE_STATUS,
      dispute_type: DISPUTE_TYPE
    }
  });
});

module.exports = router;
