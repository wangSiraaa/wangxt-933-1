import React from 'react';

export default function DeductionPanel({ order, showToast, refresh }) {
  const acceptance = order.acceptance;
  const items = acceptance?.deduction_items || [];

  if (!acceptance) {
    return (
      <div className="card">
        <h3 className="card-title">扣款明细</h3>
        <div className="alert alert-warning">请先完成仓库验收。</div>
      </div>
    );
  }

  const total = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const deposit = order.paid_deposit || 0;
  const actualDeduct = Math.min(total, deposit);
  const refund = Math.max(0, deposit - actualDeduct);

  return (
    <div className="card">
      <h3 className="card-title">扣款明细</h3>

      {items.length === 0 ? (
        <div className="empty-state">暂无扣款记录，请创建退款申请自动计算扣款</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>扣款类型</th>
              <th>名称</th>
              <th>金额</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>
                  <span className={`badge ${
                    i.deduction_type === 'DAMAGE' ? 'badge-red' :
                    i.deduction_type === 'ACCESSORY' ? 'badge-yellow' : 'badge-purple'
                  }`}>
                    {i.deduction_type === 'DAMAGE' ? '损坏' :
                     i.deduction_type === 'ACCESSORY' ? '配件' : '逾期'}
                  </span>
                </td>
                <td>{i.deduction_name}</td>
                <td className="amount-deduct">-¥{i.amount.toFixed(2)}</td>
                <td style={{ fontSize: 12, color: '#6b7280' }}>{i.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="section-divider" />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div>
          <div className="amount-small">押金总额</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>¥{deposit.toFixed(2)}</div>
        </div>
        <div>
          <div className="amount-small">扣款合计{total > deposit ? '（已封顶）' : ''}</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#dc2626' }}>
            -¥{actualDeduct.toFixed(2)}
            {total > deposit && <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>
              原计算¥{total.toFixed(2)}
            </span>}
          </div>
        </div>
        <div>
          <div className="amount-small">预计可退</div>
          <div className="amount-large">¥{refund.toFixed(2)}</div>
        </div>
      </div>

      {total > deposit && (
        <div className="alert alert-warning" style={{ marginTop: 12 }}>
          扣款总额 ¥{total.toFixed(2)} 已超过押金 ¥{deposit.toFixed(2)}，实际扣减以押金为上限。
        </div>
      )}
    </div>
  );
}
