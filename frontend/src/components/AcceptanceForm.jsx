import React, { useState } from 'react';
import { api } from '../api.js';

const DAMAGE_OPTIONS = [
  { value: 'NONE', label: '无损坏' },
  { value: 'LIGHT', label: '轻微损坏' },
  { value: 'MEDIUM', label: '中度损坏' },
  { value: 'SEVERE', label: '严重损坏' }
];

export default function AcceptanceForm({ order, showToast, refresh }) {
  const acceptance = order.acceptance;
  const locked = acceptance && acceptance.is_locked;

  const [form, setForm] = useState({
    device_code: acceptance?.device_code || order.device_code || '',
    returned_date: acceptance?.returned_date || new Date().toISOString().split('T')[0],
    accessories: acceptance?.accessories || '电源适配器,说明书,包装',
    missing_accessories: acceptance?.missing_accessories || '',
    damage_level: acceptance?.damage_level || 'NONE',
    overdue_days: acceptance?.overdue_days || 0,
    reviewer: acceptance?.reviewer || '',
    remark: acceptance?.remark || ''
  });

  const [reviewRemark, setReviewRemark] = useState('');

  if (order.status === 'CREATED') {
    return (
      <div className="card">
        <h3 className="card-title">仓库验收</h3>
        <div className="alert alert-warning">请先缴纳押金，完成设备归还后再进行验收。</div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return showToast('验收记录已锁定，无法修改', 'error');
    try {
      await api.createAcceptance({
        ...form,
        order_id: order.id
      });
      showToast('验收记录已保存', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const handleAddReviewRemark = async () => {
    if (!reviewRemark.trim()) return;
    try {
      await api.addReviewRemark(acceptance.id, reviewRemark, 'reviewer');
      setReviewRemark('');
      showToast('复核说明已追加', 'success');
      refresh();
    } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div className="card">
      <h3 className="card-title">
        仓库验收
        {locked && <span className="lock-badge" style={{ marginLeft: 8 }}>已锁定</span>}
      </h3>

      {locked && (
        <div className="alert alert-info">
          退款已完成，验收记录已锁定，无法修改字段。如需补充说明，请在下方追加复核说明。
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>设备编号</label>
            <input value={form.device_code} disabled={locked}
              onChange={e => setForm({ ...form, device_code: e.target.value })} />
          </div>
          <div className="form-group">
            <label>归还日期</label>
            <input type="date" value={form.returned_date} disabled={locked}
              onChange={e => setForm({ ...form, returned_date: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>配件清单（逗号分隔）</label>
            <input value={form.accessories} disabled={locked}
              onChange={e => setForm({ ...form, accessories: e.target.value })}
              placeholder="电源适配器,说明书,包装" />
          </div>
          <div className="form-group">
            <label>缺失配件（逗号分隔）</label>
            <input value={form.missing_accessories} disabled={locked}
              onChange={e => setForm({ ...form, missing_accessories: e.target.value })}
              placeholder="如：电源适配器,说明书" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>损坏等级</label>
            <select value={form.damage_level} disabled={locked}
              onChange={e => setForm({ ...form, damage_level: e.target.value })}>
              {DAMAGE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>逾期天数（0=自动计算）</label>
            <input type="number" value={form.overdue_days} disabled={locked}
              onChange={e => setForm({ ...form, overdue_days: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="form-group">
            <label>验收人</label>
            <input value={form.reviewer} disabled={locked}
              onChange={e => setForm({ ...form, reviewer: e.target.value })} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>验收备注</label>
          <textarea rows={2} value={form.remark} disabled={locked}
            onChange={e => setForm({ ...form, remark: e.target.value })} />
        </div>

        {!locked ? (
          <button type="submit" className="btn btn-primary">
            {acceptance ? '更新验收记录' : '提交验收'}
          </button>
        ) : (
          acceptance?.review_remark && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>复核说明：</div>
              <pre style={{
                background: '#f9fafb', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'inherit',
                border: '1px solid #e5e7eb'
              }}>{acceptance.review_remark}</pre>
            </div>
          )
        )}
      </form>

      {locked && (
        <div className="section-divider" />
      )}

      {locked && (
        <div>
          <div className="form-group">
            <label>追加复核说明</label>
            <textarea rows={2} value={reviewRemark}
              onChange={e => setReviewRemark(e.target.value)}
              placeholder="补充说明内容..." />
          </div>
          <button className="btn btn-secondary" onClick={handleAddReviewRemark}>
            追加说明
          </button>
        </div>
      )}
    </div>
  );
}
