#!/usr/bin/env node
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    errors.push({ name: testName, detail });
    console.log(`  ✗ FAIL: ${testName}${detail ? ' - ' + detail : ''}`);
  }
}

async function waitForHealth() {
  console.log('\n等待服务就绪...');
  for (let i = 0; i < 30; i++) {
    try {
      const r = await request('/api/health');
      if (r.ok && r.data.status === 'ok') {
        console.log('  服务已就绪');
        return true;
      }
    } catch (e) {}
    await new Promise(res => setTimeout(res, 2000));
  }
  console.log('  服务未就绪');
  return false;
}

async function createAndPayOrder(depositAmount = 1000) {
  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const r1 = await request('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer_name: '测试客户',
      customer_contact: '13800138000',
      device_name: '测试设备',
      device_code: 'DEV-' + Date.now(),
      deposit_amount: depositAmount,
      rent_amount: 100,
      rental_start_date: today,
      rental_end_date: endDate
    })
  });
  const orderId = r1.data.data.id;
  await request(`/api/orders/${orderId}/pay-deposit`, {
    method: 'POST',
    body: JSON.stringify({ amount: depositAmount, operator: 'tester' })
  });
  return orderId;
}

async function createAcceptance(orderId, opts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const r = await request('/api/acceptances', {
    method: 'POST',
    body: JSON.stringify({
      order_id: orderId,
      device_code: 'DEV-TEST',
      returned_date: today,
      accessories: '电源,说明书',
      missing_accessories: opts.missing_accessories || '',
      damage_level: opts.damage_level || 'NONE',
      overdue_days: opts.overdue_days || 0,
      reviewer: 'tester',
      remark: opts.remark || ''
    })
  });
  return r.data.data;
}

async function runTests() {
  console.log('\n========================================');
  console.log('  设备租赁押金退还系统 - Smoke 测试');
  console.log('========================================');

  const healthy = await waitForHealth();
  if (!healthy) {
    console.log('\n服务启动失败，退出测试');
    process.exit(1);
  }

  console.log('\n--- 测试1: 设备未归还，退款应该失败 ---');
  try {
    const orderId = await createAndPayOrder(1000);
    const r = await request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, applicant: 'tester' })
    });
    assert(!r.ok, '未验收时创建退款返回非200状态', `状态码: ${r.status}`);
    assert(
      r.data.error && (
        r.data.error.includes('未归还') ||
        r.data.error.includes('验收') ||
        r.data.error.includes('未完成验收')
      ),
      '错误信息包含"未归还/验收"提示',
      `实际错误: ${r.data.error || '无'}`
    );
  } catch (e) {
    assert(false, '测试1异常', e.message);
  }

  console.log('\n--- 测试2: 扣款总额不能超过押金（扣款上限） ---');
  try {
    const orderId = await createAndPayOrder(1000);
    await createAcceptance(orderId, {
      damage_level: 'SEVERE',
      missing_accessories: '电源,说明书,包装,配件A,配件B',
      overdue_days: 100
    });
    const r = await request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, applicant: 'tester' })
    });
    assert(r.ok, '退款创建成功', r.data.error || '');
    const refund = r.data.data;
    assert(refund.total_deduction <= 1000,
      `扣款总额(${refund.total_deduction})不超过押金(1000)`);
    assert(refund.refund_amount >= 0,
      `退款金额(${refund.refund_amount})不为负数`);
    assert(refund.total_deduction === 1000,
      `极端情况下扣款封顶为押金1000，实际: ${refund.total_deduction}`);
    assert(refund.refund_amount === 0,
      `极端情况下退款为0，实际: ${refund.refund_amount}`);
  } catch (e) {
    assert(false, '测试2异常', e.message);
  }

  console.log('\n--- 测试3: 退款完成后验收记录被锁定，不可修改 ---');
  try {
    const orderId = await createAndPayOrder(2000);
    await createAcceptance(orderId, { damage_level: 'LIGHT', overdue_days: 2 });
    const r1 = await request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, applicant: 'tester' })
    });
    const refundId = r1.data.data.id;

    await request(`/api/refunds/${refundId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approver: 'approver' })
    });
    await request(`/api/refunds/${refundId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ operator: 'operator' })
    });

    const acc = await request(`/api/acceptances/order/${orderId}`);
    assert(acc.data.data.is_locked === 1 || acc.data.data.is_locked === true,
      '验收记录is_locked字段为1/true', `实际值: ${acc.data.data.is_locked}`);

    const r2 = await request('/api/acceptances', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        device_code: 'HACKED',
        returned_date: new Date().toISOString().split('T')[0],
        damage_level: 'NONE',
        reviewer: 'hacker'
      })
    });
    assert(!r2.ok, '锁定后修改验收返回错误状态', `状态码: ${r2.status}`);
    assert(
      r2.data.error && (
        r2.data.error.includes('锁定') ||
        r2.data.error.includes('lock') ||
        r2.data.error.includes('修改')
      ),
      '错误信息包含锁定/不可修改提示',
      `实际错误: ${r2.data.error || '无'}`
    );

    const r3 = await request(`/api/acceptances/${acc.data.data.id}/review-remark`, {
      method: 'POST',
      body: JSON.stringify({ review_remark: '追加复核说明', operator: 'reviewer' })
    });
    assert(r3.ok, '锁定后仍可追加复核说明', r3.data.error || '');
    assert(
      r3.data.data.review_remark && r3.data.data.review_remark.includes('追加复核说明'),
      '复核说明已追加到验收记录中',
      `实际内容: ${r3.data.data.review_remark || '空'}`
    );
  } catch (e) {
    assert(false, '测试3异常', e.message);
  }

  console.log('\n--- 测试4: 同一订单不能重复发起退款 ---');
  try {
    const orderId = await createAndPayOrder(1500);
    await createAcceptance(orderId, { damage_level: 'NONE' });
    await request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, applicant: 'tester' })
    });
    const r = await request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify({ order_id: orderId, applicant: 'tester2' })
    });
    assert(!r.ok, '重复退款返回错误状态', `状态码: ${r.status}`);
    assert(
      r.data.error && (
        r.data.error.includes('重复') ||
        r.data.error.includes('已有') ||
        r.data.error.includes('不能重复')
      ),
      '错误信息包含重复/已有退款提示',
      `实际错误: ${r.data.error || '无'}`
    );
  } catch (e) {
    assert(false, '测试4异常', e.message);
  }

  console.log('\n========================================');
  console.log(`  测试结果: 通过 ${passed} 项, 失败 ${failed} 项`);
  console.log('========================================');

  if (errors.length > 0) {
    console.log('\n失败详情:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.detail}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
