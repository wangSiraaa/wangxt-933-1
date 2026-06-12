import { useState, useEffect } from 'react';
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

const createRules = {
  customer_name: [
    { required: true, message: '请输入客户名称' },
    { min: 2, message: '客户名称至少2个字符' }
  ],
  customer_contact: [
    { pattern: /^$|^1[3-9]\d{9}$/, message: '请输入有效的手机号码' }
  ],
  device_name: [
    { required: true, message: '请输入设备名称' }
  ],
  device_code: [
    { required: true, message: '请输入设备编号' },
    { min: 2, message: '设备编号至少2个字符' }
  ],
  deposit_amount: [
    { required: true, message: '请输入押金金额' },
    { min: 1, type: 'number', message: '押金金额必须大于0' }
  ],
  rental_start_date: [
    { required: true, message: '请选择租赁开始日期' }
  ],
  rental_end_date: [
    { required: true, message: '请选择租赁结束日期' }
  ]
};

function validateField(fieldName, value, rules) {
  if (!rules) return '';
  for (const rule of rules) {
    if (rule.required && (!value || (typeof value === 'string' && !value.trim()))) {
      return rule.message;
    }
    if (rule.min && typeof value === 'string' && value.trim().length < rule.min) {
      return rule.message;
    }
    if (rule.min !== undefined && rule.type === 'number' && (isNaN(value) || value < rule.min)) {
      return rule.message;
    }
    if (rule.pattern && value && !rule.pattern.test(value)) {
      return rule.message;
    }
  }
  return '';
}

function validateForm(form, rules) {
  const errors = {};
  let hasError = false;
  for (const fieldName of Object.keys(rules)) {
    const error = validateField(fieldName, form[fieldName], rules[fieldName]);
    if (error) {
      errors[fieldName] = error;
      hasError = true;
    }
  }
  return { errors, hasError };
}

const INITIAL_FORM = {
  customer_name: '',
  customer_contact: '',
  device_name: '',
  device_code: '',
  deposit_amount: 1000,
  rent_amount: 0,
  rental_start_date: new Date().toISOString().split('T')[0],
  rental_end_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
};

export default function OrderList({ showToast, goToDetail }) {
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [errors, setErrors] = useState({});

  const loadOrders = async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const handleFieldChange = (fieldName, value) => {
    setForm(prev => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      const error = validateField(fieldName, value, createRules[fieldName]);
      setErrors(prev => ({ ...prev, [fieldName]: error }));
    }
  };

  const handleBlur = (fieldName) => {
    const error = validateField(fieldName, form[fieldName], createRules[fieldName]);
    setErrors(prev => ({ ...prev, [fieldName]: error }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const { errors: validationErrors, hasError } = validateForm(form, createRules);
    setErrors(validationErrors);
    if (hasError) {
      showToast('请检查表单填写是否正确', 'error');
      return;
    }
    if (form.rental_start_date && form.rental_end_date && form.rental_start_date > form.rental_end_date) {
      setErrors(prev => ({ ...prev, rental_end_date: '结束日期不能早于开始日期' }));
      showToast('租赁结束日期不能早于开始日期', 'error');
      return;
    }
    try {
      await api.createOrder(form);
      showToast('订单创建成功', 'success');
      setShowForm(false);
      setForm({ ...INITIAL_FORM });
      setErrors({});
      loadOrders();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const renderFieldError = (fieldName) => {
    if (!errors[fieldName]) return null;
    return <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errors[fieldName]}</div>;
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
                <input value={form.customer_name}
                  className={errors.customer_name ? 'input-error' : ''}
                  onChange={e => handleFieldChange('customer_name', e.target.value)}
                  onBlur={() => handleBlur('customer_name')}
                  placeholder="请输入客户名称" />
                {renderFieldError('customer_name')}
              </div>
              <div className="form-group">
                <label>联系方式</label>
                <input value={form.customer_contact}
                  className={errors.customer_contact ? 'input-error' : ''}
                  onChange={e => handleFieldChange('customer_contact', e.target.value)}
                  onBlur={() => handleBlur('customer_contact')}
                  placeholder="手机号码" />
                {renderFieldError('customer_contact')}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>设备名称 *</label>
                <input value={form.device_name}
                  className={errors.device_name ? 'input-error' : ''}
                  onChange={e => handleFieldChange('device_name', e.target.value)}
                  onBlur={() => handleBlur('device_name')}
                  placeholder="请输入设备名称" />
                {renderFieldError('device_name')}
              </div>
              <div className="form-group">
                <label>设备编号 *</label>
                <input value={form.device_code}
                  className={errors.device_code ? 'input-error' : ''}
                  onChange={e => handleFieldChange('device_code', e.target.value)}
                  onBlur={() => handleBlur('device_code')}
                  placeholder="请输入设备编号" />
                {renderFieldError('device_code')}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>押金金额 (元) *</label>
                <input type="number" value={form.deposit_amount}
                  className={errors.deposit_amount ? 'input-error' : ''}
                  onChange={e => handleFieldChange('deposit_amount', parseFloat(e.target.value) || 0)}
                  onBlur={() => handleBlur('deposit_amount')} />
                {renderFieldError('deposit_amount')}
              </div>
              <div className="form-group">
                <label>租金金额 (元)</label>
                <input type="number" value={form.rent_amount}
                  onChange={e => handleFieldChange('rent_amount', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label>租赁开始日期 *</label>
                <input type="date" value={form.rental_start_date}
                  className={errors.rental_start_date ? 'input-error' : ''}
                  onChange={e => handleFieldChange('rental_start_date', e.target.value)}
                  onBlur={() => handleBlur('rental_start_date')} />
                {renderFieldError('rental_start_date')}
              </div>
              <div className="form-group">
                <label>租赁结束日期 *</label>
                <input type="date" value={form.rental_end_date}
                  className={errors.rental_end_date ? 'input-error' : ''}
                  onChange={e => handleFieldChange('rental_end_date', e.target.value)}
                  onBlur={() => handleBlur('rental_end_date')} />
                {renderFieldError('rental_end_date')}
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
