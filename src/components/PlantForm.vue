<script setup>
import { reactive, ref } from 'vue'
import { LIGHT_NEEDS, LOCATIONS, PLANT_CATEGORIES } from '../constants/garden'
import { todayISO } from '../utils/date'
import { formatBytes } from '../utils/format'
import { getPhotoSrc } from '../utils/photo'
import { ImageCompressError, compressImageFile } from '../utils/image'

const props = defineProps({
  canAttachPhoto: {
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

const photoError = ref('')
const photoInfo = ref('')
const photoProcessing = ref(false)

function resetPhotoField() {
  form.photo = ''
  photoError.value = ''
  photoInfo.value = ''
}

function submit() {
  if (!form.name.trim()) return
  emit('submit', { ...form, name: form.name.trim() })
  form.name = ''
  form.variety = ''
  form.potSize = ''
  form.soilType = ''
  resetPhotoField()
}

async function handlePhoto(event) {
  const input = event.target
  const file = input.files?.[0]
  // 允许重新选择同名文件
  input.value = ''
  if (!file) return

  photoError.value = ''
  photoInfo.value = ''
  photoProcessing.value = true
  try {
    const result = await compressImageFile(file)
    if (!props.canAttachPhoto(result.bytes)) {
      resetPhotoField()
      photoError.value = '剩余空间不足，这张照片无法保存。请先在“本地存储管理”中清理或压缩旧照片。'
      return
    }
    form.photo = {
      src: result.src,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      compressed: result.compressed,
    }
    photoInfo.value = result.compressed
      ? `已压缩至 ${result.width}×${result.height}，约 ${formatBytes(result.bytes)}`
      : `照片体积较小，保留原图（约 ${formatBytes(result.bytes)}）`
  } catch (error) {
    resetPhotoField()
    photoError.value =
      error instanceof ImageCompressError ? error.message : '照片处理失败，请换一张试试。'
  } finally {
    photoProcessing.value = false
  }
}
</script>

<template>
  <form class="panel form-grid" @submit.prevent="submit">
    <div class="panel-heading">
      <h2>添加植物档案</h2>
      <span>照片自动压缩 · 本地保存</span>
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
      <input accept="image/*" :disabled="photoProcessing" type="file" @change="handlePhoto" />
    </label>
    <p v-if="photoProcessing" class="photo-hint">正在压缩照片…</p>
    <div v-if="form.photo" class="photo-preview">
      <img :src="getPhotoSrc(form.photo)" alt="植物照片预览" />
      <div class="photo-preview-meta">
        <span>{{ photoInfo }}</span>
        <button class="text-action" type="button" @click="resetPhotoField">移除照片</button>
      </div>
    </div>
    <p v-if="photoError" class="photo-error">{{ photoError }}</p>
    <button class="primary-action" type="submit">添加植物</button>
  </form>
</template>
