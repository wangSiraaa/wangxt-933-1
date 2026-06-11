<template>
  <div class="order-list">
    <el-card class="search-card" shadow="never">
    <el-form :inline="true" :model="searchForm" class="search-form">
      <el-form-item label="订单状态">
        <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 160px">
          <el-option label="全部" value="" />
          <el-option label="押金已缴纳" value="DEPOSIT_PAID" />
          <el-option label="已验收" value="ACCEPTED" />
          <el-option label="退款审批中" value="REFUND_PENDING" />
          <el-option label="退款完成" value="REFUND_COMPLETED" />
          <el-option label="退款被驳回" value="REFUND_REJECTED" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键词">
        <el-input
          v-model="searchForm.keyword"
          placeholder="订单号/客户/设备"
          clearable
          style="width: 240px"
          @keyup.enter="handleSearch"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>
          搜索
        </el-button>
        <el-button @click="handleReset">重置</el-button>
        <el-button type="success" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建订单
        </el-button>
      </el-form-item>
    </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="tableData" stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="order_no" label="订单编号" width="200">
          <template #default="{ row }">
            <el-link type="primary" @click="goToDetail(row.id)">{{ row.order_no }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户名称" width="140" />
        <el-table-column prop="equipment_name" label="设备名称" width="140" />
        <el-table-column prop="equipment_code" label="设备编号" width="140" />
        <el-table-column prop="deposit_amount" label="押金金额(元)" width="130">
          <template #default="{ row }">
            <span style="color: #F56C6C; font-weight: 600">¥{{ row.deposit_amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="租赁周期" width="220">
          <template #default="{ row }">
            {{ formatDate(row.rental_start_date) }} ~ {{ formatDate(row.rental_end_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusName(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goToDetail(row.id)">详情</el-button>
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
      v-model="showCreateDialog"
      title="新建租赁订单"
      width="600px"
      @close="resetCreateForm"
    >
      <el-form :model="createForm" :rules="createRules" ref="createFormRef" label-width="120px">
        <el-form-item label="客户名称" prop="customer_name">
          <el-input v-model="createForm.customer_name" placeholder="请输入客户名称" />
        </el-form-item>
        <el-form-item label="设备名称" prop="equipment_name">
            <el-input v-model="createForm.equipment_name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备编号" prop="equipment_code">
          <el-input v-model="createForm.equipment_code" placeholder="请输入设备编号" />
        </el-form-item>
        <el-form-item label="押金金额" prop="deposit_amount">
          <el-input-number v-model="createForm.deposit_amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="租赁开始日期" prop="rental_start_date">
          <el-date-picker
            v-model="createForm.rental_start_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="租赁结束日期" prop="rental_end_date">
          <el-date-picker
            v-model="createForm.rental_end_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { orderApi } from '../utils/api'

const router = useRouter()

const loading = ref(false)
const tableData = ref([])
const searchForm = reactive({
  status: '',
  keyword: ''
})
const pagination = reactive({
  page: 1,
  page_size: 10,
  total: 0
})

const showCreateDialog = ref(false)
const createFormRef = ref(null)
const createForm = reactive({
  customer_name: '',
  equipment_name: '',
  equipment_code: '',
  deposit_amount: 0,
  rental_start_date: '',
  rental_end_date: '',
  remark: '',
  operator: '张三'
})

const createRules = {
  customer_name: [{ required: true, message: '请输入客户名称', trigger: 'blur' },
  equipment_name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  equipment_code: [{ required: true, message: '请输入设备编号', trigger: 'blur' }],
  deposit_amount: [{ required: true, message: '请输入押金金额', trigger: 'blur' }],
  rental_start_date: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  rental_end_date: [{ required: true, message: '请选择结束日期', trigger: 'change' }]
}

const statusMap = {
  CREATED: { name: '已创建', type: 'info' },
  DEPOSIT_PAID: { name: '押金已缴纳', type: 'primary' },
  ACCEPTED: { name: '已验收', type: 'success' },
  REFUND_PENDING: { name: '退款审批中', type: 'warning' },
  REFUND_COMPLETED: { name: '退款完成', type: 'success' },
  REFUND_REJECTED: { name: '退款被驳回', type: 'danger' }
}

const getStatusName = (status) => statusMap[status]?.name || status
const getStatusType = (status) => statusMap[status]?.type || 'info'

const formatDate = (date) => dayjs(date).format('YYYY-MM-DD')

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      page_size: pagination.page_size
    }
    if (searchForm.status) params.status = searchForm.status
    if (searchForm.keyword) params.keyword = searchForm.keyword
    const res = await orderApi.list(params)
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
  searchForm.keyword = ''
  pagination.page = 1
  fetchData()
}

const goToDetail = (id) => {
  router.push(`/orders/${id}`)
}

const resetCreateForm = () => {
  createFormRef.value?.resetFields()
  createForm.customer_name = ''
  createForm.equipment_name = ''
  createForm.equipment_code = ''
  createForm.deposit_amount = 0
  createForm.rental_start_date = ''
  createForm.rental_end_date = ''
  createForm.remark = ''
}

const handleCreate = async () => {
  try {
    await createFormRef.value.validate()
    await orderApi.create(createForm)
    ElMessage.success('订单创建成功')
    showCreateDialog.value = false
    resetCreateForm()
    fetchData()
  } catch (e) {
    if (e !== false) {
      console.error(e)
    }
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.order-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-card :deep(.el-card__body {
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
