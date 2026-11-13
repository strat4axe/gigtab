<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useSetlistStore } from "../stores/setlistStore";
import { useSetlistOffline } from "../composables/useSetlistOffline.ts";

const props = defineProps<{
    currentTabId: string;
    currentTabTitle: string;
    currentTabArtist: string;
}>();

const emit = defineEmits<{
    navigateToTab: [tabId: string];
    close: [];
}>();

const setlistStore = useSetlistStore();
const offline = useSetlistOffline();

const newSetlistName = ref("");
const showCreateForm = ref(false);

function createSetlist() {
    if (!newSetlistName.value.trim()) return;
    const setlist = setlistStore.createSetlist(newSetlistName.value.trim());
    setlistStore.activeSetlistId = setlist.id;
    newSetlistName.value = "";
    showCreateForm.value = false;
}

function deleteActiveSetlist() {
    const setlist = setlistStore.activeSetlist;
    if (!setlist) return;
    if (!confirm(`Delete the setlist "${setlist.name}"? It will be removed for the whole band.`)) return;
    setlistStore.deleteSetlist(setlist.id);
}

function addCurrentTab() {
    if (!setlistStore.activeSetlistId) return;
    setlistStore.addToSetlist(
        setlistStore.activeSetlistId,
        props.currentTabId,
        props.currentTabTitle,
        props.currentTabArtist,
    );
}

function navigateToSong(index: number) {
    setlistStore.currentItemIndex = index;
    const item = setlistStore.activeSetlist?.items[index];
    if (item) {
        emit("navigateToTab", item.tabId);
    }
}

function move(index: number, direction: number) {
    if (!setlistStore.activeSetlistId) return;
    setlistStore.reorderSetlist(setlistStore.activeSetlistId, index, index + direction);
    syncCurrentIndex();
}

// Highlight the song that is on screen, however we got to it
function syncCurrentIndex() {
    const index = setlistStore.activeSetlist?.items.findIndex((item) => item.tabId === props.currentTabId) ?? -1;
    if (index >= 0) {
        setlistStore.currentItemIndex = index;
    }
}

const setlistOptions = computed(() => setlistStore.setlists);

const activeTabIds = computed(() => setlistStore.activeSetlist?.items.map((item) => item.tabId) ?? []);

const offlineSummary = computed(() => {
    const setlist = setlistStore.activeSetlist;
    if (!setlist || setlist.items.length === 0) return "";
    if (offline.downloadingId.value === setlist.id) {
        return `Downloading ${offline.progress.value.done} of ${offline.progress.value.total}...`;
    }
    return `${offline.offlineCount(setlist)} of ${setlist.items.length} songs on this device`;
});

watch(activeTabIds, (ids) => {
    offline.refresh(ids);
}, { immediate: true });

watch(() => [props.currentTabId, setlistStore.activeSetlistId, setlistStore.ready], syncCurrentIndex);

onMounted(syncCurrentIndex);
</script>

<template>
    <div class="setlist-sidebar">
        <div class="sidebar-header">
            <h3>Setlists</h3>
            <button class="close-btn" aria-label="Close setlists" @click='emit("close")'>×</button>
        </div>

        <!-- Setlist selector -->
        <div class="setlist-selector">
            <select v-model="setlistStore.activeSetlistId" class="setlist-select" aria-label="Setlist">
                <option :value="null">Select a setlist...</option>
                <option v-for="s in setlistOptions" :key="s.id" :value="s.id">
                    {{ s.name }} ({{ s.items.length }})
                </option>
            </select>
            <button class="add-btn" aria-label="New setlist" @click="showCreateForm = !showCreateForm">+</button>
        </div>

        <!-- Create form -->
        <div v-if="showCreateForm" class="create-form">
            <input v-model="newSetlistName" placeholder="Setlist name..." @keyup.enter="createSetlist" />
            <button @click="createSetlist">Create</button>
        </div>

        <!-- Offline status -->
        <div v-if="setlistStore.activeSetlist && setlistStore.activeSetlist.items.length > 0" class="offline-bar">
            <div class="offline-summary" :class="{ complete: offline.isSetlistOffline(setlistStore.activeSetlist) }">
                {{ offlineSummary }}
            </div>
            <button
                class="offline-btn"
                :disabled="offline.downloadingId.value !== null"
                @click="offline.download(setlistStore.activeSetlist)"
            >
                {{ offline.isSetlistOffline(setlistStore.activeSetlist) ? "Refresh offline copy" : "Make available offline" }}
            </button>
            <div v-if="offline.failedTitles.value.length > 0" class="offline-failed">
                Could not download: {{ offline.failedTitles.value.join(", ") }}
            </div>
        </div>

        <!-- Active setlist songs -->
        <div v-if="setlistStore.activeSetlist" class="song-list">
            <div
                v-for="(item, index) in setlistStore.activeSetlist.items"
                :key="item.id"
                class="song-item"
                :class="{ active: index === setlistStore.currentItemIndex }"
                @click="navigateToSong(index)"
            >
                <span class="song-number">{{ index + 1 }}</span>
                <div class="song-info">
                    <div class="song-title">{{ item.title }}</div>
                    <div class="song-artist">
                        <span
                            class="offline-dot"
                            :class="{ on: offline.offlineTabIds.value.has(item.tabId) }"
                            :title='offline.offlineTabIds.value.has(item.tabId) ? "On this device" : "Needs a connection"'
                        ></span>
                        {{ item.artist }}
                    </div>
                </div>
                <button class="icon-btn" aria-label="Move up" :disabled="index === 0" @click.stop="move(index, -1)">▲</button>
                <button
                    class="icon-btn"
                    aria-label="Move down"
                    :disabled="index === setlistStore.activeSetlist.items.length - 1"
                    @click.stop="move(index, 1)"
                >
                    ▼
                </button>
                <button class="remove-btn" aria-label="Remove from setlist" @click.stop="setlistStore.removeFromSetlist(setlistStore.activeSetlistId!, item.id)">×</button>
            </div>

            <button class="add-current-btn" @click="addCurrentTab">
                + Add current tab
            </button>

            <button class="delete-setlist-btn" @click="deleteActiveSetlist">
                Delete this setlist
            </button>
        </div>

        <!-- Navigation -->
        <div v-if="setlistStore.activeSetlist" class="nav-buttons">
            <button
                :disabled="!setlistStore.hasPrev"
                @click="setlistStore.prevSong();
                navigateToSong(setlistStore.currentItemIndex)"
            >
                ← Previous
            </button>
            <button
                :disabled="!setlistStore.hasNext"
                @click="setlistStore.nextSong();
                navigateToSong(setlistStore.currentItemIndex)"
            >
                Next →
            </button>
        </div>
    </div>
