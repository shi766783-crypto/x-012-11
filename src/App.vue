<script setup>
import AchievementBoard from './components/AchievementBoard.vue'
import DashboardPanel from './components/DashboardPanel.vue'
import Leaderboards from './components/Leaderboards.vue'
import PlantForm from './components/PlantForm.vue'
import PlantList from './components/PlantList.vue'
import ProfileCenter from './components/ProfileCenter.vue'
import RecordForms from './components/RecordForms.vue'
import StorageNotice from './components/StorageNotice.vue'
import WateringReminders from './components/WateringReminders.vue'
import { useGardenStore } from './composables/useGardenStore'

const {
  state,
  storageStatus,
  legacyPhotoCount,
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
} = useGardenStore()
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div>
        <p>家庭园艺与植物养护管家</p>
        <h1>把浇水、施肥、生长和成就放进一个清爽的本地花园。</h1>
      </div>
      <span class="storage-note">纯前端 · 本地日期提醒 · Canvas 曲线</span>
    </header>

    <StorageNotice
      :clear-all-photos="clearAllPhotos"
      :compress-legacy-photos="compressLegacyPhotos"
      :dismiss-storage-error="dismissStorageError"
      :legacy-photo-count="legacyPhotoCount"
      :status="storageStatus"
    />

    <DashboardPanel :achievements="achievements" :dashboard="dashboard" :goals="goals" />

    <section class="main-grid">
      <div class="left-column">
        <WateringReminders :plants="dueWateringPlants" />
        <PlantList :plants="plantsWithStatus" />
      </div>
      <PlantForm :check-photo-room="checkPhotoRoom" @submit="addPlant" />
    </section>

    <RecordForms
      :check-photo-room="checkPhotoRoom"
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
