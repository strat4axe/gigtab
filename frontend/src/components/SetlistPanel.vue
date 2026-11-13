<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { type Setlist, useSetlistStore } from "../stores/setlistStore";
import { useSetlistOffline } from "../composables/useSetlistOffline.ts";

const router = useRouter();
const setlistStore = useSetlistStore();
const offline = useSetlistOffline();

const newSetlistName = ref("");

const allTabIds = computed(() => setlistStore.setlists.flatMap((s) => s.items.map((item) => item.tabId)));

watch(allTabIds, (ids) => {
    offline.refresh(ids);
}, { immediate: true });

function createSetlist() {
    const name = newSetlistName.value.trim();
    if (!name) return;
    const setlist = setlistStore.createSetlist(name);
    setlistStore.activeSetlistId = setlist.id;
    newSetlistName.value = "";
}

function select(setlist: Setlist) {
    setlistStore.activeSetlistId = setlistStore.activeSetlistId === setlist.id ? null : setlist.id;
}

function open(setlist: Setlist) {
    if (setlist.items.length === 0) return;
    setlistStore.activeSetlistId = setlist.id;
    setlistStore.currentItemIndex = 0;
    router.push(`/tab/${setlist.items[0].tabId}`);
}

function status(setlist: Setlist): string {
    if (offline.downloadingId.value === setlist.id) {
        return `Downloading ${offline.progress.value.done} of ${offline.progress.value.total}...`;
    }
    if (setlist.items.length === 0) {
        return "No songs yet";
    }
    if (offline.isSetlistOffline(setlist)) {
        return "Available offline";
    }
    return `${offline.offlineCount(setlist)} of ${setlist.items.length} songs on this device`;
}
</script>

<template>
    <div class="setlist-panel mb-4 ms-3 me-3" v-if="setlistStore.ready">
        <h4>Setlists</h4>

        <div
            v-for="setlist in setlistStore.setlists"
            :key="setlist.id"
            class="setlist-card"
            :class="{ selected: setlistStore.activeSetlistId === setlist.id }"
        >
            <button class="setlist-main" @click="select(setlist)" :aria-pressed="setlistStore.activeSetlistId === setlist.id">
                <span class="name">{{ setlist.name }}</span>
                <span class="meta">
                    {{ setlist.items.length }} {{ setlist.items.length === 1 ? "song" : "songs" }} ·
                    <span :class="{ complete: offline.isSetlistOffline(setlist) }">{{ status(setlist) }}</span>
                </span>
            </button>

            <button
                class="btn btn-outline-secondary"
                :disabled="setlist.items.length === 0 || offline.downloadingId.value !== null"
                @click="offline.download(setlist)"
            >
                {{ offline.isSetlistOffline(setlist) ? "Refresh" : "Download" }}
            </button>

            <button class="btn btn-primary" :disabled="setlist.items.length === 0" @click="open(setlist)">
                Open
            </button>
        </div>

        <div v-if="offline.failedTitles.value.length > 0" class="failed">
            Could not download: {{ offline.failedTitles.value.join(", ") }}
        </div>

        <div class="hint" v-if="setlistStore.activeSetlist">
            Adding songs to <strong>{{ setlistStore.activeSetlist.name }}</strong>: use the "+ Setlist" button next to a tab below.
        </div>

        <form class="input-group new-setlist" @submit.prevent="createSetlist">
            <input
                type="text"
                class="form-control"
                v-model="newSetlistName"
                placeholder="New setlist name..."
                aria-label="New setlist name"
            />
            <button class="btn btn-secondary" type="submit" :disabled="!newSetlistName.trim()">Create</button>
        </form>
    </div>
</template>

<style scoped lang="scss">
@import "../styles/vars.scss";

h4 {
    color: $color2-dark;
}

.setlist-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    margin-bottom: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;

    &.selected {
        border-color: $primary;
        background: rgba(255, 255, 255, 0.04);
    }

    .btn {
        min-height: 44px;
        white-space: nowrap;
    }
}

.setlist-main {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    padding: 4px 8px;

    .name {
        font-weight: 600;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .meta {
        font-size: 13px;
        opacity: 0.7;
    }

    .complete {
        color: #5fd38a;
    }
}

.failed {
    font-size: 13px;
    color: #f0a35e;
    margin-bottom: 8px;
}

.hint {
    font-size: 13px;
    opacity: 0.8;
    margin-bottom: 8px;
}

.new-setlist {
    max-width: 420px;
}
</style>
