<script setup>
import { reactive, ref } from 'vue'
import { LIGHT_NEEDS, LOCATIONS, PLANT_CATEGORIES } from '../constants/garden'
import { todayISO } from '../utils/date'
import { compressImageFile, getDataUrlBytes } from '../utils/imageCompress'

const props = defineProps({
  checkPhotoRoom: {
    type: Function,
    required: true,
  },
})
const emit = defineEmits(['submit'])

const form = reactive({
  name: '',
  variety: '',
  category: '观叶',
  location: '阳台',
  lightNeed: '半阴',
  wateringFrequency: 3,
  fertilizerFrequency: 30,
  purchaseDate: todayISO(),
  lastWateredDate: todayISO(),
  potSize: '',
  soilType: '',
  photo: '',
})

const photoProcessing = ref(false)
const photoHint = ref('')
const photoWarning = ref('')
const photoError = ref('')

function resetForm() {
  form.name = ''
  form.variety = ''
  form.potSize = ''
  form.soilType = ''
  form.photo = ''
  photoHint.value = ''
  photoWarning.value = ''
  photoError.value = ''
}

// checkPhotoRoom 返回：null=放行；以「本地存储剩余」开头=拦截；否则=预警。
function evaluateRoom(bytes) {
  const message = props.checkPhotoRoom(bytes)
  if (!message) return true
  if (message.startsWith('本地存储剩余')) {
    photoError.value = message
    return false
  }
  photoWarning.value = message
  return true
}

function submit() {
  if (!form.name.trim()) return
  if (form.photo && !evaluateRoom(getDataUrlBytes(form.photo))) return
  emit('submit', { ...form, name: form.name.trim() })
  resetForm()
}

async function handlePhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  photoError.value = ''
  photoWarning.value = ''
  photoHint.value = ''
  photoProcessing.value = true
  try {
    const { dataUrl, bytes } = await compressImageFile(file)
    if (!evaluateRoom(bytes)) {
      // 接近上限：拦截本次选图，不写入表单数据。
      form.photo = ''
      return
    }
    form.photo = dataUrl
    photoHint.value = `已压缩至约 ${(bytes / 1024).toFixed(0)} KB`
  } catch (error) {
    form.photo = ''
    photoError.value = error.message || '照片处理失败，请更换图片重试。'
  } finally {
    photoProcessing.value = false
  }
}
</script>

<template>
  <form class="panel form-grid" @submit.prevent="submit">
    <div class="panel-heading">
      <h2>添加植物档案</h2>
      <span>localStorage 保存</span>
    </div>

    <label>
      植物名称
      <input v-model="form.name" required placeholder="如：薄荷、月季、琴叶榕" />
    </label>
    <label>
      品种
      <input v-model="form.variety" placeholder="可选" />
    </label>
    <label>
      类别
      <select v-model="form.category">
        <option v-for="item in PLANT_CATEGORIES" :key="item">{{ item }}</option>
      </select>
    </label>
    <label>
      摆放位置
      <select v-model="form.location">
        <option v-for="item in LOCATIONS" :key="item">{{ item }}</option>
      </select>
    </label>
    <label>
      光照需求
      <select v-model="form.lightNeed">
        <option v-for="item in LIGHT_NEEDS" :key="item">{{ item }}</option>
      </select>
    </label>
    <label>
      浇水频率（天）
      <input v-model.number="form.wateringFrequency" min="1" type="number" />
    </label>
    <label>
      施肥频率（天）
      <input v-model.number="form.fertilizerFrequency" min="1" type="number" />
    </label>
    <label>
      购买日期
      <input v-model="form.purchaseDate" type="date" />
    </label>
    <label>
      上次浇水
      <input v-model="form.lastWateredDate" type="date" />
    </label>
    <label>
      花盆尺寸
      <input v-model="form.potSize" placeholder="如：20cm 陶盆" />
    </label>
    <label>
      土壤类型
      <input v-model="form.soilType" placeholder="如：泥炭土、颗粒土" />
    </label>
    <label>
      植物照片
      <input
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
        type="file"
        @change="handlePhoto"
      />
      <span v-if="photoProcessing" class="photo-state info">正在压缩照片…</span>
      <img v-if="form.photo" class="photo-preview" :src="form.photo" alt="植物照片预览" />
      <span v-if="photoHint" class="photo-state info">{{ photoHint }}</span>
      <span v-if="photoWarning" class="photo-state warning">{{ photoWarning }}</span>
      <span v-if="photoError" class="photo-state error">{{ photoError }}</span>
    </label>
    <button class="primary-action" type="submit">添加植物</button>
  </form>
</template>