</template>

<style scoped>
.setlist-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    background: #1a1a2e;
    color: #e0e0e0;
    border-left: 1px solid #2a2a4a;
    z-index: 1500;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
}

.sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #2a2a4a;
}

.sidebar-header h3 {
    margin: 0;
    font-size: 18px;
}

.close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0 8px;
}

.setlist-selector {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a4a;
}

.setlist-select {
    flex: 1;
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 8px;
}

.add-btn {
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 6px;
    width: 36px;
    font-size: 18px;
    cursor: pointer;
}

.create-form {
    display: flex;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid #2a2a4a;
}

.create-form input {
    flex: 1;
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 8px;
}

.create-form button {
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    cursor: pointer;
}

.song-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
}

.song-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    min-height: 44px; /* Apple HIG touch target */
}

.song-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

.song-item.active {
    background: rgba(74, 144, 217, 0.2);
    border-left: 3px solid #4a90d9;
}

.song-number {
    width: 28px;
    text-align: center;
    color: #666;
    font-size: 14px;
    flex-shrink: 0;
}

.song-info {
    flex: 1;
    min-width: 0;
}

.song-title {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-artist {
    font-size: 12px;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.remove-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 18px;
    cursor: pointer;
    padding: 0 8px;
    flex-shrink: 0;
}

.remove-btn:hover {
    color: #e74c3c;
}

.add-current-btn {
    display: block;
    width: calc(100% - 32px);
    margin: 8px 16px;
    padding: 12px;
    background: transparent;
    color: #4a90d9;
    border: 1px dashed #4a90d9;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.nav-buttons {
    display: flex;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid #2a2a4a;
}

.nav-buttons button {
    flex: 1;
    padding: 12px;
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #333;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    min-height: 44px; /* Apple HIG */
}

.nav-buttons button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.nav-buttons button:not(:disabled):hover {
    background: #1e2d4a;
}

.setlist-sidebar {
    max-width: 100vw;
    height: 100dvh;
}

.offline-bar {
    padding: 10px 16px;
    border-bottom: 1px solid #2a2a4a;
}

.offline-summary {
    font-size: 13px;
    color: #9aa0b4;
    margin-bottom: 8px;
}

.offline-summary.complete {
    color: #5fd38a;
}

.offline-btn {
    width: 100%;
    min-height: 44px;
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #4a90d9;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.offline-btn:disabled {
    opacity: 0.5;
    cursor: progress;
}

.offline-failed {
    margin-top: 8px;
    font-size: 12px;
    color: #f0a35e;
}

.offline-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 4px;
    border-radius: 50%;
    border: 1px solid #777;
    background: transparent;
}

.offline-dot.on {
    background: #5fd38a;
    border-color: #5fd38a;
}

.icon-btn {
    background: none;
    border: none;
    color: #777;
    font-size: 12px;
    cursor: pointer;
    min-width: 32px;
    min-height: 44px;
    flex-shrink: 0;
}

.icon-btn:disabled {
    opacity: 0.25;
    cursor: default;
}

.remove-btn {
    min-width: 32px;
    min-height: 44px;
}

.delete-setlist-btn {
    display: block;
    width: calc(100% - 32px);
    margin: 16px 16px 8px;
    padding: 10px;
    background: transparent;
    color: #c66;
    border: 1px solid #533;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
}
</style>
