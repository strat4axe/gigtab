import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { type CachedSetlist, db } from "../services/storage.ts";
import { SETLISTS_CHANGED_EVENT, syncSetlists } from "../services/setlist-sync.ts";

export interface SetlistItem {
    id: string;
    tabId: string;
    title: string;
    artist: string;
    order: number;
}

export interface Setlist {
    id: string;
    name: string;
    items: SetlistItem[];
    createdAt: string;
    updatedAt: string;
}

const LEGACY_STORAGE_KEY = "gigtab-setlists";
const ACTIVE_STORAGE_KEY = "gigtab-active-setlist";

function readActiveId(): string | null {
    try {
        return localStorage.getItem(ACTIVE_STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Setlists live in IndexedDB on this device (the source of truth while offline)
 * and are synced with the server whenever it is reachable.
 */
export const useSetlistStore = defineStore("setlist", () => {
    const setlists = ref<Setlist[]>([]);
    const ready = ref(false);
    const activeSetlistId = ref<string | null>(readActiveId());
    const currentItemIndex = ref(0);

    const activeSetlist = computed(() => setlists.value.find((s) => s.id === activeSetlistId.value) ?? null);

    const currentItem = computed(() => activeSetlist.value?.items[currentItemIndex.value] ?? null);

    const hasNext = computed(() => activeSetlist.value ? currentItemIndex.value < activeSetlist.value.items.length - 1 : false);

    const hasPrev = computed(() => currentItemIndex.value > 0);

    // The active setlist is a per-device choice, so it stays in localStorage
    watch(activeSetlistId, (id) => {
        try {
            if (id) {
                localStorage.setItem(ACTIVE_STORAGE_KEY, id);
            } else {
                localStorage.removeItem(ACTIVE_STORAGE_KEY);
            }
        } catch {
            // Storage unavailable (private mode): the choice just won't survive a reload
        }
    });

    let syncTimer: number | undefined;

    function scheduleSync() {
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => {
            syncSetlists();
        }, 800);
    }

    /** Write a setlist to IndexedDB as a local change that still has to reach the server. */
    function persist(setlist: Setlist) {
        setlist.updatedAt = new Date().toISOString();
        const row: CachedSetlist = {
            ...JSON.parse(JSON.stringify(setlist)),
            deleted: false,
            pendingSync: true,
        };
        db.setlists.put(row).then(scheduleSync).catch((e) => console.error("Failed to save setlist:", e));
    }

    async function reload() {
        const rows = await db.setlists.toArray();
        setlists.value = rows
            .filter((row) => !row.deleted)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map((row) => ({
                id: row.id,
                name: row.name,
                items: row.items,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            }));
    }

    /** Move setlists saved by older versions (localStorage) into IndexedDB, once. */
    async function migrateLegacyStorage() {
        let saved: string | null = null;
        try {
            saved = localStorage.getItem(LEGACY_STORAGE_KEY);
        } catch {
            return;
        }
        if (!saved) {
            return;
        }
        try {
            const legacy = JSON.parse(saved) as Partial<Setlist>[];
            for (const s of legacy) {
                if (!s.id || !s.name || await db.setlists.get(s.id)) {
                    continue;
                }
                const createdAt = s.createdAt || new Date().toISOString();
                await db.setlists.put({
                    id: s.id,
                    name: s.name,
                    items: s.items || [],
                    createdAt,
                    updatedAt: createdAt,
                    deleted: false,
                    pendingSync: true,
                });
            }
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (e) {
            console.error("Failed to migrate setlists:", e);
        }
    }

    function createSetlist(name: string): Setlist {
        const now = new Date().toISOString();
        const setlist: Setlist = {
            id: crypto.randomUUID(),
            name,
            items: [],
            createdAt: now,
            updatedAt: now,
        };
        setlists.value.push(setlist);
        persist(setlist);
        return setlist;
    }

    function renameSetlist(setlistId: string, name: string) {
        const setlist = setlists.value.find((s) => s.id === setlistId);
        if (!setlist || !name.trim()) return;
        setlist.name = name.trim();
        persist(setlist);
    }

    function deleteSetlist(setlistId: string) {
        const setlist = setlists.value.find((s) => s.id === setlistId);
        if (!setlist) return;
        setlists.value = setlists.value.filter((s) => s.id !== setlistId);
        if (activeSetlistId.value === setlistId) {
            activeSetlistId.value = null;
        }
        // Keep a tombstone so the deletion reaches the server and other devices
        db.setlists.put({
            id: setlist.id,
            name: setlist.name,
            items: [],
            createdAt: setlist.createdAt,
            updatedAt: new Date().toISOString(),
            deleted: true,
            pendingSync: true,
        }).then(scheduleSync).catch((e) => console.error("Failed to delete setlist:", e));
    }

    function addToSetlist(setlistId: string, tabId: string, title: string, artist: string) {
        const setlist = setlists.value.find((s) => s.id === setlistId);
        if (!setlist) return;
        setlist.items.push({
            id: crypto.randomUUID(),
            tabId,
            title,
            artist,
            order: setlist.items.length,
        });
        persist(setlist);
    }

    function removeFromSetlist(setlistId: string, itemId: string) {
        const setlist = setlists.value.find((s) => s.id === setlistId);
        if (!setlist) return;
        setlist.items = setlist.items.filter((i) => i.id !== itemId);
        setlist.items.forEach((item, idx) => {
            item.order = idx;
        });
        persist(setlist);
    }

    function reorderSetlist(setlistId: string, fromIndex: number, toIndex: number) {
        const setlist = setlists.value.find((s) => s.id === setlistId);
        if (!setlist) return;
        if (toIndex < 0 || toIndex >= setlist.items.length || fromIndex === toIndex) return;
        const [item] = setlist.items.splice(fromIndex, 1);
        setlist.items.splice(toIndex, 0, item);
        setlist.items.forEach((item, idx) => {
            item.order = idx;
        });
        persist(setlist);
    }

    function nextSong() {
        if (hasNext.value) currentItemIndex.value++;
    }

    function prevSong() {
        if (hasPrev.value) currentItemIndex.value--;
    }

    async function init() {
        await migrateLegacyStorage();
        await reload();
        ready.value = true;
        await syncSetlists();
    }

    window.addEventListener(SETLISTS_CHANGED_EVENT, () => {
        reload();
    });

    const initialized = init().catch((e) => console.error("Failed to load setlists:", e));

    return {
        setlists,
        ready,
        initialized,
        activeSetlistId,
        currentItemIndex,
        activeSetlist,
        currentItem,
        hasNext,
        hasPrev,
        createSetlist,
        renameSetlist,
        deleteSetlist,
        addToSetlist,
        removeFromSetlist,
        reorderSetlist,
        nextSong,
        prevSong,
        reload,
    };
});
