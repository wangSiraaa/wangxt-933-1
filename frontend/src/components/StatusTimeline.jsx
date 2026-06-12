import React from 'react';

const STATUS_LABELS = {
  CREATED: '订单创建',
  DEPOSIT_PAID: '押金缴纳',
  DEVICE_RETURNED: '设备归还',
  ACCEPTED: '验收完成',
  REFUND_PENDING: '退款申请',
  REFUND_APPROVED: '退款审批通过',
  REFUND_COMPLETED: '退款完成',
  CLOSED: '订单关闭',
  ACCEPTANCE_LOCKED: '验收记录锁定',
  REFUND_REJECTED: '退款申请被驳回'
};

export default function StatusTimeline({ timeline }) {
  return (
    <div className="card">
      <h3 className="card-title">状态时间线</h3>
      {!timeline || timeline.length === 0 ? (
        <div className="empty-state">暂无状态记录</div>
      ) : (
        <div className="timeline">
          {timeline.map(t => (
            <div className="timeline-item" key={t.id}>
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-title">{STATUS_LABELS[t.status] || t.status}</div>
                <div className="timeline-time">
                  {t.operator || 'system'} · {new Date(t.created_at).toLocaleString('zh-CN')}
                </div>
                {t.remark && <div className="timeline-remark">{t.remark}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
