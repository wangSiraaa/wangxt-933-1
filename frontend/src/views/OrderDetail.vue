<template>
  <div class="order-detail" v-loading="loading">
    <el-page-header @back="goBack" content="订单详情">
      <template #content>
        <span class="page-title">订单详情</span>
      </template>
    </el-page-header>

    <div v-if="orderInfo" class="detail-content">
      <el-row :gutter="20">
        <el-col :span="16">
          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Document /></el-icon>
                <span>订单信息</span>
                <el-tag :type="getStatusType(orderInfo.status)" style="margin-left: auto">
                  {{ getStatusName(orderInfo.status) }}
                </el-tag>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="订单编号">{{ orderInfo.order_no }}</el-descriptions-item>
              <el-descriptions-item label="客户名称">{{ orderInfo.customer_name }}</el-descriptions-item>
              <el-descriptions-item label="设备名称">{{ orderInfo.equipment_name }}</el-descriptions-item>
              <el-descriptions-item label="设备编号">{{ orderInfo.equipment_code }}</el-descriptions-item>
              <el-descriptions-item label="押金金额">
                <span style="color: #F56C6C; font-size: 18px; font-weight: 600">¥{{ orderInfo.deposit_amount }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="租赁周期">
                {{ formatDate(orderInfo.rental_start_date) }} ~ {{ formatDate(orderInfo.rental_end_date) }}
              </el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ orderInfo.remark || '-' }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Box /></el-icon>
                <span>仓库验收</span>
                <div style="margin-left: auto">
                  <el-button
                    v-if="!orderInfo.acceptance"
                    type="primary"
                    size="small"
                    :disabled="orderInfo.status === 'REFUND_COMPLETED'"
                    @click="showAcceptanceDialog = true"
                  >
                    <el-icon><Plus /></el-icon>
                    新增验收
                  </el-button>
                  <el-button
                    v-else
                    size="small"
                    :disabled="orderInfo.acceptance.is_locked"
                    @click="editAcceptance"
                  >
                    <el-icon><Edit /></el-icon>
                    {{ orderInfo.acceptance.is_locked ? '已锁定' : '修改' }}
                  </el-button>
                  <el-button
                    v-if="orderInfo.acceptance && orderInfo.acceptance.is_locked"
                    size="small"
                    type="success"
                    @click="showReviewDialog = true"
                  >
                    <el-icon><EditPen /></el-icon>
                    追加复核说明
                  </el-button>
                </div>
              </div>
            </template>
            <div v-if="orderInfo.acceptance" class="acceptance-content">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="设备编号">{{ orderInfo.acceptance.equipment_code }}</el-descriptions-item>
                <el-descriptions-item label="损坏等级">
                  <el-tag :type="getDamageType(orderInfo.acceptance.damage_level)">
                    {{ getDamageName(orderInfo.acceptance.damage_level) }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="逾期天数">{{ orderInfo.acceptance.overdue_days }} 天</el-descriptions-item>
                <el-descriptions-item label="是否归还">
                  <el-tag :type="orderInfo.acceptance.is_returned ? 'success' : 'danger'">
                    {{ orderInfo.acceptance.is_returned ? '已归还' : '未归还' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="配件情况" :span="2">
                  {{ orderInfo.acceptance.accessories || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="验收人">{{ orderInfo.acceptance.acceptance_person || '-' }}</el-descriptions-item>
                <el-descriptions-item label="验收时间">
                  {{ formatDateTime(orderInfo.acceptance.acceptance_date) }}
                </el-descriptions-item>
                <el-descriptions-item label="备注" :span="2">{{ orderInfo.acceptance.remark || '-' }}</el-descriptions-item>
                <el-descriptions-item label="复核说明" :span="2" v-if="orderInfo.acceptance.review_remark">
                  <div class="review-remark">{{ orderInfo.acceptance.review_remark }}</div>
                </el-descriptions-item>
              </el-descriptions>
              <el-alert
                v-if="orderInfo.acceptance.is_locked"
                title="验收记录已锁定"
                type="info"
                description="退款完成后验收记录锁定，仅可追加复核说明"
                show-icon
                style="margin-top: 12px"
              />
            </div>
            <el-empty v-else description="暂无验收记录" />
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Money /></el-icon>
                <span>扣款明细</span>
                <div style="margin-left: auto">
                  <el-button
                    v-if="orderInfo.acceptance && !orderInfo.refund"
                    size="small"
                    @click="calculateDeduction"
                  >
                    <el-icon><Calculator /></el-icon>
                    试算扣款
                  </el-button>
                </div>
              </div>
            </template>
            <div v-if="orderInfo.deduction_items && orderInfo.deduction_items.length > 0">
              <el-table :data="orderInfo.deduction_items" stripe>
                <el-table-column prop="deduction_name" label="扣款项目" />
                <el-table-column prop="deduction_type" label="类型" width="100">
                  <template #default="{ row }">
                    <el-tag size="small" :type="getDeductionType(row.deduction_type)">
                      {{ getDeductionTypeName(row.deduction_type) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="deduction_amount" label="金额(元)" width="120">
                  <template #default="{ row }">
                    <span style="color: #F56C6C">-{{ row.deduction_amount }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="说明" />
              </el-table>
              <div class="deduction-summary">
                <div class="summary-item">
                  <span class="label">押金金额:</span>
                  <span class="value">¥{{ orderInfo.deposit_amount }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">扣款合计:</span>
                  <span class="value deduction">-¥{{ orderInfo.refund ? orderInfo.refund.total_deduction : totalDeduction }}</span>
                </div>
                <div class="summary-item total">
                  <span class="label">应退金额:</span>
                  <span class="value refund">
                    ¥{{ orderInfo.refund ? orderInfo.refund.refund_amount : (orderInfo.deposit_amount - totalDeduction).toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无扣款明细" />
          </el-card>

          <el-card class="info-card" shadow="never" v-if="orderInfo.refund">
            <template #header>
              <div class="card-header">
                <el-icon><Wallet /></el-icon>
                <span>退款记录</span>
                <el-tag :type="getRefundStatusType(orderInfo.refund.status)" style="margin-left: auto">
                  {{ getRefundStatusName(orderInfo.refund.status) }}
                </el-tag>
              </div>
            </template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="退款单号">{{ orderInfo.refund.refund_no }}</el-descriptions-item>
              <el-descriptions-item label="申请时间">
                {{ formatDateTime(orderInfo.refund.apply_time) }}
              </el-descriptions-item>
              <el-descriptions-item label="押金金额">¥{{ orderInfo.refund.deposit_amount }}</el-descriptions-item>
              <el-descriptions-item label="扣款合计">¥{{ orderInfo.refund.total_deduction }}</el-descriptions-item>
              <el-descriptions-item label="退款金额">
                <span style="color: #67C23A; font-size: 16px; font-weight: 600">
                  ¥{{ orderInfo.refund.refund_amount }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="申请人">{{ orderInfo.refund.applicant || '-' }}</el-descriptions-item>
              <el-descriptions-item label="审批人">{{ orderInfo.refund.approver || '-' }}</el-descriptions-item>
              <el-descriptions-item label="审批时间">
                {{ orderInfo.refund.approval_time ? formatDateTime(orderInfo.refund.approval_time) : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="审批意见" :span="2">
                {{ orderInfo.refund.approval_remark || '-' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card class="info-card action-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Operation /></el-icon>
                <span>操作</span>
              </div>
            </template>
            <div class="action-buttons">
              <el-button
                type="primary"
                size="large"
                style="width: 100%"
                :disabled="!canApplyRefund"
                @click="applyRefund"
              >
                <el-icon><RefreshRight /></el-icon>
                申请退款
              </el-button>
              <el-alert
                v-if="!canApplyRefund && !orderInfo.refund"
                :title="refundDisabledReason"
                type="warning"
                show-icon
                style="margin-top: 12px"
              />
              <el-alert
                v-if="orderInfo.refund && orderInfo.refund.status === 'PENDING'"
                title="退款审批中，请等待财务审批"
                type="info"
                show-icon
                style="margin-top: 12px"
              />
            </div>
          </el-card>

          <el-card class="info-card" shadow="never">
            <template #header>
              <div class="card-header">
                <el-icon><Time /></el-icon>
                <span>状态时间线</span>
              </div>
            </template>
            <el-timeline>
              <el-timeline-item
                v-for="item in orderInfo.timelines"
                :key="item.id"
                :timestamp="formatDateTime(item.created_at)"
                :type="getTimelineType(item.business_type)"
                placement="top"
              >
                <el-card shadow="never" class="timeline-card">
                  <h4>{{ item.status_name }}</h4>
                  <p v-if="item.operator">操作人: {{ item.operator }}</p>
                  <p v-if="item.remark">{{ item.remark }}</p>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-dialog
      v-model="showAcceptanceDialog"
      :title="isEditAcceptance ? '修改验收记录' : '新增验收记录'"
      width="600px"
      @close="resetAcceptanceForm"
    >
      <el-form :model="acceptanceForm" :rules="acceptanceRules" ref="acceptanceFormRef" label-width="120px">
        <el-form-item label="设备编号" prop="equipment_code">
          <el-input v-model="acceptanceForm.equipment_code" />
        </el-form-item>
        <el-form-item label="是否归还" prop="is_returned">
          <el-radio-group v-model="acceptanceForm.is_returned">
            <el-radio :label="true">已归还</el-radio>
            <el-radio :label="false">未归还</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="损坏等级" prop="damage_level">
          <el-select v-model="acceptanceForm.damage_level" style="width: 100%">
            <el-option label="无损坏" value="NONE" />
            <el-option label="轻微损坏" value="MINOR" />
            <el-option label="中度损坏" value="MODERATE" />
            <el-option label="严重损坏" value="SEVERE" />
          </el-select>
        </el-form-item>
        <el-form-item label="逾期天数" prop="overdue_days">
          <el-input-number v-model="acceptanceForm.overdue_days" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="配件情况">
          <el-input
            v-model="acceptanceForm.accessories"
            type="textarea"
            :rows="3"
            placeholder="多个配件用逗号分隔，如：充电器, 数据线（缺失）, 说明书"
          />
        </el-form-item>
        <el-form-item label="验收人">
          <el-input v-model="acceptanceForm.acceptance_person" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="acceptanceForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAcceptanceDialog = false">取消</el-button>
        <el-button type="primary" @click="saveAcceptance">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showReviewDialog"
      title="追加复核说明"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="复核人">
          <el-input v-model="reviewForm.operator" />
        </el-form-item>
        <el-form-item label="复核说明">
          <el-input
            v-model="reviewForm.review_remark"
            type="textarea"
            :rows="4"
            placeholder="请输入复核说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showReviewDialog = false">取消</el-button>
        <el-button type="primary" @click="submitReview">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showCalcDialog"
      title="扣款试算结果"
      width="500px"
    >
      <div v-if="calcResult">
        <el-table :data="calcResult.deductions" stripe>
          <el-table-column prop="deduction_name" label="扣款项目" />
          <el-table-column prop="deduction_amount" label="金额(元)" width="100" align="right">
            <template #default="{ row }">
              <span style="color: #F56C6C">-{{ row.deduction_amount }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="calc-summary">
          <div class="calc-row">
            <span>押金:</span>
            <span>¥{{ calcResult.deposit_amount }}</span>
          </div>
          <div class="calc-row">
            <span>扣款合计:</span>
            <span style="color: #F56C6C">-¥{{ calcResult.total_deduction }}</span>
          </div>
          <div class="calc-row total">
            <span>应退金额:</span>
            <span style="color: #67C23A; font-size: 18px; font-weight: 600">
              ¥{{ calcResult.refund_amount }}
            </span>
          </div>
          <el-alert
            v-if="calcResult.total_deduction >= calcResult.deposit_amount"
            title="扣款金额已达押金上限"
            type="warning"
            show-icon
            style="margin-top: 12px"
          />
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="showCalcDialog = false">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document, Box, Money, Wallet, Operation, Time,
  Plus, Edit, EditPen, Calculator, RefreshRight
} from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import {
  orderApi, acceptanceApi, deductionApi, refundApi
} from '../utils/api'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const orderInfo = ref(null)
const totalDeduction = ref(0)

const showAcceptanceDialog = ref(false)
const isEditAcceptance = ref(false)
const acceptanceFormRef = ref(null)
const acceptanceForm = reactive({
  equipment_code: '',
  is_returned: true,
  damage_level: 'NONE',
  overdue_days: 0,
  accessories: '',
  acceptance_person: '',
  remark: ''
})
const acceptanceRules = {
  equipment_code: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
  damage_level: [{ required: true, message: '请选择损坏等级', trigger: 'change' }]
}

const showReviewDialog = ref(false)
const reviewForm = reactive({
  operator: '',
  review_remark: ''
})

const showCalcDialog = ref(false)
const calcResult = ref(null)

const statusMap = {
  CREATED: { name: '已创建', type: 'info' },
  DEPOSIT_PAID: { name: '押金已缴纳', type: 'primary' },
  ACCEPTED: { name: '已验收', type: 'success' },
  REFUND_PENDING: { name: '退款审批中', type: 'warning' },
  REFUND_COMPLETED: { name: '退款完成', type: 'success' },
  REFUND_REJECTED: { name: '退款被驳回', type: 'danger' }
}

const refundStatusMap = {
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
const getRefundStatusName = (status) => refundStatusMap[status]?.name || status
const getRefundStatusType = (status) => refundStatusMap[status]?.type || 'info'
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

const getTimelineType = (type) => {
  const map = { ORDER: 'primary', ACCEPTANCE: 'success', REFUND: 'warning' }
  return map[type] || 'info'
}

const formatDate = (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const canApplyRefund = computed(() => {
  if (!orderInfo.value) return false
  if (orderInfo.value.refund) return false
  if (!orderInfo.value.acceptance) return false
  if (!orderInfo.value.acceptance.is_returned) return false
  if (orderInfo.value.status === 'REFUND_COMPLETED') return false
  return true
})

const refundDisabledReason = computed(() => {
  if (!orderInfo.value) return ''
  if (orderInfo.value.refund) return '该订单已有退款记录'
  if (!orderInfo.value.acceptance) return '请先完成仓库验收'
  if (!orderInfo.value.acceptance.is_returned) return '设备未归还，不能申请退款'
  return ''
})

const fetchOrderDetail = async () => {
  loading.value = true
  try {
    const res = await orderApi.detail(route.params.id)
    orderInfo.value = res
    if (res.deduction_items && res.deduction_items.length > 0) {
      totalDeduction.value = res.deduction_items.reduce((sum, item) => sum + item.deduction_amount, 0)
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const goBack = () => {
  router.back()
}

const editAcceptance = () => {
  if (!orderInfo.value.acceptance) return
  isEditAcceptance.value = true
  acceptanceForm.equipment_code = orderInfo.value.acceptance.equipment_code
  acceptanceForm.is_returned = orderInfo.value.acceptance.is_returned
  acceptanceForm.damage_level = orderInfo.value.acceptance.damage_level
  acceptanceForm.overdue_days = orderInfo.value.acceptance.overdue_days
  acceptanceForm.accessories = orderInfo.value.acceptance.accessories || ''
  acceptanceForm.acceptance_person = orderInfo.value.acceptance.acceptance_person || ''
  acceptanceForm.remark = orderInfo.value.acceptance.remark || ''
  showAcceptanceDialog.value = true
}

const resetAcceptanceForm = () => {
  acceptanceFormRef.value?.resetFields()
  acceptanceForm.equipment_code = orderInfo.value?.equipment_code || ''
  acceptanceForm.is_returned = true
  acceptanceForm.damage_level = 'NONE'
  acceptanceForm.overdue_days = 0
  acceptanceForm.accessories = ''
  acceptanceForm.acceptance_person = ''
  acceptanceForm.remark = ''
  isEditAcceptance.value = false
}

const saveAcceptance = async () => {
  try {
    await acceptanceFormRef.value.validate()
    if (isEditAcceptance.value) {
      await acceptanceApi.update(orderInfo.value.acceptance.id, acceptanceForm)
      ElMessage.success('验收记录更新成功')
    } else {
      await acceptanceApi.create(route.params.id, acceptanceForm)
      ElMessage.success('验收记录创建成功')
    }
    showAcceptanceDialog.value = false
    fetchOrderDetail()
  } catch (e) {
    if (e !== false) {
      console.error(e)
    }
  }
}

const submitReview = async () => {
  try {
    if (!reviewForm.review_remark) {
      ElMessage.warning('请输入复核说明')
      return
    }
    await acceptanceApi.addReview(orderInfo.value.acceptance.id, reviewForm)
    ElMessage.success('复核说明追加成功')
    showReviewDialog.value = false
    reviewForm.review_remark = ''
    reviewForm.operator = ''
    fetchOrderDetail()
  } catch (e) {
    console.error(e)
  }
}

const calculateDeduction = async () => {
  try {
    const res = await deductionApi.calculate({
      acceptance_id: orderInfo.value.acceptance.id,
      deposit_amount: orderInfo.value.deposit_amount
    })
    calcResult.value = res
    showCalcDialog.value = true
  } catch (e) {
    console.error(e)
  }
}

const applyRefund = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要提交退款申请吗？提交后将进入审批流程。',
      '确认申请',
      { type: 'warning' }
    )
    await refundApi.create({
      order_id: route.params.id,
      applicant: '李四'
    })
    ElMessage.success('退款申请提交成功')
    fetchOrderDetail()
  } catch (e) {
    if (e !== 'cancel') {
      console.error(e)
    }
  }
}

onMounted(() => {
  fetchOrderDetail()
})
</script>

<style scoped>
.order-detail {
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
  gap: 12px;
}

.deduction-summary {
  margin-top: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 4px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
}

.summary-item .label {
  color: #606266;
}

.summary-item .value {
  font-weight: 500;
}

.summary-item .deduction {
  color: #F56C6C;
}

.summary-item .refund {
  color: #67C23A;
  font-size: 18px;
  font-weight: 600;
}

.summary-item.total {
  border-top: 1px solid #dcdfe6;
  margin-top: 8px;
  padding-top: 12px;
}

.timeline-card {
  background: #f5f7fa;
  border: none;
}

.timeline-card h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #303133;
}

.timeline-card p {
  margin: 2px 0;
  font-size: 12px;
  color: #606266;
}

.review-remark {
  white-space: pre-wrap;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}

.calc-summary {
  margin-top: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 4px;
}

.calc-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
}

.calc-row.total {
  border-top: 1px solid #dcdfe6;
  margin-top: 8px;
  padding-top: 12px;
}
</style>
