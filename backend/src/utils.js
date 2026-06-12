function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateOrderNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `LO${year}${month}${day}${random}`;
}

function generateRefundNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RF${year}${month}${day}${random}`;
}

function nowISO() {
  return new Date().toISOString();
}

function calculateDaysBetween(date1Str, date2Str) {
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  const diff = d2.getTime() - d1.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const DAMAGE_LEVEL_MAP = {
  'NONE': 0,
  'LIGHT': 100,
  'MEDIUM': 500,
  'SEVERE': 2000
};

const DAMAGE_LABEL_MAP = {
  'NONE': '无损坏',
  'LIGHT': '轻微损坏',
  'MEDIUM': '中度损坏',
  'SEVERE': '严重损坏'
};

const ACCESSORY_DEDUCTION_PER_ITEM = 200;
const OVERDUE_DEDUCTION_PER_DAY = 50;

const REVIEW_STATUS = {
  PENDING: 'PENDING',
  REVIEWED: 'REVIEWED',
  REJECTED: 'REJECTED'
};

const DISPUTE_STATUS = {
  OPEN: 'OPEN',
  PROCESSING: 'PROCESSING',
  RESOLVED: 'RESOLVED',
  REJECTED: 'REJECTED',
  CLOSED: 'CLOSED'
};

const DISPUTE_TYPE = {
  DAMAGE: 'DAMAGE',
  ACCESSORY: 'ACCESSORY',
  OVERDUE: 'OVERDUE',
  OTHER: 'OTHER'
};

const DIFF_TYPE = {
  DAMAGE_LEVEL: 'DAMAGE_LEVEL',
  ACCESSORY: 'ACCESSORY',
  OVERDUE_DAYS: 'OVERDUE_DAYS',
  REMARK: 'REMARK',
  REVIEW: 'REVIEW'
};

function generateDisputeNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DP${year}${month}${day}${random}`;
}

function generateCrossReturnNo() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `CR${year}${month}${day}${random}`;
}

module.exports = {
  generateId,
  generateOrderNo,
  generateRefundNo,
  generateDisputeNo,
  generateCrossReturnNo,
  nowISO,
  calculateDaysBetween,
  DAMAGE_LEVEL_MAP,
  DAMAGE_LABEL_MAP,
  ACCESSORY_DEDUCTION_PER_ITEM,
  OVERDUE_DEDUCTION_PER_DAY,
  REVIEW_STATUS,
  DISPUTE_STATUS,
  DISPUTE_TYPE,
  DIFF_TYPE
};
