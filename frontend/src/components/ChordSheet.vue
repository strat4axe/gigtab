<script setup lang="ts">
import { ref } from "vue";
import { useChordScroll } from "../composables/useChordScroll";

const props = defineProps<{
  chordHtml: string | null;
  rawText?: string | null;
  title?: string;
  artist?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scrollContainer = ref<HTMLElement | null>(null);
const { isScrolling, songDurationMs, toggle } = useChordScroll(scrollContainer);

// Convert ms to minutes:seconds for display
const durationMinutes = ref(3);
const durationSeconds = ref(0);

function updateDuration() {
  songDurationMs.value = (durationMinutes.value * 60 + durationSeconds.value) * 1000;
}
</script>

<template>
  <div class="chord-sheet-page">
    <div class="chord-header">
      <h1 v-if="title">{{ title }}</h1>
      <h2 v-if="artist">{{ artist }}</h2>
      <div class="chord-controls">
        <button class="scroll-btn" :class="{ active: isScrolling }" @click="toggle">
          {{ isScrolling ? "Stop" : "Scroll" }}
        </button>
        <div class="duration-group">
          <span class="duration-label">Duration</span>
          <input type="number" v-model.number="durationMinutes" min="0" max="60" @change="updateDuration" inputmode="numeric" />
          <span>m</span>
          <input type="number" v-model.number="durationSeconds" min="0" max="59" @change="updateDuration" inputmode="numeric" />
          <span>s</span>
        </div>
        <button class="close-btn" @click="emit('close')">Back</button>
      </div>
    </div>
    <div class="chord-content" ref="scrollContainer" v-if="rawText">{{ rawText }}</div>
    <div class="chord-content" ref="scrollContainer" v-else v-html="chordHtml"></div>
  </div>
</template>

<style scoped>
.chord-sheet-page {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #0a0a1a;
  color: #e0e0e0;
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.chord-header {
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
  background: #0a0a1a;
}

.chord-header h1 {
  font-size: 20px;
  margin: 0;
  text-align: center;
}

.chord-header h2 {
  font-size: 14px;
  margin: 2px 0 10px;
  text-align: center;
  color: #888;
}

.chord-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.duration-group {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.duration-label {
  margin-right: 4px;
}

.duration-group input {
  width: 52px;
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 6px;
  text-align: center;
  font-size: 16px; /* prevents iOS zoom on focus */
}

.scroll-btn,
.close-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  /* Large touch targets — minimum 48px per Apple HIG */
  min-height: 48px;
  min-width: 80px;
  padding: 12px 24px;
  font-size: 16px;
}

.scroll-btn {
  background: #4a90d9;
  color: white;
}

.scroll-btn.active {
  background: #d94a4a;
}

.close-btn {
  background: transparent;
  color: #999;
  border: 1px solid #444;
}

.chord-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px 16px;
  font-family: "Courier New", Courier, monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
}

/* Style the chord sheet HTML from chordsheetjs */
.chord-content :deep(.chord) {
  color: #5a9fd9;
  font-weight: bold;
}

.chord-content :deep(.lyrics) {
  color: #e0e0e0;
}

.chord-content :deep(.row) {
  display: flex;
  flex-wrap: wrap;
}

.chord-content :deep(.column) {
  display: inline-flex;
  flex-direction: column;
}

/* iPad / tablet landscape */
@media (min-width: 768px) {
  .chord-header {
    padding: 16px 24px;
  }

  .chord-header h1 {
    font-size: 28px;
  }

  .chord-header h2 {
    font-size: 16px;
  }

  .chord-content {
    padding: 24px 32px;
    font-size: 16px;
    line-height: 1.8;
  }

  .scroll-btn,
  .close-btn {
    min-height: 52px;
    min-width: 100px;
    padding: 14px 32px;
    font-size: 18px;
  }
}

/* iPad Pro / larger tablets */
@media (min-width: 1024px) {
  .chord-content {
    padding: 32px 48px;
    font-size: 18px;
  }
}
</style>
