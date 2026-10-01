// localStorage 配额管理。
// 浏览器常见上限为 5MB，这里留出余量设 4MB 软上限，
// 达到 WARN_RATIO 时提示清理，超出软上限时直接拦截写入。
const STORAGE_KEY = 'home-garden-care-manager:v1'

const encoder = new TextEncoder()

export const STORAGE_LIMIT = 4 * 1024 * 1024
export const STORAGE_WARN_RATIO = 0.85
export const STORAGE_WARN_BYTES = Math.round(STORAGE_LIMIT * STORAGE_WARN_RATIO)

export function storageLevel(usedBytes) {
  if (usedBytes >= STORAGE_LIMIT) return 'full'
  if (usedBytes >= STORAGE_WARN_BYTES) return 'warn'
  return 'ok'
}

export function isQuotaError(error) {
  return (
    error?.name === 'QuotaExceededError' ||
    error?.code === 22 ||
    error?.code === 1014
  )
}

export function serializeState(state) {
  return JSON.stringify(state)
}

// UTF-16 的 localStorage 实际占用与 UTF-8 序列化长度接近，统一按 UTF-8 估算
export function measureState(state) {
  return encoder.encode(serializeState(state)).length
}

// 模拟写入一份状态后是否会超出软上限
export function canFitState(state) {
  return measureState(state) <= STORAGE_LIMIT
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

// 返回 { ok, quota }：配额不足时不写入，由上层决定如何提示
export function saveGardenState(state) {
  const serialized = serializeState(state)
  const bytes = encoder.encode(serialized).length
  try {
    localStorage.setItem(STORAGE_KEY, serialized)
    return { ok: true, bytes }
  } catch (error) {
    if (isQuotaError(error) || bytes > STORAGE_LIMIT) {
      return { ok: false, quota: true, bytes }
    }
    throw error
  }
}
