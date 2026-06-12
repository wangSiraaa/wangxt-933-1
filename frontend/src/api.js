const BASE_URL = '';

async function request(url, options = {}) {
  const response = await fetch(BASE_URL + url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data.data;
}

export const api = {
  health: () => request('/api/health'),
  getMeta: () => request('/api/meta/statuses'),
  getOrders: () => request('/api/orders'),
  getOrder: (id) => request(`/api/orders/${id}`),
  createOrder: (data) => request('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  payDeposit: (id, amount, operator) =>
    request(`/api/orders/${id}/pay-deposit`, { method: 'POST', body: JSON.stringify({ amount, operator }) }),

  createAcceptance: (data) => request('/api/acceptances', { method: 'POST', body: JSON.stringify(data) }),
  getAcceptanceByOrder: (orderId) => request(`/api/acceptances/order/${orderId}`),
  generateDeductions: (id) => request(`/api/acceptances/${id}/generate-deductions`, { method: 'POST' }),
  addReviewRemark: (id, review_remark, operator) =>
    request(`/api/acceptances/${id}/review-remark`, { method: 'POST', body: JSON.stringify({ review_remark, operator }) }),

  getDeductionRules: () => request('/api/deduction-rules'),

  createRefund: (order_id, applicant, remark) =>
    request('/api/refunds', { method: 'POST', body: JSON.stringify({ order_id, applicant, remark }) }),
  getRefunds: () => request('/api/refunds'),
  getRefund: (id) => request(`/api/refunds/${id}`),
  getRefundByOrder: (orderId) => request(`/api/refunds/order/${orderId}`),
  approveRefund: (id, approver, remark) =>
    request(`/api/refunds/${id}/approve`, { method: 'POST', body: JSON.stringify({ approver, remark }) }),
  completeRefund: (id, operator) =>
    request(`/api/refunds/${id}/complete`, { method: 'POST', body: JSON.stringify({ operator }) }),
  rejectRefund: (id, approver, reason) =>
    request(`/api/refunds/${id}/reject`, { method: 'POST', body: JSON.stringify({ approver, reason }) })
};
