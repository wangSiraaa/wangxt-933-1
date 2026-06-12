const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const apiRoutes = require('./routes/api');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    name: '设备租赁押金退还系统',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      api: '/api',
      health: '/api/health'
    }
  });
});

app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  });
});

async function start() {
  await db.waitForInit();
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  设备租赁押金退还系统后端服务已启动`);
    console.log(`  端口: ${PORT}`);
    console.log(`  访问: http://localhost:${PORT}`);
    console.log(`========================================`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});

module.exports = app;
