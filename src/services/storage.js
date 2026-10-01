const STORAGE_KEY = 'home-garden-care-manager:v1'

// localStorage 常见上限约 5MiB。统一按 UTF-8 字节估算体积：
// 80% 预警提示清理，90% 直接拦截本次写入，给浏览器自身误差留余量。
const STORAGE_LIMIT = 5 * 1024 * 1024
const WARN_RATIO = 0.8
const BLOCK_RATIO = 0.9
const WARN_BYTES = STORAGE_LIMIT * WARN_RATIO
const BLOCK_BYTES = STORAGE_LIMIT * BLOCK_RATIO

const encoder = new TextEncoder()

export function getStorageLimit() {
  return STORAGE_LIMIT
}

/** 当前园艺数据落库后的 UTF-8 字节数。 */
export function getDataSize(data) {
  return encoder.encode(JSON.stringify(data)).length
}

function getOtherKeysSize() {
  let size = 0
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || key === STORAGE_KEY) continue
    size += encoder.encode(key).length + encoder.encode(localStorage.getItem(key) || '').length
  }
  return size
}

/**
 * 读取当前用量与剩余空间。otherBytes 计入同一源下其他键的占用，
 * 避免忽略站内其他 localStorage 数据导致估算偏小。
 */
export function getStorageUsage() {
  let raw = ''
  try {
    raw = localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    raw = ''
  }
  const selfBytes = raw ? encoder.encode(raw).length : 0
  const otherBytes = getOtherKeysSize()
  const usedBytes = selfBytes + otherBytes
  return {
    usedBytes,
    selfBytes,
    otherBytes,
    limit: STORAGE_LIMIT,
    remainingBytes: Math.max(0, STORAGE_LIMIT - usedBytes),
    ratio: usedBytes / STORAGE_LIMIT,
    warning: usedBytes >= WARN_BYTES,
    blocked: usedBytes >= BLOCK_BYTES,
  }
}

/**
 * 预判追加 extraBytes 后是否会越过拦截阈值。
 * 表单选图后立即调用，提前阻止把大图塞进表单数据。
 */
export function canAccommodate(extraBytes, usage = getStorageUsage()) {
  return usage.usedBytes + extraBytes < BLOCK_BYTES
}

export class StorageQuotaError extends Error {
  constructor(message) {
    super(message)
    this.name = 'StorageQuotaError'
  }
}

export function loadGardenState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('读取本地园艺数据失败，已回退为空数据。', error)
    return null
  }
}

export function saveGardenState(state) {
  const serialized = JSON.stringify(state)
  const projected = encoder.encode(serialized).length + getOtherKeysSize()

  // 预检查拦截：接近上限时不再尝试写入，明确告知调用方需要清理。
  if (projected >= BLOCK_BYTES) {
    throw new StorageQuotaError(
      `本地存储已接近上限（约 ${formatBytes(projected)} / ${formatBytes(STORAGE_LIMIT)}），请清理照片后重试。`,
    )
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch (error) {
    // 兜底：个别浏览器实际限额低于 5MiB，或预估有误差时仍可能抛错，
    // 必须显式抛出，由上层提示用户，而不是静默丢失数据。
    if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      throw new StorageQuotaError('本地存储空间不足，保存失败。请压缩或清理部分照片后重试。')
    }
    throw error
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
