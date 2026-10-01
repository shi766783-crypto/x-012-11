import { computed, reactive, watch } from 'vue'
import { DEFAULT_GOALS } from '../constants/garden'
import { todayISO } from '../utils/date'
import { getPhotoSize, isLegacyPhoto } from '../utils/photo'
import { compressDataUrl } from '../utils/image'
import { formatBytes } from '../utils/format'
import {
  STORAGE_LIMIT,
  STORAGE_WARN_BYTES,
  canFitState,
  loadGardenState,
  measureState,
  saveGardenState,
  storageLevel,
} from '../services/storage'
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
      plantId: 'plant-demo-1',
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

const SAVE_DEBOUNCE_MS = 300

export function useGardenStore() {
  const storedState = loadGardenState()
  const state = reactive(storedState || demoState)

  const storageStatus = reactive({
    used: measureState(state),
    limit: STORAGE_LIMIT,
    warnBytes: STORAGE_WARN_BYTES,
    level: 'ok',
  })
  storageStatus.level = storageLevel(storageStatus.used)

  // 临时性操作提示（拦截、清理结果等），与容量告警横幅分开
  const storageNotice = reactive({ text: '', type: 'info' })
  let noticeTimer = null
  function setNotice(text, type = 'info', autoDismiss = true) {
    storageNotice.text = text
    storageNotice.type = type
    clearTimeout(noticeTimer)
    if (autoDismiss) {
      noticeTimer = setTimeout(() => {
        storageNotice.text = ''
      }, 6000)
    }
  }

  let saveTimer = null
  function persist() {
    saveTimer = null
    const snapshot = { ...state, goals: goals.value }
    if (!canFitState(snapshot)) {
      storageStatus.used = measureState(snapshot)
      storageStatus.level = 'full'
      setNotice(
        '本地存储空间已满，本次改动未能保存。请在下方“本地存储管理”中删除或压缩旧照片后再试。',
        'error',
        false,
      )
      return
    }

    try {
      const result = saveGardenState(snapshot)
      if (!result.ok) {
        storageStatus.used = result.bytes
        storageStatus.level = 'full'
        setNotice(
          '本地存储空间不足，写入被浏览器拦截。请清理部分照片后重试。',
          'error',
          false,
        )
        return
      }
      storageStatus.used = result.bytes
      storageStatus.level = storageLevel(result.bytes)
    } catch (error) {
      console.warn('本地园艺数据保存失败。', error)
      setNotice('本地数据保存失败，请检查浏览器存储设置后重试。', 'error')
    }
  }

  function schedulePersist() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, SAVE_DEBOUNCE_MS)
  }

  function flushPersist() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      persist()
    }
  }

  window.addEventListener('pagehide', flushPersist)

  watch(
    state,
    () => {
      schedulePersist()
    },
    { deep: true },
  )

  // 预估再写入 extraBytes 后是否会超过软上限（选择照片时提前拦截）
  function canAttachPhoto(extraBytes = 0) {
    const projectedBytes = measureState({ ...state, goals: goals.value }) + Math.ceil(extraBytes)
    return projectedBytes <= STORAGE_LIMIT
  }

  function addPlant(payload) {
    const plant = {
      ...payload,
      id: createId('plant'),
      lastWateredDate: payload.lastWateredDate || payload.purchaseDate || todayISO(),
      alive: true,
    }
    const projected = { ...state, goals: goals.value, plants: [plant, ...state.plants] }
    if (!canFitState(projected)) {
      setNotice('本地存储空间不足，无法保存这株植物的档案，请先清理旧照片。', 'error')
      return false
    }
    state.plants.unshift(plant)
    return true
  }

  function addCareRecord(payload) {
    const record = { ...payload, id: createId('care') }
    const projected = {
      ...state,
      goals: goals.value,
      careRecords: [record, ...state.careRecords],
    }
    if (!canFitState(projected)) {
      setNotice('本地存储空间不足，无法保存这条养护记录，请先清理旧照片。', 'error')
      return false
    }
    state.careRecords.unshift(record)

    if (record.type === '浇水') {
      const plant = state.plants.find((item) => item.id === record.plantId)
      if (plant) plant.lastWateredDate = record.date
    }
    return true
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

  // 供存储管理面板使用的照片清单（新旧格式统一暴露）
  const photos = computed(() => {
    const plantName = (plantId) => state.plants.find((item) => item.id === plantId)?.name || ''
    const items = []
    state.plants.forEach((plant) => {
      if (plant.photo) {
        items.push({
          key: `plant:${plant.id}`,
          title: `植物照片 · ${plant.name}`,
          date: plant.purchaseDate,
          size: getPhotoSize(plant.photo),
          legacy: isLegacyPhoto(plant.photo),
          src: typeof plant.photo === 'string' ? plant.photo : plant.photo.src,
        })
      }
    })
    state.careRecords.forEach((record) => {
      if (record.photo) {
        items.push({
          key: `care:${record.id}`,
          title: `养护照片 · ${record.date} · ${record.type} · ${plantName(record.plantId)}`,
          date: record.date,
          size: getPhotoSize(record.photo),
          legacy: isLegacyPhoto(record.photo),
          src: typeof record.photo === 'string' ? record.photo : record.photo.src,
        })
      }
    })
    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  })

  const legacyPhotoCount = computed(() => photos.value.filter((item) => item.legacy).length)

  function locatePhoto(key) {
    const [collection, id] = key.split(':')
    if (collection === 'plant') {
      return { collection, target: state.plants.find((item) => item.id === id) }
    }
    if (collection === 'care') {
      return { collection, target: state.careRecords.find((item) => item.id === id) }
    }
    return { collection, target: null }
  }

  function removePhoto(key) {
    const { target } = locatePhoto(key)
    if (!target || !target.photo) return 0
    const freed = getPhotoSize(target.photo)
    target.photo = ''
    flushPersist()
    setNotice(`已删除照片，释放约 ${formatBytes(freed)} 空间。`, 'success')
    return freed
  }

  // 把历史遗留的未压缩 dataURL 原图重新缩放压缩，体积明显变小时才替换
  async function compressLegacyPhotos() {
    const legacyItems = photos.value.filter((item) => item.legacy)
    if (!legacyItems.length) {
      setNotice('没有需要压缩的旧照片。', 'info')
      return { count: 0, freed: 0, failed: 0 }
    }

    let count = 0
    let freed = 0
    let failed = 0

    for (const item of legacyItems) {
      const { target } = locatePhoto(item.key)
      if (!target || !isLegacyPhoto(target.photo)) continue
      const beforeBytes = getPhotoSize(target.photo)
      try {
        const result = await compressDataUrl(target.photo)
        // 至少缩小 10% 才替换，避免白忙一场还改变原图
        if (result.bytes < beforeBytes * 0.9) {
          target.photo = {
            src: result.src,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            compressed: true,
          }
          count += 1
          freed += beforeBytes - result.bytes
        }
      } catch (error) {
        console.warn('旧照片压缩失败，已保留原图。', error)
        failed += 1
      }
    }

    flushPersist()
    if (count) {
      setNotice(`已压缩 ${count} 张旧照片，释放约 ${formatBytes(freed)} 空间。`, 'success')
    } else if (failed) {
      setNotice(`${failed} 张旧照片无法处理，已保持原样；其他照片压缩收益不明显。`, 'error')
    } else {
      setNotice('旧照片压缩后体积没有明显改善，已全部保持原样。', 'info')
    }
    return { count, freed, failed }
  }

  return {
    state,
    plantsWithStatus: computed(() =>
      state.plants.map((plant) => ({ ...plant, wateringStatus: getWateringStatus(plant) })),
    ),
    dueWateringPlants: computed(() => getDueWateringPlants(state.plants)),
    dashboard: computed(() => getDashboard(state.plants, state.careRecords, state.growthRecords)),
    goals: computed(() => updateWateringGoal(state.goals, state.careRecords)),
    achievements: computed(() =>
      calculateAchievements(state.plants, state.careRecords, state.growthRecords, state.pestRecords, goals.value),
    ),
    leaderboards: computed(() => buildLeaderboards(state.plants, state.careRecords, state.growthRecords)),
    storageStatus,
    storageNotice,
    photos,
    legacyPhotoCount,
    canAttachPhoto,
    addPlant,
    addCareRecord,
    addGrowthRecord,
    addPestRecord,
    getPlantTimeline,
    getPlantGrowth,
    removePhoto,
    compressLegacyPhotos,
  }
}
