const db = require('../database');
const { generateId, nowISO, DAMAGE_LEVEL_MAP, DAMAGE_LABEL_MAP,
  ACCESSORY_DEDUCTION_PER_ITEM, OVERDUE_DEDUCTION_PER_DAY, calculateDaysBetween,
  REVIEW_STATUS, DIFF_TYPE } = require('../utils');
const { getOrderById, updateOrderStatus, ORDER_STATUS, addTimeline } = require('./orderService');

function calculateAcceptanceDeductions(acceptance, order) {
  const deductions = [];

  const damageAmount = DAMAGE_LEVEL_MAP[acceptance.damage_level] || 0;
  if (damageAmount > 0) {
    deductions.push({
      id: generateId(),
      deduction_type: 'DAMAGE',
      deduction_name: `损坏扣款-${DAMAGE_LABEL_MAP[acceptance.damage_level] || acceptance.damage_level}`,
      amount: damageAmount,
      remark: `损坏等级: ${acceptance.damage_level}`
    });
  }

  if (acceptance.missing_accessories && acceptance.missing_accessories.length > 0) {
    const missingList = acceptance.missing_accessories.split(',').filter(s => s.trim());
    const missingCount = missingList.length;
    if (missingCount > 0) {
      deductions.push({
        id: generateId(),
        deduction_type: 'ACCESSORY',
        deduction_name: '配件缺失扣款',
        amount: missingCount * ACCESSORY_DEDUCTION_PER_ITEM,
        remark: `缺失配件: ${acceptance.missing_accessories}, 共${missingCount}件`
      });
    }
  }

  let overdueDays = acceptance.overdue_days || 0;
  if (overdueDays === 0 && order && order.rental_end_date) {
    overdueDays = calculateDaysBetween(order.rental_end_date, acceptance.returned_date);
  }
  if (overdueDays > 0) {
    deductions.push({
      id: generateId(),
      deduction_type: 'OVERDUE',
      deduction_name: '逾期扣款',
      amount: overdueDays * OVERDUE_DEDUCTION_PER_DAY,
      remark: `逾期${overdueDays}天, 每天${OVERDUE_DEDUCTION_PER_DAY}元`
    });
  }

  return { deductions, overdueDays };
}

function saveAcceptanceDiff(orderId, acceptanceId, diffType, fieldName, oldValue, newValue, diffAmount, operator, remark) {
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO acceptance_diffs (
      id, order_id, acceptance_id, diff_type, field_name, old_value, new_value,
      diff_amount, operator, remark, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, orderId, acceptanceId, diffType, fieldName,
    oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
    newValue !== undefined && newValue !== null ? String(newValue) : null,
    diffAmount || 0, operator || '', remark || '', nowISO()
  );
}

