<template>
  <div class="refund-detail" v-loading="loading">
    <el-page-header @back="goBack" content="退款详情">
      <template #content>
        <span class="page-title">退款详情</span>
      </template>
    </el-page-header>

    <div v-if="refundInfo" class="detail-content">
      <el-row :gutter="20">
        <el-col :span="16">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Wallet /></el-icon>
                <span>退款信息</span>
                <el-tag :type="getStatusType(refundInfo.status)" style="margin-left: auto">
                  {{ getStatusName(refundInfo.status) }}
                </el-tag>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="退款单号">{{ refundInfo.refund_no }}</el-descriptions-item>
              <el-descriptions-item label="关联订单">
                <el-link type="primary" @click="goToOrder">{{ refundInfo.order?.order_no }}</el-link>
              </el-descriptions-item>
              <el-descriptions-item label="押金金额">¥{{ refundInfo.deposit_amount }}</el-descriptions-item>
              <el-descriptions-item label="扣款合计">
                <span style="color: #F56C6C">-¥{{ refundInfo.total_deduction }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="退款金额">
                <span style="color: #67C23A; font-size: 20px; font-weight: 600">
                  ¥{{ refundInfo.refund_amount }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="申请时间">
                {{ formatDateTime(refundInfo.apply_time) }}
              </el-descriptions-item>
              <el-descriptions-item label="申请人">{{ refundInfo.applicant || '-' }}</el-descriptions-item>
              <el-descriptions-item label="审批人">{{ refundInfo.approver || '-' }}</el-descriptions-item>
              <el-descriptions-item label="审批时间">
                {{ refundInfo.approval_time ? formatDateTime(refundInfo.approval_time) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="审批意见" :span="2">
                {{ refundInfo.approval_remark || '-' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><List /></el-icon>
                <span>扣款明细</span>
              </div>
            </template>
            <el-table :data="refundInfo.deduction_items" stripe>
              <el-table-column type="index" label="序号" width="60" />
              <el-table-column prop="deduction_name" label="扣款项目" />
              <el-table-column prop="deduction_type" label="类型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="getDeductionType(row.deduction_type)">
                    {{ getDeductionTypeName(row.deduction_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="deduction_amount" label="金额(元)" width="120" align="right">
                <template #default="{ row }">
                  <span style="color: #F56C6C">-{{ row.deduction_amount }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="说明" />
            </el-table>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Box /></el-icon>
                <span>验收信息</span>
              </div>
            </template>
            <el-descriptions :column="2" border v-if="refundInfo.acceptance">
              <el-descriptions-item label="设备编号">{{ refundInfo.acceptance.equipment_code }}</el-descriptions-item>
              <el-descriptions-item label="损坏等级">
                <el-tag :type="getDamageType(refundInfo.acceptance.damage_level)">
                  {{ getDamageName(refundInfo.acceptance.damage_level) }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="逾期天数">{{ refundInfo.acceptance.overdue_days }} 天</el-descriptions-item>
              <el-descriptions-item label="是否归还">
                <el-tag :type="refundInfo.acceptance.is_returned ? 'success' : 'danger'">
                  {{ refundInfo.acceptance.is_returned ? '已归还' : '未归还' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="配件情况" :span="2">
                {{ refundInfo.acceptance.accessories || '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="验收人">{{ refundInfo.acceptance.acceptance_person || '-' }}</el-descriptions-item>
              <el-descriptions-item label="验收时间">
                {{ formatDateTime(refundInfo.acceptance.acceptance_date) }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="info-card action-card" shadow="never" v-if="refundInfo.status === 'PENDING'">
            <template #header>
              <div class="card-header">
                <el-icon><Operation /></el-icon>
                <span>审批操作</span>
              </div>
            </template>
            <div class="action-buttons">
              <el-button
                type="success"
                size="large"
                style="width: 100%; margin-bottom: 12px"
                @click="showApproveDialog = true"
              >
                <el-icon><Check /></el-icon>
                通过
              </el-button>
              <el-button
                type="danger"
                size="large"
                style="width: 100%"
                @click="showRejectDialog = true"
              >
                <el-icon><Close /></el-icon>
                驳回
              </el-button>
            </div>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><User /></el-icon>
                <span>客户信息</span>
              </div>
            </template>
            <div class="customer-info" v-if="refundInfo.order">
              <p><strong>客户名称:</strong> {{ refundInfo.order.customer_name }}</p>
              <p><strong>设备名称:</strong> {{ refundInfo.order.equipment_name }}</p>
              <p><strong>设备编号:</strong> {{ refundInfo.order.equipment_code }}</p>
              <p><strong>租赁周期:</strong> {{ formatDate(refundInfo.order.rental_start_date) }} ~ {{ formatDate(refundInfo.order.rental_end_date) }}</p>
            </div>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Money /></el-icon>
                <span>金额汇总</span>
              </div>
            </template>
            <div class="amount-summary">
              <div class="amount-row">
                <span class="label">押金金额</span>
                <span class="value">¥{{ refundInfo.deposit_amount }}</span>
              </div>
              <div class="amount-row deduction">
                <span class="label">扣款合计</span>
                <span class="value">-¥{{ refundInfo.total_deduction }}</span>
              </div>
              <div class="amount-row total">
                <span class="label">实际退款</span>
                <span class="value refund">¥{{ refundInfo.refund_amount }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-dialog
      v-model="showApproveDialog"
      title="审批通过"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="审批人">
          <el-input v-model="approveForm.approver" />
        </el-form-item>
        <el-form-item label="审批意见">
          <el-input
            v-model="approveForm.approval_remark"
            type="textarea"
            :rows="4"
            placeholder="请输入审批意见"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showApproveDialog = false">取消</el-button>
        <el-button type="success" @click="submitApprove(true)">确认通过</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showRejectDialog"
      title="审批驳回"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="审批人">
          <el-input v-model="approveForm.approver" />
        </el-form-item>
        <el-form-item label="驳回原因">
          <el-input
            v-model="approveForm.approval_remark"
            type="textarea"
            :rows="4"
            placeholder="请输入驳回原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRejectDialog = false">取消</el-button>
        <el-button type="danger" @click="submitApprove(false)">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Wallet, List, Box, Operation, User, Money,
  Check, Close
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { refundApi } from '../utils/api'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const refundInfo = ref(null)

const showApproveDialog = ref(false)
const showRejectDialog = ref(false)
const approveForm = reactive({
  is_approved: true,
  approver: '财务王经理',
  approval_remark: ''
})

const statusMap = {
  PENDING: { name: '待审批', type: 'warning' },
  APPROVED: { name: '已通过', type: 'success' },
  REJECTED: { name: '已驳回', type: 'danger' }
}

const damageMap = {
  NONE: { name: '无损坏', type: 'success' },
  MINOR: { name: '轻微损坏', type: 'info' },
  MODERATE: { name: '中度损坏', type: 'warning' },
  SEVERE: { name: '严重损坏', type: 'danger' }
}

const getStatusName = (status) => statusMap[status]?.name || status
const getStatusType = (status) => statusMap[status]?.type || 'info'
const getDamageName = (level) => damageMap[level]?.name || level
const getDamageType = (level) => damageMap[level]?.type || 'info'

const getDeductionType = (type) => {
  const map = { DAMAGE: 'danger', ACCESSORY: 'warning', OVERDUE: 'info' }
  return map[type] || ''
}

const getDeductionTypeName = (type) => {
  const map = { DAMAGE: '损坏', ACCESSORY: '配件', OVERDUE: '逾期' }
  return map[type] || type
}

const formatDate = (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const fetchDetail = async () => {
  loading.value = true
  try {
    const res = await refundApi.detail(route.params.id)
    refundInfo.value = res
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.back()
}

const goToOrder = () => {
  router.push(`/orders/${refundInfo.value.order_id}`)
}

const submitApprove = async (isApproved) => {
  try {
    await refundApi.approve(route.params.id, {
      is_approved: isApproved,
      approver: approveForm.approver,
      approval_remark: approveForm.approval_remark
    })
    ElMessage.success(isApproved ? '审批通过' : '已驳回')
    showApproveDialog.value = false
    showRejectDialog.value = false
    fetchDetail()
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  fetchDetail()
})
</script>

<style scoped>
.refund-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.info-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-header .el-icon {
  color: #409EFF;
}

.action-card :deep(.el-card__body) {
  padding: 20px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
}

.customer-info p {
  margin: 8px 0;
  color: #606266;
}

.customer-info strong {
  color: #303133;
}

.amount-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.amount-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.amount-row .label {
  color: #606266;
}

.amount-row .value {
  font-weight: 500;
}

.amount-row.deduction .value {
  color: #F56C6C;
}

.amount-row.total {
  border-bottom: none;
  padding-top: 12px;
}

.amount-row.total .value.refund {
  color: #67C23A;
  font-size: 20px;
  font-weight: 600;
}
</style>
