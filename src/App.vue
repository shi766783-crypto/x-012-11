<script setup>
import AchievementBoard from './components/AchievementBoard.vue'
import DashboardPanel from './components/DashboardPanel.vue'
import Leaderboards from './components/Leaderboards.vue'
import PlantForm from './components/PlantForm.vue'
import PlantList from './components/PlantList.vue'
import ProfileCenter from './components/ProfileCenter.vue'
import RecordForms from './components/RecordForms.vue'
import StoragePanel from './components/StoragePanel.vue'
import WateringReminders from './components/WateringReminders.vue'
import { useGardenStore } from './composables/useGardenStore'

const {
  state,
  plantsWithStatus,
  dueWateringPlants,
  dashboard,
  goals,
  achievements,
  leaderboards,
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
} = useGardenStore()
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p>家庭园艺与植物养护管家</p>
        <h1>把浇水、施肥、生长和成就放进一个清爽的本地花园。</h1>
      </div>
      <span class="storage-note">纯前端 · 照片自动压缩 · 本地日期提醒</span>
    </header>

    <div
      v-if="storageStatus.level !== 'ok' || storageNotice.text"
      :class="['storage-banner', storageStatus.level, { notice: storageStatus.level === 'ok' }]"
      role="status"
    >
      <template v-if="storageNotice.text">{{ storageNotice.text }}</template>
      <template v-else-if="storageStatus.level === 'full'">
        本地存储空间已满，新数据将无法保存。请在下方“本地存储管理”中删除照片，或压缩旧照片后再继续。
      </template>
      <template v-else>
        本地存储空间已使用超过 85%，建议提前删除不需要的照片或压缩旧照片，避免后续保存失败。
      </template>
    </div>

    <DashboardPanel :achievements="achievements" :dashboard="dashboard" :goals="goals" />

    <section class="main-grid">
      <div class="left-column">
        <WateringReminders :plants="dueWateringPlants" />
        <PlantList :plants="plantsWithStatus" />
      </div>
      <div class="right-column">
        <PlantForm :can-attach-photo="canAttachPhoto" @submit="addPlant" />
        <StoragePanel
          :compress-legacy="compressLegacyPhotos"
          :legacy-photo-count="legacyPhotoCount"
          :photos="photos"
          :status="storageStatus"
          @remove-photo="removePhoto"
        />
      </div>
    </section>

    <RecordForms
      :can-attach-photo="canAttachPhoto"
      :plants="state.plants"
      @care="addCareRecord"
      @growth="addGrowthRecord"
      @pest="addPestRecord"
    />

    <Leaderboards :leaderboards="leaderboards" />
    <AchievementBoard :earned="achievements.earned" />

    <ProfileCenter
      :achievements="achievements"
      :care-records="state.careRecords"
      :get-plant-growth="getPlantGrowth"
      :get-plant-timeline="getPlantTimeline"
      :plants="state.plants"
    />
  </main>
</template>
