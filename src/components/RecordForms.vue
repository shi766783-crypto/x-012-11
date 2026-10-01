<script setup>
import { computed, reactive, ref } from 'vue'
import { BLOOM_STATES, CARE_TYPES } from '../constants/garden'
import { todayISO } from '../utils/date'
import { formatBytes } from '../utils/format'
import { getPhotoSrc } from '../utils/photo'
import { ImageCompressError, compressImageFile } from '../utils/image'

const props = defineProps({
  plants: {
    type: Array,
    required: true,
  },
  canAttachPhoto: {
    type: Function,
    required: true,
  },
})
const emit = defineEmits(['care', 'growth', 'pest'])

const firstPlantId = computed(() => props.plants[0]?.id || '')
const care = reactive({ plantId: '', date: todayISO(), type: '浇水', amount: '', note: '', photo: '' })
const growth = reactive({ plantId: '', date: todayISO(), height: 0, leafCount: 0, bloomState: '未开花' })
const pest = reactive({ plantId: '', date: todayISO(), symptom: '', treatment: '', recovery: '' })

const photoError = ref('')
const photoInfo = ref('')
const photoProcessing = ref(false)

function ensurePlantId(form) {
  if (!form.plantId) form.plantId = firstPlantId.value
}

function resetPhotoField() {
  care.photo = ''
  photoError.value = ''
  photoInfo.value = ''
}

function submitCare() {
  ensurePlantId(care)
  if (!care.plantId) return
  emit('care', { ...care })
  care.amount = ''
  care.note = ''
  resetPhotoField()
}

function submitGrowth() {
  ensurePlantId(growth)
  if (!growth.plantId) return
  emit('growth', { ...growth })
  growth.height = 0
  growth.leafCount = 0
}

function submitPest() {
  ensurePlantId(pest)
  if (!pest.plantId || !pest.symptom.trim()) return
  emit('pest', { ...pest, symptom: pest.symptom.trim() })
  pest.symptom = ''
  pest.treatment = ''
  pest.recovery = ''
}

async function handlePhoto(event) {
  const input = event.target
  const file = input.files?.[0]
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
    care.photo = {
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
  <section class="records-grid">
    <form class="panel compact-form" @submit.prevent="submitCare">
      <div class="panel-heading">
        <h2>养护操作</h2>
      </div>
      <select v-model="care.plantId">
        <option value="">选择植物</option>
        <option v-for="plant in plants" :key="plant.id" :value="plant.id">{{ plant.name }}</option>
      </select>
      <input v-model="care.date" type="date" />
      <select v-model="care.type">
        <option v-for="item in CARE_TYPES" :key="item">{{ item }}</option>
      </select>
      <input v-model="care.amount" placeholder="用量或备注" />
      <textarea v-model="care.note" rows="3" placeholder="养护细节"></textarea>
      <input accept="image/*" :disabled="photoProcessing" type="file" @change="handlePhoto" />
      <p v-if="photoProcessing" class="photo-hint">正在压缩照片…</p>
      <div v-if="care.photo" class="photo-preview compact">
        <img :src="getPhotoSrc(care.photo)" alt="养护照片预览" />
        <div class="photo-preview-meta">
          <span>{{ photoInfo }}</span>
          <button class="text-action" type="button" @click="resetPhotoField">移除照片</button>
        </div>
      </div>
      <p v-if="photoError" class="photo-error">{{ photoError }}</p>
      <button class="secondary-action" type="submit">记录养护</button>
    </form>

    <form class="panel compact-form" @submit.prevent="submitGrowth">
      <div class="panel-heading">
        <h2>生长指标</h2>
      </div>
      <select v-model="growth.plantId">
        <option value="">选择植物</option>
        <option v-for="plant in plants" :key="plant.id" :value="plant.id">{{ plant.name }}</option>
      </select>
      <input v-model="growth.date" type="date" />
      <input v-model.number="growth.height" min="0" type="number" placeholder="高度 cm" />
      <input v-model.number="growth.leafCount" min="0" type="number" placeholder="叶片数" />
      <select v-model="growth.bloomState">
        <option v-for="item in BLOOM_STATES" :key="item">{{ item }}</option>
      </select>
      <button class="secondary-action" type="submit">记录指标</button>
    </form>

    <form class="panel compact-form" @submit.prevent="submitPest">
      <div class="panel-heading">
        <h2>病虫害记录</h2>
      </div>
      <select v-model="pest.plantId">
        <option value="">选择植物</option>
        <option v-for="plant in plants" :key="plant.id" :value="plant.id">{{ plant.name }}</option>
      </select>
      <input v-model="pest.date" type="date" />
      <textarea v-model="pest.symptom" required rows="3" placeholder="症状"></textarea>
      <textarea v-model="pest.treatment" rows="3" placeholder="处理方法"></textarea>
      <textarea v-model="pest.recovery" rows="3" placeholder="恢复情况"></textarea>
      <button class="secondary-action" type="submit">保存记录</button>
    </form>
  </section>
</template>
