<script setup>
import { computed, ref } from 'vue'
import { formatBytes } from '../services/storage'

const props = defineProps({
  status: {
    type: Object,
    required: true,
  },
  legacyPhotoCount: {
    type: Number,
    default: 0,
  },
  compressLegacyPhotos: {
    type: Function,
    required: true,
  },
  clearAllPhotos: {
    type: Function,
    required: true,
  },
  dismissStorageError: {
    type: Function,
    required: true,
  },
})

const busy = ref(false)
const progress = ref({ current: 0, total: 0 })
const result = ref('')
const confirmClear = ref(false)

const level = computed(() => {
  if (props.status.error || props.status.blocked) return 'danger'
  if (props.status.warning) return 'warning'
  return 'ok'
})

const percent = computed(() => Math.min(100, Math.round(props.status.ratio * 100)))

async function handleCompress() {
  if (busy.value) return
  busy.value = true
  result.value = ''
  try {
    const summary = await props.compressLegacyPhotos((p) => {
      progress.value = p
    })
    result.value =
      summary.compressedCount > 0
        ? `已压缩 ${summary.compressedCount} 张旧照片，释放约 ${formatBytes(summary.savedBytes)} 空间。`
        : '旧照片已是最优体积，无需压缩。'
  } finally {
    busy.value = false
    progress.value = { current: 0, total: 0 }
  }
}

function handleClear() {
  if (!confirmClear.value) {
    confirmClear.value = true
    return
  }
  props.clearAllPhotos()
  confirmClear.value = false
  result.value = '已清空全部照片，文字记录均已保留。'
}
</script>

<template>
  <section v-if="level !== 'ok' || legacyPhotoCount > 0" :class="['storage-notice', level]">
    <div class="storage-notice-head">
      <strong>
        {{
          status.error
            ? '保存失败'
            : status.blocked
              ? '本地存储即将用满'
              : status.warning
                ? '本地存储偏满'
                : '可优化旧照片'
        }}
      </strong>
      <span>{{ formatBytes(status.usedBytes) }} / {{ formatBytes(status.limit) }}（{{ percent }}%）</span>
    </div>

    <div class="storage-bar">
      <div :class="['storage-bar-fill', level]" :style="{ width: `${percent}%` }" />
    </div>

    <p v-if="status.error" class="storage-notice-text">{{ status.error }}</p>
    <p v-else-if="status.blocked" class="storage-notice-text">
      已接近浏览器本地存储上限，新照片已被拦截。请压缩存量旧照片，或清空部分照片后再保存。
    </p>
    <p v-else-if="status.warning" class="storage-notice-text">
      建议尽早压缩旧照片，避免后续保存失败；文字记录不会被清理。
    </p>
    <p v-else class="storage-notice-text">
      检测到 {{ legacyPhotoCount }} 张上传时未经压缩的旧照片，压缩后可显著降低存储占用。
    </p>

    <div class="storage-notice-actions">
      <button
        v-if="legacyPhotoCount > 0"
        class="storage-action primary"
        :disabled="busy"
        type="button"
        @click="handleCompress"
      >
        {{ busy ? `压缩中 ${progress.current}/${progress.total}` : `压缩 ${legacyPhotoCount} 张旧照片` }}
      </button>
      <button class="storage-action subtle" type="button" @click="handleClear">
        {{ confirmClear ? '再次点击确认清空全部照片' : '清空全部照片（保留文字）' }}
      </button>
      <button v-if="status.error" class="storage-action subtle" type="button" @click="dismissStorageError()">
        知道了
      </button>
    </div>
    <p v-if="result" class="storage-notice-result">{{ result }}</p>
  </section>
</template>
