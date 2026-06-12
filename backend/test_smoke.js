const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'deposit.db');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('[SMOKE] 已清除旧数据库');
}

const db = require('./src/database');
const { createOrder, payDeposit, getOrderById, ORDER_STATUS } = require('./src/services/orderService');
const {
  createCrossWarehouseAcceptance, reviewCrossWarehouseAcceptance,
  getCrossWarehouseByOrderId, createAcceptance
} = require('./src/services/acceptanceService');
const {
  createRefund, approveRefund, completeRefund, getRefundById,
  validateRefundPreconditions
} = require('./src/services/refundService');
const {
  createDispute, resolveDispute, DISPUTE_TYPE, DISPUTE_STATUS,
  getOpenDisputeByOrderId
} = require('./src/services/disputeService');

let testOrder = null;
let testOrderId = null;
let crossReturnId = null;
let refundId = null;
let disputeId = null;

async function runTests() {
  await db.waitForInit();
  console.log('========================================');
  console.log('  设备租赁押金退还 - 冒烟测试');
  console.log('========================================\n');

  try {
    await test1_CreateOrderAndPayDeposit();
    await test2_CrossWarehouseReturnWithoutReview_RefundFail();
    await test3_ReviewCrossWarehouseThenRefundSuccess();
    await test4_DisputeLockRefund();
    await test5_DeductionCapNotExceedDeposit();
    console.log('\n========================================');
    console.log('  ✅ 所有冒烟测试通过！');
    console.log('========================================');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ 测试失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  console.log(`    ✅ ${message}`);
}

async function test1_CreateOrderAndPayDeposit() {
  console.log('【测试1】创建订单并缴纳押金');
  const today = new Date();
  const startDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  testOrder = createOrder({
    customer_name: '张三',
    customer_contact: '13800138000',
    device_name: '高空作业车',
    device_code: 'EQP-001',
    deposit_amount: 5000,
    rent_amount: 1000,
    rental_start_date: startDate,
    rental_end_date: endDate,
    origin_warehouse: 'WH001',
    operator: 'admin'
  });
  testOrderId = testOrder.id;
  assert(testOrder, '订单创建成功');
  assert(testOrder.status === ORDER_STATUS.CREATED, '订单状态为 CREATED');
  assert(testOrder.origin_warehouse === 'WH001', '原出库仓库设置正确');

  testOrder = payDeposit(testOrderId, 5000, 'cashier');
  assert(testOrder.status === ORDER_STATUS.DEPOSIT_PAID, '押金缴纳成功，状态为 DEPOSIT_PAID');
  assert(testOrder.paid_deposit === 5000, '已缴押金金额正确');
  console.log('');
}

async function test2_CrossWarehouseReturnWithoutReview_RefundFail() {
  console.log('【测试2】跨仓归还未复核 → 退款申请失败');

  const today = new Date().toISOString();
  const crossReturn = createCrossWarehouseAcceptance({
    order_id: testOrderId,
    device_code: 'EQP-001',
    returned_date: today,
    receive_warehouse: 'WH002',
    origin_warehouse: 'WH001',
    accessories: '安全带,操作手册',
    photos: ['photo1.jpg', 'photo2.jpg'],
    temp_remark: '设备外观完好，待原责任仓复核',
    operator: 'wh2_operator'
  });
  crossReturnId = crossReturn.id;
  assert(crossReturn, '跨仓归还记录创建成功');
  assert(crossReturn.receive_warehouse === 'WH002', '收货仓库为 WH002');
  assert(crossReturn.origin_warehouse === 'WH001', '原责任仓为 WH001');
  assert(crossReturn.review_status === 'PENDING', '复核状态为待复核');

  try {
    validateRefundPreconditions(testOrderId);
    assert(false, '跨仓未复核时应该抛出错误');
  } catch (e) {
    assert(e.message.includes('跨仓归还待原责任仓复核'),
      '错误提示：跨仓归还待原责任仓复核');
  }

  try {
    createRefund(testOrderId, 'finance', '申请退款');
    assert(false, '跨仓未复核时退款申请应该失败');
  } catch (e) {
    assert(e.message.includes('跨仓归还待原责任仓复核'),
      '退款申请失败，原因：跨仓待复核');
  }

  console.log('');
}

async function test3_ReviewCrossWarehouseThenRefundSuccess() {
  console.log('【测试3】跨仓复核完成 → 退款成功');

  const reviewed = reviewCrossWarehouseAcceptance(crossReturnId, {
    damage_level: 'LIGHT',
    missing_accessories: '备用电池',
    overdue_days: 2,
    remark: '复核确认：轻微损坏，缺失备用电池，逾期2天',
    review_remark: '情况属实，按规定扣款',
    reviewer: 'wh1_supervisor'
  });
  assert(reviewed.review_status === 'REVIEWED', '复核状态变为已复核');
  assert(reviewed.acceptance.damage_level === 'LIGHT', '损坏等级为 LIGHT');
  assert(reviewed.acceptance.missing_accessories === '备用电池', '缺失配件为备用电池');
  assert(reviewed.acceptance.overdue_days === 2, '逾期天数为2天');

  const orderAfterReview = getOrderById(testOrderId);
  assert(orderAfterReview.status === ORDER_STATUS.ACCEPTED, '订单状态变为 ACCEPTED');

  const validation = validateRefundPreconditions(testOrderId);
  assert(validation, '退款前置条件验证通过');

  const refund = createRefund(testOrderId, 'finance', '正常退款申请');
  refundId = refund.id;
  assert(refund, '退款申请创建成功');
  assert(refund.deposit_amount === 5000, '押金金额 5000');

  const expectedDeduction = 100 + 200 + 100;
  assert(refund.total_deduction === expectedDeduction,
    `扣款总额正确: ${refund.total_deduction} (损坏100+配件200+逾期100)`);
  assert(refund.refund_amount === 5000 - expectedDeduction,
    `退款金额正确: ${refund.refund_amount}`);
  assert(refund.status === 'PENDING', '退款状态为 PENDING');

  const approved = approveRefund(refundId, 'manager', '同意退款');
  assert(approved.status === 'APPROVED', '退款审批通过');

  const completed = completeRefund(refundId, 'cashier');
  assert(completed.status === 'COMPLETED', '退款完成');
  assert(completed.acceptance.is_locked === 1, '验收记录已锁定');

  try {
    createAcceptance({
      order_id: testOrderId,
      device_code: 'EQP-001',
      returned_date: new Date().toISOString(),
      damage_level: 'MEDIUM',
      reviewer: 'someone'
    });
    assert(false, '退款完成后应该无法修改验收记录');
  } catch (e) {
    assert(e.message.includes('只能追加复核说明'),
      '退款完成后只能追加复核说明');
  }

  console.log('');
}

async function test4_DisputeLockRefund() {
  console.log('【测试4】客户提出争议 → 锁定退款');

  const today = new Date();
  const startDate = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const order2 = createOrder({
    customer_name: '李四',
    customer_contact: '13900139000',
    device_name: '叉车',
    device_code: 'EQP-002',
    deposit_amount: 3000,
    rental_start_date: startDate,
    rental_end_date: endDate,
    origin_warehouse: 'WH001',
    operator: 'admin'
  });
  payDeposit(order2.id, 3000, 'cashier');

  createAcceptance({
    order_id: order2.id,
    device_code: 'EQP-002',
    returned_date: new Date().toISOString(),
    damage_level: 'MEDIUM',
    missing_accessories: '',
    overdue_days: 0,
    reviewer: 'wh1_operator',
    warehouse_code: 'WH001'
  });

  const refund2 = createRefund(order2.id, 'finance', '申请退款');
  assert(refund2.is_locked === 0, '退款初始未锁定');

  const dispute = createDispute({
    order_id: order2.id,
    refund_id: refund2.id,
    dispute_type: DISPUTE_TYPE.DAMAGE,
    dispute_reason: '客户认为设备没有中度损坏，只有轻微划痕',
    disputed_amount: 400,
    customer_contact: '李四 13900139000',
    operator: 'customer_service',
    lock_refund: 1
  });
  assert(dispute, '第一个争议创建成功');
  disputeId = dispute.id;

  const openDispute = getOpenDisputeByOrderId(order2.id);
  assert(openDispute, '存在未处理的争议');
  assert(openDispute.status === DISPUTE_STATUS.OPEN, '争议状态为 OPEN');

  const refundAfterLock = getRefundById(refund2.id);
  assert(refundAfterLock.is_locked === 1, '退款已被锁定');
  assert(refundAfterLock.lock_reason.includes('损坏扣款有异议'),
    '锁定原因包含争议说明');

  try {
    approveRefund(refund2.id, 'manager', '审批');
    assert(false, '锁定的退款应该无法审批');
  } catch (e) {
    assert(e.message.includes('退款已锁定'),
      '审批失败：退款已锁定');
  }

  try {
    createDispute({
      order_id: order2.id,
      dispute_type: DISPUTE_TYPE.ACCESSORY,
      dispute_reason: '另一个争议',
      operator: 'customer_service'
    });
    assert(false, '同一订单不能有多个未关闭争议');
  } catch (e) {
    assert(e.message.includes('不能同时存在多个未关闭的争议'),
      '正确阻止多个未关闭争议');
  }

  const resolved = resolveDispute(disputeId, {
    resolution: '经核实确为轻微损坏，调整扣款为100元，已与客户达成一致',
    handler: 'manager'
  });
  assert(resolved.status === DISPUTE_STATUS.RESOLVED, '争议已解决');

  const refundAfterUnlock = getRefundById(refund2.id);
  assert(refundAfterUnlock.is_locked === 0, '争议解决后退款已解锁');

  const openDisputeAfter = getOpenDisputeByOrderId(order2.id);
  assert(!openDisputeAfter, '没有未处理的争议了');

  const approved = approveRefund(refund2.id, 'manager', '同意退款');
  assert(approved.status === 'APPROVED', '争议解决后可以正常审批');

  console.log('');
}

async function test5_DeductionCapNotExceedDeposit() {
  console.log('【测试5】扣款上限验证 → 扣款不超过押金');

  const today = new Date();
  const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endDate = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const order3 = createOrder({
    customer_name: '王五',
    customer_contact: '13700137000',
    device_name: '挖掘机',
    device_code: 'EQP-003',
    deposit_amount: 2000,
    rental_start_date: startDate,
    rental_end_date: endDate,
    origin_warehouse: 'WH001',
    operator: 'admin'
  });
  payDeposit(order3.id, 2000, 'cashier');

  createAcceptance({
    order_id: order3.id,
    device_code: 'EQP-003',
    returned_date: new Date().toISOString(),
    damage_level: 'SEVERE',
    missing_accessories: '铲斗,油管,工具箱,滤芯',
    overdue_days: 30,
    reviewer: 'wh1_operator',
    warehouse_code: 'WH001'
  });

  const refund3 = createRefund(order3.id, 'finance', '申请退款');
  assert(refund3, '退款申请创建成功');

  const damage = 2000;
  const accessory = 4 * 200;
  const overdue = 30 * 50;
  const totalExpected = damage + accessory + overdue;

  console.log(`    🔢 计算明细: 损坏${damage} + 配件${accessory} + 逾期${overdue} = ${totalExpected}`);
  console.log(`    🔢 押金金额: 2000, 扣款总额: ${refund3.total_deduction}`);

  assert(totalExpected > 2000, `理论扣款(${totalExpected})超过押金(2000)`);
  assert(refund3.total_deduction === 2000,
    `实际扣款(${refund3.total_deduction})不超过押金(2000)`);
  assert(refund3.refund_amount === 0,
    `退款金额为0: ${refund3.refund_amount}`);

  const order3After = getOrderById(order3.id);
  const hasCapTimeline = order3After.timeline.some(t => t.status === 'DEDUCTION_CAPPED');
  assert(hasCapTimeline, '存在扣款上限的时间线记录');

  console.log('');
}

runTests();
