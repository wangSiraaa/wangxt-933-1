import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import OrderList from './components/OrderList.jsx';
import OrderDetail from './components/OrderDetail.jsx';
import RefundList from './components/RefundList.jsx';

export default function App() {
  const [page, setPage] = useState('orders');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  const goToDetail = (orderId) => {
    setSelectedOrder(orderId);
    setPage('detail');
  };

  const goBack = () => {
    setSelectedOrder(null);
    setPage('orders');
  };

  return (
    <div className="app">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      <header className="app-header">
        <h1>设备租赁押金退还系统</h1>
        <p>订单管理 · 仓库验收 · 财务退款 · 闭环跟踪</p>
      </header>

      <nav className="app-nav">
        <button
          className={`nav-btn ${page === 'orders' || page === 'detail' ? 'active' : ''}`}
          onClick={() => { goBack(); setPage('orders'); }}
        >
          订单管理
        </button>
        <button
          className={`nav-btn ${page === 'refunds' ? 'active' : ''}`}
          onClick={() => setPage('refunds')}
        >
          退款审批
        </button>
      </nav>

      <main className="app-main">
        {page === 'orders' && (
          <OrderList showToast={showToast} goToDetail={goToDetail} />
        )}
        {page === 'detail' && selectedOrder && (
          <OrderDetail
            orderId={selectedOrder}
            showToast={showToast}
            goBack={goBack}
          />
        )}
        {page === 'refunds' && (
          <RefundList showToast={showToast} />
        )}
      </main>
    </div>
  );
}
