<script setup>
import { computed, ref } from 'vue'
import { formatBytes } from '../utils/format'

const props = defineProps({
  status: {
    type: Object,
    required: true,
  },
  photos: {
    type: Array,
    required: true,
  },
  legacyPhotoCount: {
    type: Number,
    default: 0,
  },
  compressLegacy: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits(['remove-photo'])

const busy = ref(false)
const ratio = computed(() => Math.min(100, Math.round((props.status.used / props.status.limit) * 100)))
const barClass = computed(() =>
  props.status.level === 'full' ? 'full' : props.status.level === 'warn' ? 'warn' : 'ok',
)

async function compressAll() {
  busy.value = true
  try {
    await props.compressLegacy()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel storage-panel">
    <div class="panel-heading">
      <h2>本地存储管理</h2>
      <span :class="['storage-level', barClass]">
        {{ status.level === 'full' ? '空间已满' : status.level === 'warn' ? '接近上限' : '空间正常' }}
      </span>
    </div>

    <div class="storage-meter">
      <progress :class="barClass" :max="status.limit" :value="status.used"></progress>
      <p>
        已用 {{ formatBytes(status.used) }} / {{ formatBytes(status.limit) }}（{{ ratio }}%），
        共 {{ photos.length }} 张照片
      </p>
    </div>

    <p v-if="status.level !== 'ok'" class="storage-advice">
      空间紧张时可删除不需要的照片，或一键压缩升级前保存的未压缩旧照片。
    </p>

    <div v-if="legacyPhotoCount" class="storage-actions">
      <button :disabled="busy" class="secondary-action" type="button" @click="compressAll">
        {{ busy ? '正在压缩…' : `一键压缩 ${legacyPhotoCount} 张旧照片` }}
      </button>
    </div>

    <p v-if="!photos.length" class="empty-state">还没有保存过照片。</p>

    <ul v-else class="storage-photo-list">
      <li v-for="photo in photos" :key="photo.key" class="storage-photo-item">
        <img :src="photo.src" :alt="photo.title" />
        <div class="storage-photo-info">
          <strong>{{ photo.title }}</strong>
          <span>{{ formatBytes(photo.size) }}<em v-if="photo.legacy"> · 旧版未压缩</em></span>
        </div>
        <button class="text-action danger" type="button" @click="emit('remove-photo', photo.key)">
          删除
        </button>
      </li>
    </ul>
  </section>
</template>