function createAcceptance(data) {
  const order = getOrderById(data.order_id);
  if (!order) throw new Error('订单不存在');
  if (order.status === ORDER_STATUS.CREATED) throw new Error('请先缴纳押金');

  const existing = db.prepare(
    'SELECT * FROM warehouse_acceptances WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(data.order_id);

  if (existing && existing.is_locked) {
    throw new Error('该订单的验收记录已锁定（退款已完成），只能追加复核说明');
  }

  const now = nowISO();
  let acceptance;
  const warehouseCode = data.warehouse_code || order.origin_warehouse || '';
  const isCrossWarehouse = data.is_cross_warehouse || (warehouseCode && order.origin_warehouse && warehouseCode !== order.origin_warehouse) ? 1 : 0;

  if (existing) {
    if (existing.damage_level !== data.damage_level) {
      const oldAmount = DAMAGE_LEVEL_MAP[existing.damage_level] || 0;
      const newAmount = DAMAGE_LEVEL_MAP[data.damage_level] || 0;
      saveAcceptanceDiff(
        data.order_id, existing.id, DIFF_TYPE.DAMAGE_LEVEL, 'damage_level',
        existing.damage_level, data.damage_level, newAmount - oldAmount,
        data.reviewer, `损坏等级变更: ${existing.damage_level} -> ${data.damage_level}`
      );
    }
    if (existing.missing_accessories !== (data.missing_accessories || '')) {
      const oldCount = existing.missing_accessories ? existing.missing_accessories.split(',').filter(s => s.trim()).length : 0;
      const newCount = data.missing_accessories ? data.missing_accessories.split(',').filter(s => s.trim()).length : 0;
      saveAcceptanceDiff(
        data.order_id, existing.id, DIFF_TYPE.ACCESSORY, 'missing_accessories',
        existing.missing_accessories, data.missing_accessories,
        (newCount - oldCount) * ACCESSORY_DEDUCTION_PER_ITEM,
        data.reviewer, `缺失配件变更: ${existing.missing_accessories || '无'} -> ${data.missing_accessories || '无'}`
      );
    }
    if (existing.overdue_days !== (data.overdue_days || 0)) {
      saveAcceptanceDiff(
        data.order_id, existing.id, DIFF_TYPE.OVERDUE_DAYS, 'overdue_days',
        existing.overdue_days, data.overdue_days,
        ((data.overdue_days || 0) - (existing.overdue_days || 0)) * OVERDUE_DEDUCTION_PER_DAY,
        data.reviewer, `逾期天数变更: ${existing.overdue_days} -> ${data.overdue_days}`
      );
    }

    const stmt = db.prepare(`
      UPDATE warehouse_acceptances SET
        device_code = ?, returned_date = ?, accessories = ?, missing_accessories = ?,
        damage_level = ?, overdue_days = ?, reviewer = ?, remark = ?,
        warehouse_code = ?, is_cross_warehouse = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      data.device_code, data.returned_date, data.accessories || '',
      data.missing_accessories || '', data.damage_level || 'NONE',
      data.overdue_days || 0, data.reviewer || '', data.remark || '',
      warehouseCode, isCrossWarehouse, now, existing.id
    );
    acceptance = getAcceptanceById(existing.id);
  } else {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO warehouse_acceptances (
        id, order_id, device_code, returned_date, accessories, missing_accessories,
        damage_level, overdue_days, reviewer, remark, is_locked, created_at, updated_at,
        warehouse_code, is_cross_warehouse, review_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id, data.order_id, data.device_code, data.returned_date,
      data.accessories || '', data.missing_accessories || '',
      data.damage_level || 'NONE', data.overdue_days || 0,
      data.reviewer || '', data.remark || '', now, now,
      warehouseCode, isCrossWarehouse,
      isCrossWarehouse ? REVIEW_STATUS.PENDING : REVIEW_STATUS.REVIEWED
    );
    acceptance = getAcceptanceById(id);

    saveAcceptanceDiff(
      data.order_id, id, DIFF_TYPE.REMARK, 'created', null, 'created',
      0, data.reviewer, '创建验收记录'
    );
  }

  if (order.status === ORDER_STATUS.DEPOSIT_PAID) {
    updateOrderStatus(data.order_id, ORDER_STATUS.DEVICE_RETURNED, data.reviewer, '设备已归还待验收');
  }

  if (!isCrossWarehouse) {
    updateOrderStatus(data.order_id, ORDER_STATUS.ACCEPTED, data.reviewer, '验收完成');
  } else {
    addTimeline(data.order_id, 'CROSS_WAREHOUSE_PENDING', data.reviewer, `跨仓归还待复核，收货仓: ${warehouseCode}`);
  }

  return acceptance;
}

function createCrossWarehouseAcceptance(data) {
  const order = getOrderById(data.order_id);
  if (!order) throw new Error('订单不存在');
  if (order.status === ORDER_STATUS.CREATED) throw new Error('请先缴纳押金');

  const existingOpenDispute = db.prepare(
    `SELECT * FROM disputes WHERE order_id = ? AND status IN ('OPEN', 'PROCESSING')`
  ).get(data.order_id);
  if (existingOpenDispute) {
    throw new Error('该订单存在未处理的争议，请先处理争议');
  }

  const originWarehouse = order.origin_warehouse || data.origin_warehouse;
  const receiveWarehouse = data.receive_warehouse;
  if (!receiveWarehouse) throw new Error('请指定收货仓库');
  if (!originWarehouse) throw new Error('订单缺少原出库仓库信息');
  if (receiveWarehouse === originWarehouse) {
    throw new Error('收货仓库与原出库仓库相同，请使用正常验收流程');
  }

  const now = nowISO();
  const tempAcceptanceId = generateId();
  const crossReturnId = generateId();

  const crossStmt = db.prepare(`
    INSERT INTO cross_warehouse_returns (
      id, order_id, acceptance_id, receive_warehouse, origin_warehouse,
      device_code, returned_date, photos, accessories, temp_remark,
      temp_operator, review_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  crossStmt.run(
    crossReturnId, data.order_id, tempAcceptanceId, receiveWarehouse, originWarehouse,
    data.device_code, data.returned_date || now,
    data.photos ? JSON.stringify(data.photos) : null,
    data.accessories || '', data.temp_remark || '',
    data.operator || '', REVIEW_STATUS.PENDING, now, now
  );

  const accStmt = db.prepare(`
    INSERT INTO warehouse_acceptances (
      id, order_id, device_code, returned_date, accessories, missing_accessories,
      damage_level, overdue_days, reviewer, remark, is_locked, created_at, updated_at,
      warehouse_code, is_cross_warehouse, review_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `);
  accStmt.run(
    tempAcceptanceId, data.order_id, data.device_code, data.returned_date || now,
    data.accessories || '', '', 'NONE', 0,
    data.operator || '', '跨仓临时验收，待原责任仓复核',
    now, now, receiveWarehouse, 1, REVIEW_STATUS.PENDING
  );

  if (order.status === ORDER_STATUS.DEPOSIT_PAID) {
    updateOrderStatus(data.order_id, ORDER_STATUS.DEVICE_RETURNED, data.operator, '设备已归还（跨仓）');
  }
  addTimeline(data.order_id, 'CROSS_WAREHOUSE_RECEIVED', data.operator,
    `设备已由 ${receiveWarehouse} 收货，待原责任仓 ${originWarehouse} 复核`);

  return getCrossWarehouseReturnById(crossReturnId);
}

function reviewCrossWarehouseAcceptance(crossReturnId, data) {
  const crossReturn = getCrossWarehouseReturnById(crossReturnId);
  if (!crossReturn) throw new Error('跨仓归还记录不存在');
  if (crossReturn.review_status === REVIEW_STATUS.REVIEWED) {
    throw new Error('该跨仓归还记录已完成复核');
  }

  const order = getOrderById(crossReturn.order_id);
  const now = nowISO();

  const existingAcceptance = db.prepare(
    'SELECT * FROM warehouse_acceptances WHERE id = ?'
  ).get(crossReturn.acceptance_id);

  if (existingAcceptance) {
    if (existingAcceptance.damage_level !== data.damage_level) {
      const oldAmount = DAMAGE_LEVEL_MAP[existingAcceptance.damage_level] || 0;
      const newAmount = DAMAGE_LEVEL_MAP[data.damage_level] || 0;
      saveAcceptanceDiff(
        crossReturn.order_id, existingAcceptance.id, DIFF_TYPE.DAMAGE_LEVEL, 'damage_level',
        existingAcceptance.damage_level, data.damage_level, newAmount - oldAmount,
        data.reviewer, `复核: 损坏等级变更`
      );
    }
    if (existingAcceptance.missing_accessories !== (data.missing_accessories || '')) {
      const oldCount = existingAcceptance.missing_accessories ? existingAcceptance.missing_accessories.split(',').filter(s => s.trim()).length : 0;
      const newCount = data.missing_accessories ? data.missing_accessories.split(',').filter(s => s.trim()).length : 0;
      saveAcceptanceDiff(
        crossReturn.order_id, existingAcceptance.id, DIFF_TYPE.ACCESSORY, 'missing_accessories',
        existingAcceptance.missing_accessories, data.missing_accessories,
        (newCount - oldCount) * ACCESSORY_DEDUCTION_PER_ITEM,
        data.reviewer, `复核: 缺失配件变更`
      );
    }

    const overdueDays = data.overdue_days || calculateDaysBetween(order.rental_end_date, crossReturn.returned_date);
    if (existingAcceptance.overdue_days !== overdueDays) {
      saveAcceptanceDiff(
        crossReturn.order_id, existingAcceptance.id, DIFF_TYPE.OVERDUE_DAYS, 'overdue_days',
        existingAcceptance.overdue_days, overdueDays,
        (overdueDays - existingAcceptance.overdue_days) * OVERDUE_DEDUCTION_PER_DAY,
        data.reviewer, `复核: 逾期天数变更`
      );
    }

    const updateStmt = db.prepare(`
      UPDATE warehouse_acceptances SET
        missing_accessories = ?, damage_level = ?, overdue_days = ?,
        review_status = ?, review_reviewer = ?, reviewed_at = ?,
        remark = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(
      data.missing_accessories || '', data.damage_level || 'NONE',
      overdueDays, REVIEW_STATUS.REVIEWED, data.reviewer || '',
      now, data.remark || existingAcceptance.remark, now, existingAcceptance.id
    );
  }

  const updateCrossStmt = db.prepare(`
    UPDATE cross_warehouse_returns SET
      review_status = ?, review_remark = ?, review_operator = ?,
      reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `);
  updateCrossStmt.run(
    REVIEW_STATUS.REVIEWED, data.review_remark || '', data.reviewer || '',
    now, now, crossReturnId
  );

  saveAcceptanceDiff(
    crossReturn.order_id, crossReturn.acceptance_id, DIFF_TYPE.REVIEW, 'review_status',
    REVIEW_STATUS.PENDING, REVIEW_STATUS.REVIEWED, 0,
    data.reviewer, '跨仓验收复核完成'
  );

  updateOrderStatus(crossReturn.order_id, ORDER_STATUS.ACCEPTED, data.reviewer, '跨仓验收复核完成');
  addTimeline(crossReturn.order_id, 'CROSS_WAREHOUSE_REVIEWED', data.reviewer,
    `跨仓验收已由原责任仓复核完成，可申请退款`);

  return getCrossWarehouseReturnById(crossReturnId);
}

function getCrossWarehouseReturnById(id) {
  const cross = db.prepare('SELECT * FROM cross_warehouse_returns WHERE id = ?').get(id);
  if (!cross) return null;

  if (cross.photos) {
    try { cross.photos = JSON.parse(cross.photos); } catch (e) {}
  }
  cross.acceptance = getAcceptanceById(cross.acceptance_id);
  cross.order = getOrderById(cross.order_id);
  cross.diffs = db.prepare(
    'SELECT * FROM acceptance_diffs WHERE acceptance_id = ? ORDER BY created_at ASC'
  ).all(cross.acceptance_id);

  return cross;
}

function getCrossWarehouseByOrderId(orderId) {
  const cross = db.prepare(
    'SELECT * FROM cross_warehouse_returns WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
  return cross ? getCrossWarehouseReturnById(cross.id) : null;
}

function getWarehouseList() {
  return db.prepare('SELECT * FROM warehouses WHERE is_active = 1 ORDER BY warehouse_code').all();
}

function getAcceptanceDiffs(orderId) {
  return db.prepare(
    'SELECT * FROM acceptance_diffs WHERE order_id = ? ORDER BY created_at DESC'
  ).all(orderId);
}

function getAcceptanceById(id) {
  const acceptance = db.prepare('SELECT * FROM warehouse_acceptances WHERE id = ?').get(id);
  if (!acceptance) return null;

  acceptance.deduction_items = db.prepare(
    'SELECT * FROM deduction_items WHERE acceptance_id = ?'
  ).all(id);

  acceptance.order = getOrderById(acceptance.order_id);
  return acceptance;
}

function getAcceptanceByOrderId(orderId) {
  const acc = db.prepare(
    'SELECT * FROM warehouse_acceptances WHERE order_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(orderId);
  return acc ? getAcceptanceById(acc.id) : null;
}

function lockAcceptance(acceptanceId, operator) {
  const now = nowISO();
  const stmt = db.prepare(
    'UPDATE warehouse_acceptances SET is_locked = 1, updated_at = ? WHERE id = ?'
  );
  stmt.run(now, acceptanceId);
  const acceptance = getAcceptanceById(acceptanceId);
  if (acceptance) {
    addTimeline(acceptance.order_id, 'ACCEPTANCE_LOCKED', operator, '验收记录已锁定（退款完成）');
  }
  return acceptance;
}

function addReviewRemark(acceptanceId, reviewRemark, operator) {
  const now = nowISO();
  const stmt = db.prepare(
    'UPDATE warehouse_acceptances SET review_remark = COALESCE(review_remark, "") || ? , updated_at = ? WHERE id = ?'
  );
  const suffix = (reviewRemark || '').trim();
  const prefix = (db.prepare('SELECT review_remark FROM warehouse_acceptances WHERE id = ?').get(acceptanceId).review_remark || '').trim();
  const combined = prefix ? `${prefix}\n[${nowISO()}] ${operator || 'reviewer'}: ${suffix}` : `[${nowISO()}] ${operator || 'reviewer'}: ${suffix}`;
  const stmt2 = db.prepare(
    'UPDATE warehouse_acceptances SET review_remark = ?, updated_at = ? WHERE id = ?'
  );
  stmt2.run(combined, now, acceptanceId);
  return getAcceptanceById(acceptanceId);
}

function generateDeductionItems(acceptanceId) {
  const acceptance = getAcceptanceById(acceptanceId);
  if (!acceptance) throw new Error('验收记录不存在');

  const order = acceptance.order;
  const { deductions, overdueDays } = calculateAcceptanceDeductions(acceptance, order);

  db.prepare('DELETE FROM deduction_items WHERE acceptance_id = ? AND refund_id IS NULL').run(acceptanceId);

  const insertStmt = db.prepare(`
    INSERT INTO deduction_items (id, acceptance_id, refund_id, rule_id, deduction_type, deduction_name, amount, remark, created_at)
    VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?)
  `);

  for (const d of deductions) {
    insertStmt.run(generateId(), acceptanceId, d.deduction_type, d.deduction_name, d.amount, d.remark || '', nowISO());
  }

  if (overdueDays > 0 && !acceptance.overdue_days) {
    db.prepare('UPDATE warehouse_acceptances SET overdue_days = ?, updated_at = ? WHERE id = ?')
      .run(overdueDays, nowISO(), acceptanceId);
  }

  return getAcceptanceById(acceptanceId);
}

function getDeductionRules() {
  return db.prepare('SELECT * FROM deduction_rules WHERE is_active = 1').all();
}

module.exports = {
  createAcceptance,
  createCrossWarehouseAcceptance,
  reviewCrossWarehouseAcceptance,
  getAcceptanceById,
  getAcceptanceByOrderId,
  getCrossWarehouseReturnById,
  getCrossWarehouseByOrderId,
  getWarehouseList,
  getAcceptanceDiffs,
  lockAcceptance,
  addReviewRemark,
  generateDeductionItems,
  calculateAcceptanceDeductions,
  getDeductionRules,
  saveAcceptanceDiff
};
