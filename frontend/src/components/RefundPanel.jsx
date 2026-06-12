import React, { useState } from 'react';
import { api } from '../api.js';

const REFUND_STATUS = {
  PENDING: { cls: 'badge-yellow', label: '待审批' },
  APPROVED: { cls: 'badge-blue', label: '已审批' },
  COMPLETED: { cls: 'badge-green', label: '已完成' },
  REJECTED: { cls: 'badge-red', label: '已驳回' },
  CANCELLED: { cls: 'badge-gray', label: '已取消' }
};

export default function RefundPanel({ order, showToast, refresh }) {
  const refund = order.refunds && order.refunds.length > 0 ? order.refunds[0] : null;
  const [rejectReason, setRejectReason] = useState('');

  const canCreateRefund =
    order.status === 'ACCEPTED' &&
    (!refund || ['REJECTED', 'CANCELLED'].includes(refund.status));

  const handleCreate = async () => {
    try {
      await api.createRefund(order.id, 'applicant', '');
      showToast('退款申请已创建', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleApprove = async () => {
    try {
      await api.approveRefund(refund.id, 'approver', '审批通过');
      showToast('退款已审批通过', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleComplete = async () => {
    try {
      await api.completeRefund(refund.id, 'operator');
      showToast('退款已完成，验收记录已锁定', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return showToast('请输入驳回原因', 'error');
    try {
      await api.rejectRefund(refund.id, 'approver', rejectReason);
      setRejectReason('');
      showToast('退款已驳回', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="card">
      <h3 className="card-title">财务退款</h3>

      {!refund && order.status !== 'ACCEPTED' && order.status !== 'REFUND_PENDING' &&
        order.status !== 'REFUND_APPROVED' && order.status !== 'REFUND_COMPLETED' && (
        <div className="alert alert-warning">
          请先完成仓库验收，然后再发起退款申请。
        </div>
      )}

      {!refund && canCreateRefund && (
        <div>
          <div className="alert alert-info">
            验收已完成，可以发起退款申请。系统将根据验收结果自动计算扣款和退款金额。
          </div>
          <button className="btn btn-primary" onClick={handleCreate}>
            发起退款申请
          </button>
        </div>
      )}

      {refund && (() => {
        const s = REFUND_STATUS[refund.status] || { cls: 'badge-gray', label: refund.status };
        return (
          <div>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{refund.refund_no}</span>
              <span className={`badge ${s.cls}`}>{s.label}</span>
            </div>

            <div className="info-row">
              <span className="info-label">押金</span>
              <span className="info-value">¥{refund.deposit_amount.toFixed(2)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">扣款合计</span>
              <span className="info-value" style={{ color: '#dc2626' }}>
                -¥{refund.total_deduction.toFixed(2)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">实退金额</span>
              <span className="info-value amount-large">¥{refund.refund_amount.toFixed(2)}</span>
            </div>

            {refund.remark && (
              <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                备注：{refund.remark}
              </div>
            )}

            <div className="section-divider" />

            <div className="btn-group">
              {refund.status === 'PENDING' && (
                <>
                  <button className="btn btn-success" onClick={handleApprove}>
                    审批通过
                  </button>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      placeholder="驳回原因"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                    />
                    <button className="btn btn-danger" onClick={handleReject}>驳回</button>
                  </div>
                </>
              )}
              {refund.status === 'APPROVED' && (
                <button className="btn btn-primary" onClick={handleComplete}>
                  确认退款完成
                </button>
              )}
              {refund.status === 'COMPLETED' && (
                <div className="alert alert-success">
                  退款已完成，验收记录已锁定不可修改。
                </div>
              )}
              {refund.status === 'REJECTED' && (
                <>
                  <div className="alert alert-danger">退款已被驳回。</div>
                  <button className="btn btn-primary" onClick={handleCreate}>
                    重新发起退款
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
