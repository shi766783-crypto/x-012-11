import { computed, reactive, ref, watch } from 'vue'
import { DEFAULT_GOALS } from '../constants/garden'
import { todayISO } from '../utils/date'
import {
  canAccommodate,
  formatBytes,
  getStorageUsage,
  saveGardenState,
  loadGardenState,
  StorageQuotaError,
} from '../services/storage'
import { compressDataUrl, getDataUrlBytes, isCompressedPhoto } from '../utils/imageCompress'
import {
  buildLeaderboards,
  buildTimeline,
  calculateAchievements,
  createId,
  getDashboard,
  getDueWateringPlants,
  getWateringStatus,
  updateWateringGoal,
} from '../services/gardenRules'

const demoState = {
  plants: [
    {
      id: 'plant-demo-1',
      name: '琴叶榕',
      variety: 'Ficus lyrata',
      category: '观叶',
      location: '客厅',
      lightNeed: '半阴',
      wateringFrequency: 4,
      fertilizerFrequency: 30,
      purchaseDate: '2026-08-18',
      lastWateredDate: '2026-09-12',
      potSize: '28cm 陶盆',
      soilType: '泥炭土混合珍珠岩',
      photo: '',
      photoCompressed: false,
      alive: true,
    },
    {
      id: 'plant-demo-2',
      name: '蓝雪花',
      variety: 'Plumbago auriculata',
      category: '观花',
      location: '阳台',
      lightNeed: '全阳',
      wateringFrequency: 2,
      fertilizerFrequency: 14,
      purchaseDate: '2026-07-02',
      lastWateredDate: '2026-09-13',
      potSize: '20cm 加仑盆',
      soilType: '通用营养土',
      photo: '',
      photoCompressed: false,
      alive: true,
    },
  ],
  careRecords: [
    {
      id: 'care-demo-1',
      plantId: 'plant-demo-2',
      date: '2026-09-14',
      type: '施肥',
      amount: '缓释肥 5g',
      note: '花量增加，叶色正常',
      photo: '',
    },
    {
      id: 'care-demo-2',
      plantId: 'plant-demo-1',
      date: '2026-09-12',
      type: '浇水',
      amount: '约 600ml',
      note: '盆底少量出水',
      photo: '',
    },
  ],
  growthRecords: [
    {
      id: 'growth-demo-1',
      plantId: 'plant-demo-2',
      date: '2026-08-20',
      height: 82,
      leafCount: 14,
      bloomState: '未开花',
    },
    {
      id: 'growth-demo-2',
      plantId: 'plant-demo-1',
      date: '2026-09-10',
      height: 88,
      leafCount: 17,
      bloomState: '未开花',
    },
    {
      id: 'growth-demo-3',
      plantId: 'plant-demo-2',
      date: '2026-09-08',
      height: 45,
      leafCount: 56,
      bloomState: '盛开',
    },
  ],
  pestRecords: [],
  goals: DEFAULT_GOALS,
}

// 收集所有携带照片的记录（植物档案 + 养护记录）。
function collectPhotoEntries(state) {
  const entries = []
  state.plants.forEach((plant) => {
    if (plant.photo) entries.push({ record: plant, kind: '植物照片' })
  })
  state.careRecords.forEach((record) => {
    if (record.photo) entries.push({ record, kind: '养护照片' })
  })
  return entries
}

