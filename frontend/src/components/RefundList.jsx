import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

const REFUND_STATUS = {
  PENDING: { cls: 'badge-yellow', label: '待审批' },
  APPROVED: { cls: 'badge-blue', label: '已审批' },
  COMPLETED: { cls: 'badge-green', label: '已完成' },
  REJECTED: { cls: 'badge-red', label: '已驳回' },
  CANCELLED: { cls: 'badge-gray', label: '已取消' }
};

export default function RefundList({ showToast }) {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api.getRefunds();
      setRefunds(data);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    try {
      await api.approveRefund(id, 'approver', '');
      showToast('审批通过', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleComplete = async (id) => {
    try {
      await api.completeRefund(id, 'operator');
      showToast('退款完成', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleReject = async (id) => {
    const reason = prompt('请输入驳回原因:');
    if (!reason) return;
    try {
      await api.rejectRefund(id, 'approver', reason);
      showToast('已驳回', 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div>
      <h2 className="page-title">退款审批</h2>

      <div className="card">
        {loading ? (
          <div>加载中...</div>
        ) : refunds.length === 0 ? (
          <div className="empty-state">暂无退款申请</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>退款编号</th>
                <th>订单编号</th>
                <th>客户</th>
                <th>押金</th>
                <th>扣款</th>
                <th>退款金额</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map(r => {
                const s = REFUND_STATUS[r.status] || { cls: 'badge-gray', label: r.status };
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace' }}>{r.refund_no}</td>
                    <td style={{ fontFamily: 'monospace' }}>{r.order?.order_no}</td>
                    <td>{r.order?.customer_name}</td>
                    <td>¥{r.deposit_amount.toFixed(2)}</td>
                    <td className="amount-deduct">-¥{r.total_deduction.toFixed(2)}</td>
                    <td style={{ fontWeight: 600, color: '#16a34a' }}>¥{r.refund_amount.toFixed(2)}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td style={{ fontSize: 12 }}>{r.created_at}</td>
                    <td>
                      <div className="btn-group" style={{ gap: 4 }}>
                        {r.status === 'PENDING' && (
                          <>
                            <button className="btn btn-success" style={{ padding: '5px 12px', fontSize: 12 }}
                              onClick={() => handleApprove(r.id)}>通过</button>
                            <button className="btn btn-danger" style={{ padding: '5px 12px', fontSize: 12 }}
                              onClick={() => handleReject(r.id)}>驳回</button>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }}
                            onClick={() => handleComplete(r.id)}>完成</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
