<template>
  <div class="refund-list">
    <el-card class="search-card" shadow="never">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="审批状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 160px">
            <el-option label="全部" value="" />
            <el-option label="待审批" value="PENDING" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已驳回" value="REJECTED" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="tableData" stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="refund_no" label="退款单号" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="goToDetail(row.id)">{{ row.refund_no }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="deposit_amount" label="押金(元)" width="120">
          <template #default="{ row }">¥{{ row.deposit_amount }}</template>
        </el-table-column>
        <el-table-column prop="total_deduction" label="扣款(元)" width="120">
          <template #default="{ row }">
            <span style="color: #F56C6C">-{{ row.total_deduction }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="refund_amount" label="退款(元)" width="130">
          <template #default="{ row }">
            <span style="color: #67C23A; font-weight: 600">¥{{ row.refund_amount }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="applicant" label="申请人" width="100" />
        <el-table-column prop="apply_time" label="申请时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.apply_time) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusName(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goToDetail(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'PENDING'"
              type="success"
              link
              @click="handleApprove(row)"
            >
              审批
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.page_size"
        :page-sizes="[10, 20, 50]"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </el-card>

    <el-dialog
      v-model="showApproveDialog"
      title="退款审批"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="审批结果">
          <el-radio-group v-model="approveForm.is_approved">
            <el-radio :label="true">通过</el-radio>
            <el-radio :label="false">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
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
        <el-button type="primary" @click="submitApprove">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { refundApi } from '../utils/api'

const router = useRouter()

const loading = ref(false)
const tableData = ref([])
const searchForm = reactive({
  status: ''
})
const pagination = reactive({
  page: 1,
  page_size: 10,
  total: 0
})

const showApproveDialog = ref(false)
const currentRefund = ref(null)
const approveForm = reactive({
  is_approved: true,
  approver: '',
  approval_remark: ''
})

const statusMap = {
  PENDING: { name: '待审批', type: 'warning' },
  APPROVED: { name: '已通过', type: 'success' },
  REJECTED: { name: '已驳回', type: 'danger' }
}

const getStatusName = (status) => statusMap[status]?.name || status
const getStatusType = (status) => statusMap[status]?.type || 'info'

const formatDateTime = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      page_size: pagination.page_size
    }
    if (searchForm.status) params.status = searchForm.status
    const res = await refundApi.list(params)
    tableData.value = res.list
    pagination.total = res.total
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  pagination.page = 1
  fetchData()
}

const handleReset = () => {
  searchForm.status = ''
  pagination.page = 1
  fetchData()
}

const goToDetail = (id) => {
  router.push(`/refunds/${id}`)
}

const handleApprove = (row) => {
  currentRefund.value = row
  approveForm.is_approved = true
  approveForm.approver = '财务王经理'
  approveForm.approval_remark = ''
  showApproveDialog.value = true
}

const submitApprove = async () => {
  try {
    await refundApi.approve(currentRefund.value.id, approveForm)
    ElMessage.success('审批完成')
    showApproveDialog.value = false
    fetchData()
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.refund-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-card :deep(.el-card__body) {
  padding: 16px 20px;
}

.search-form {
  margin: 0;
}

.table-card :deep(.el-card__body) {
  padding: 20px;
}

.pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
</style>
