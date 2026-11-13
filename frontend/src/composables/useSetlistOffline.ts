import { ref } from "vue";
import { downloadTabOffline, isTabOffline } from "../services/setlist-sync.ts";

interface SetlistLike {
    id: string;
    items: { tabId: string; title: string }[];
}

/**
 * Tracks which songs are stored on this device and downloads a whole setlist for offline use.
 */
export function useSetlistOffline() {
    // Tab ids that are fully available without a connection
    const offlineTabIds = ref<Set<string>>(new Set());
    // Setlist currently being downloaded, if any
    const downloadingId = ref<string | null>(null);
    const progress = ref({ done: 0, total: 0 });
    // Titles of songs that could not be downloaded in the last run
    const failedTitles = ref<string[]>([]);

    async function refresh(tabIds: string[]) {
        const next = new Set(offlineTabIds.value);
        for (const tabId of new Set(tabIds)) {
            if (await isTabOffline(tabId)) {
                next.add(tabId);
            } else {
                next.delete(tabId);
            }
        }
        offlineTabIds.value = next;
    }

    function offlineCount(setlist: SetlistLike): number {
        return setlist.items.filter((item) => offlineTabIds.value.has(item.tabId)).length;
    }

    function isSetlistOffline(setlist: SetlistLike): boolean {
        return setlist.items.length > 0 && offlineCount(setlist) === setlist.items.length;
    }

    async function download(setlist: SetlistLike) {
        if (downloadingId.value) {
            return;
        }
        const tabs = new Map(setlist.items.map((item) => [item.tabId, item.title]));
        downloadingId.value = setlist.id;
        progress.value = { done: 0, total: tabs.size };
        failedTitles.value = [];

        try {
            for (const [tabId, title] of tabs) {
                try {
                    await downloadTabOffline(tabId);
                } catch (e) {
                    console.warn(`Could not download "${title}" for offline use:`, e);
                    failedTitles.value.push(title || tabId);
                }
                progress.value = { done: progress.value.done + 1, total: tabs.size };
            }
            await refresh([...tabs.keys()]);
        } finally {
            downloadingId.value = null;
        }
    }

    return {
        offlineTabIds,
        downloadingId,
        progress,
        failedTitles,
        refresh,
        offlineCount,
        isSetlistOffline,
        download,
    };
}
