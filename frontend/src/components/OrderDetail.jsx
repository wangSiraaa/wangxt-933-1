import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import StatusTimeline from './StatusTimeline.jsx';
import AcceptanceForm from './AcceptanceForm.jsx';
import DeductionPanel from './DeductionPanel.jsx';
import RefundPanel from './RefundPanel.jsx';

const STATUS_BADGE = {
  CREATED: { cls: 'badge-gray', label: '待缴押金' },
  DEPOSIT_PAID: { cls: 'badge-blue', label: '押金已缴' },
  DEVICE_RETURNED: { cls: 'badge-yellow', label: '待验收' },
  ACCEPTED: { cls: 'badge-purple', label: '已验收' },
  REFUND_PENDING: { cls: 'badge-yellow', label: '退款待审' },
  REFUND_APPROVED: { cls: 'badge-blue', label: '退款已批' },
  REFUND_COMPLETED: { cls: 'badge-green', label: '退款完成' },
  CLOSED: { cls: 'badge-gray', label: '已关闭' }
};

export default function OrderDetail({ orderId, showToast, goBack }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState(0);

  const loadOrder = async () => {
    try {
      const data = await api.getOrder(orderId);
      setOrder(data);
      setPayAmount(data.deposit_amount - data.paid_deposit);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrder(); }, [orderId]);

  const handlePayDeposit = async () => {
    if (payAmount <= 0) return showToast('请输入金额', 'error');
    try {
      await api.payDeposit(orderId, payAmount, 'operator');
      showToast('押金缴纳成功', 'success');
      loadOrder();
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (loading) return <div className="card">加载中...</div>;
  if (!order) return <div className="card">订单不存在</div>;

  const s = STATUS_BADGE[order.status] || { cls: 'badge-gray', label: order.status };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={goBack}>← 返回列表</button>
      </div>

      <div className="order-detail-header">
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>
            订单详情 - {order.order_no}
            <span className={`badge ${s.cls}`} style={{ marginLeft: 12, verticalAlign: 'middle' }}>{s.label}</span>
          </h2>
          <p style={{ color: '#6b7280', fontSize: 13 }}>创建时间: {order.created_at}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">订单信息</h3>
        <div className="two-col">
          <div>
            <div className="info-row"><span className="info-label">客户名称</span><span className="info-value">{order.customer_name}</span></div>
            <div className="info-row"><span className="info-label">联系方式</span><span className="info-value">{order.customer_contact || '-'}</span></div>
            <div className="info-row"><span className="info-label">设备名称</span><span className="info-value">{order.device_name}</span></div>
            <div className="info-row"><span className="info-label">设备编号</span><span className="info-value" style={{ fontFamily: 'monospace' }}>{order.device_code}</span></div>
          </div>
          <div>
            <div className="info-row"><span className="info-label">押金金额</span><span className="info-value">¥{order.deposit_amount.toFixed(2)}</span></div>
            <div className="info-row"><span className="info-label">已缴押金</span><span className="info-value" style={{ color: order.paid_deposit >= order.deposit_amount ? '#16a34a' : '#f59e0b' }}>¥{order.paid_deposit.toFixed(2)}</span></div>
            <div className="info-row"><span className="info-label">租金金额</span><span className="info-value">¥{order.rent_amount.toFixed(2)}</span></div>
            <div className="info-row"><span className="info-label">租赁期</span><span className="info-value">{order.rental_start_date} ~ {order.rental_end_date}</span></div>
          </div>
        </div>

        {order.status === 'CREATED' && (
          <>
            <div className="section-divider" />
            <div className="alert alert-info">押金尚未缴纳，请先完成押金支付后再进行后续操作。</div>
            <div className="form-row">
              <div className="form-group" style={{ flex: '0 0 200px' }}>
                <label>支付金额 (元)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-success" onClick={handlePayDeposit}>缴纳押金</button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <div>
          <AcceptanceForm order={order} showToast={showToast} refresh={loadOrder} />
          <DeductionPanel order={order} showToast={showToast} refresh={loadOrder} />
        </div>
        <div>
          <RefundPanel order={order} showToast={showToast} refresh={loadOrder} />
          <StatusTimeline timeline={order.timeline || []} />
        </div>
      </div>
    </div>
  );
}
