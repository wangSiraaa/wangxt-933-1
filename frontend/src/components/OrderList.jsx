import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

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

export default function OrderList({ showToast, goToDetail }) {
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    customer_contact: '',
    device_name: '',
    device_code: '',
    deposit_amount: 1000,
    rent_amount: 0,
    rental_start_date: new Date().toISOString().split('T')[0],
    rental_end_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
  });

  const loadOrders = async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.createOrder(form);
      showToast('订单创建成功', 'success');
      setShowForm(false);
      loadOrders();
      setForm({
        customer_name: '', customer_contact: '', device_name: '', device_code: '',
        deposit_amount: 1000, rent_amount: 0,
        rental_start_date: new Date().toISOString().split('T')[0],
        rental_end_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
      });
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="page-title">订单列表</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '+ 新建订单'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 className="card-title">新建租赁订单</h3>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>客户名称 *</label>
                <input required value={form.customer_name}
                  onChange={e => setForm({ ...form, customer_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>联系方式</label>
                <input value={form.customer_contact}
                  onChange={e => setForm({ ...form, customer_contact: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>设备名称 *</label>
                <input required value={form.device_name}
                  onChange={e => setForm({ ...form, device_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>设备编号 *</label>
                <input required value={form.device_code}
                  onChange={e => setForm({ ...form, device_code: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>押金金额 (元) *</label>
                <input type="number" required value={form.deposit_amount}
                  onChange={e => setForm({ ...form, deposit_amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>租金金额 (元)</label>
                <input type="number" value={form.rent_amount}
                  onChange={e => setForm({ ...form, rent_amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>租赁开始日期 *</label>
                <input type="date" required value={form.rental_start_date}
                  onChange={e => setForm({ ...form, rental_start_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>租赁结束日期 *</label>
                <input type="date" required value={form.rental_end_date}
                  onChange={e => setForm({ ...form, rental_end_date: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">创建订单</button>
          </form>
        </div>
      )}

      <div className="card">
        {orders.length === 0 ? (
          <div className="empty-state">暂无订单数据</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>订单编号</th>
                <th>客户</th>
                <th>设备</th>
                <th>押金</th>
                <th>已缴押金</th>
                <th>租期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const s = STATUS_BADGE[o.status] || { cls: 'badge-gray', label: o.status };
                return (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'monospace' }}>{o.order_no}</td>
                    <td>{o.customer_name}</td>
                    <td>{o.device_name} ({o.device_code})</td>
                    <td>¥{o.deposit_amount.toFixed(2)}</td>
                    <td>¥{o.paid_deposit.toFixed(2)}</td>
                    <td style={{ fontSize: 12 }}>{o.rental_start_date} ~ {o.rental_end_date}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => goToDetail(o.id)}>
                        查看详情
                      </button>
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