export function useGardenStore() {
  const storedState = loadGardenState()
  const state = reactive(storedState || demoState)

  const storageStatus = reactive({
    ...getStorageUsage(),
    error: '',
  })

  function refreshStorageStatus() {
    Object.assign(storageStatus, getStorageUsage())
  }

  function dismissStorageError() {
    storageStatus.error = ''
  }

  const plantsWithStatus = computed(() =>
    state.plants.map((plant) => ({ ...plant, wateringStatus: getWateringStatus(plant) })),
  )
  const dueWateringPlants = computed(() => getDueWateringPlants(state.plants))
  const dashboard = computed(() => getDashboard(state.plants, state.careRecords, state.growthRecords))
  const goals = computed(() => updateWateringGoal(state.goals, state.careRecords))
  const achievements = computed(() =>
    calculateAchievements(state.plants, state.careRecords, state.growthRecords, state.pestRecords, goals.value),
  )
  const leaderboards = computed(() => buildLeaderboards(state.plants, state.careRecords, state.growthRecords))

  const legacyPhotoCount = computed(
    () =>
      collectPhotoEntries(state).filter(({ record }) => record.photo && !isCompressedPhoto(record.photo)).length,
  )
  const photoCount = computed(() => collectPhotoEntries(state).length)

  watch(
    state,
    () => {
      try {
        saveGardenState({ ...state, goals: goals.value })
        storageStatus.error = ''
      } catch (error) {
        // 保存失败必须可见：此前 setItem 抛错会被 watch 吞掉造成静默丢数据。
        storageStatus.error =
          error instanceof StorageQuotaError
            ? error.message
            : '本地保存失败，请检查浏览器存储设置。'
      } finally {
        refreshStorageStatus()
      }
    },
    { deep: true },
  )

  /**
   * 选图压缩后的预检查：剩余空间放不下新照片时拦截，
   * 返回 null 表示放行，否则返回可直接展示给用户的提示文案。
   */
  function checkPhotoRoom(photoBytes) {
    const usage = getStorageUsage()
    Object.assign(storageStatus, usage)
    if (!canAccommodate(photoBytes, usage)) {
      return `本地存储剩余约 ${formatBytes(usage.remainingBytes)}，放不下这张压缩后约 ${formatBytes(
        photoBytes,
      )} 的照片，请先清理或压缩旧照片。`
    }
    if (usage.warning) {
      return `本地存储已使用 ${formatBytes(usage.usedBytes)} / ${formatBytes(usage.limit)}，建议尽快压缩或清理旧照片。`
    }
    return null
  }

  /**
   * 批量重压缩存量未压缩旧照片。
   * 旧照片仍以 data URL 形式保留、<img> 可直接打开；仅当重压缩结果
   * 确实更小时才替换，避免把已经很小的旧图放大。
   */
  async function compressLegacyPhotos(onProgress) {
    const entries = collectPhotoEntries(state).filter(
      ({ record }) => record.photo && !isCompressedPhoto(record.photo),
    )
    let savedBytes = 0
    let compressedCount = 0

    for (let i = 0; i < entries.length; i += 1) {
      const { record } = entries[i]
      onProgress?.({ current: i + 1, total: entries.length })
      try {
        const before = getDataUrlBytes(record.photo)
        const { dataUrl, bytes } = await compressDataUrl(record.photo)
        if (bytes < before) {
          record.photo = dataUrl
          record.photoCompressed = true
          savedBytes += before - bytes
          compressedCount += 1
        }
      } catch (error) {
        // 个别旧图损坏/无法解码时保留原样，不影响其他照片。
        console.warn('存量照片压缩失败，已保留原图。', error)
      }
    }

    refreshStorageStatus()
    return { compressedCount, total: entries.length, savedBytes }
  }

  /** 空间彻底不足时的最后手段：清空全部照片（文字记录保留）。 */
  function clearAllPhotos() {
    let removedCount = 0
    collectPhotoEntries(state).forEach(({ record }) => {
      record.photo = ''
      record.photoCompressed = false
      removedCount += 1
    })
    refreshStorageStatus()
    return removedCount
  }

  function addPlant(payload) {
    state.plants.unshift({
      ...payload,
      photoCompressed: Boolean(payload.photo),
      id: createId('plant'),
      lastWateredDate: payload.lastWateredDate || payload.purchaseDate || todayISO(),
      alive: true,
    })
  }

  function addCareRecord(payload) {
    const record = { ...payload, photoCompressed: Boolean(payload.photo), id: createId('care') }
    state.careRecords.unshift(record)

    if (record.type === '浇水') {
      const plant = state.plants.find((item) => item.id === record.plantId)
      if (plant) plant.lastWateredDate = record.date
    }
  }

  function addGrowthRecord(payload) {
    state.growthRecords.unshift({ ...payload, id: createId('growth') })
  }

  function addPestRecord(payload) {
    state.pestRecords.unshift({ ...payload, id: createId('pest') })
  }

  function getPlantTimeline(plantId) {
    return buildTimeline(plantId, state.careRecords, state.growthRecords, state.pestRecords)
  }

  function getPlantGrowth(plantId) {
    return state.growthRecords
      .filter((record) => record.plantId === plantId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return {
    state,
    storageStatus,
    legacyPhotoCount,
    photoCount,
    plantsWithStatus,
    dueWateringPlants,
    dashboard,
    goals,
    achievements,
    leaderboards,
    checkPhotoRoom,
    compressLegacyPhotos,
    clearAllPhotos,
    dismissStorageError,
    addPlant,
    addCareRecord,
    addGrowthRecord,
    addPestRecord,
    getPlantTimeline,
    getPlantGrowth,
  }
}
