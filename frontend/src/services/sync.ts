import { db } from "./storage.ts";
import { baseURL } from "../app.ts";
import { checkServerReachable } from "./fetch-interceptor.ts";

let isSyncing = false;

// Custom original fetch bypass to hit server directly during sync
const directFetch = window.fetch;

export async function runSync(): Promise<void> {
    if (isSyncing) return;

    // Check reachability
    const online = await checkServerReachable();
    if (!online) {
        console.info("Sync skipped: Server is offline.");
        return;
    }

    // Verify user profile exists (must be logged in)
    const profiles = await db.profile.toArray();
    if (profiles.length === 0) {
        console.info("Sync skipped: No active user profile session cached.");
        return;
    }

    isSyncing = true;
    console.info("Starting synchronization...");

    try {
        // --- 1. PUSH OFFLINE DELETIONS ---
        const deletedIdsStr = localStorage.getItem("deletedTabIds");
        if (deletedIdsStr) {
            const deletedIds = JSON.parse(deletedIdsStr) as string[];
            if (deletedIds.length > 0) {
                console.info(`Syncing ${deletedIds.length} offline deletions to server...`);
                const remainingDeletions: string[] = [];
                for (const id of deletedIds) {
                    try {
                        const res = await directFetch((baseURL || "") + `/api/tab/${id}`, {
                            method: "DELETE",
                            credentials: "include",
                        });
                        if (!res.ok && res.status !== 404) {
                            remainingDeletions.push(id);
                        }
                    } catch (e) {
                        console.warn(`Failed to push deletion of ${id}:`, e);
                        remainingDeletions.push(id);
                    }
                }
                localStorage.setItem("deletedTabIds", JSON.stringify(remainingDeletions));
            }
        }

        // --- 2. PUSH OFFLINE CREATIONS & EDITS ---
        const pendingTabs = await db.tabs.where("pendingSync").equals(1).toArray(); // Dexie boolean index represents true as 1 or true
        const allPending = pendingTabs.filter((t) => t.pendingSync === true);

        if (allPending.length > 0) {
            console.info(`Syncing ${allPending.length} local edits/creations to server...`);
            for (const tab of allPending) {
                try {
                    if (tab.localOnly) {
                        // Upload new tab created offline
                        const file = await db.files.get(tab.id);
                        if (!file) continue;

                        const formData = new FormData();
                        formData.append("file", file.fileBlob, `tab.${file.extension}`);
                        formData.append("title", tab.title);
                        formData.append("artist", tab.artist);

                        const res = await directFetch((baseURL || "") + "/api/new-tab", {
                            method: "POST",
                            body: formData,
                            credentials: "include",
                        });

                        if (res.ok) {
                            const data = await res.json();
                            const newServerId = data.id;

                            // Swap temp local ID for real server ID
                            await db.tabs.delete(tab.id);
                            await db.files.delete(tab.id);

                            await db.tabs.put({
                                ...tab,
                                id: newServerId,
                                localOnly: false,
                                pendingSync: false,
                            });

                            await db.files.put({
                                tabId: newServerId,
                                fileBlob: file.fileBlob,
                                extension: file.extension,
                            });

                            // Re-map audio files to the new server ID
                            const audios = await db.audio.where({ tabId: tab.id }).toArray();
                            for (const audio of audios) {
                                if (audio.id) await db.audio.delete(audio.id);
                                await db.audio.put({
                                    tabId: newServerId,
                                    filename: audio.filename,
                                    fileBlob: audio.fileBlob,
                                });
                            }
                            console.info(`Local tab ${tab.id} uploaded and synced as server ID ${newServerId}`);
                        }
                    } else {
                        // Sync edit for existing tab
                        // 1. Edit Tab Info
                        const resInfo = await directFetch((baseURL || "") + `/api/tab/${tab.id}`, {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                                title: tab.title,
                                artist: tab.artist,
                                public: tab.public,
                            }),
                            credentials: "include",
                        });

                        // 2. Favorite status
                        const resFav = await directFetch((baseURL || "") + `/api/tab/${tab.id}/fav`, {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ fav: tab.fav }),
                            credentials: "include",
                        });

                        if (resInfo.ok && resFav.ok) {
                            // Mark as synced
                            tab.pendingSync = false;
                            await db.tabs.put(tab);
                            console.info(`Local updates for tab ${tab.id} synced successfully`);
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to sync local tab ${tab.id}:`, e);
                }
            }
        }

        // --- 3. PULL REMOTELY ADDED/UPDATED TABS ---
        console.info("Fetching updates from server...");
        const res = await directFetch((baseURL || "") + "/api/tabs", { credentials: "include" });
        if (res.ok) {
            const data = await res.json();
            if (data.ok && Array.isArray(data.tabs)) {
                const serverTabs = data.tabs;
                const serverIds = new Set(serverTabs.map((t: any) => t.id));

                // A. Delete local tabs that were deleted on the server
                const localTabs = await db.tabs.toArray();
                for (const localTab of localTabs) {
                    if (!localTab.localOnly && !serverIds.has(localTab.id)) {
                        console.info(`Deleting tab ${localTab.id} locally (deleted on server)`);
                        await db.tabs.delete(localTab.id);
                        await db.files.delete(localTab.id);
                        const audios = await db.audio.where({ tabId: localTab.id }).toArray();
                        for (const a of audios) {
                            if (a.id) await db.audio.delete(a.id);
                        }
                    }
                }

                // B. Fetch details and cache new or updated tabs
                for (const serverTab of serverTabs) {
                    const localTab = await db.tabs.get(serverTab.id);
                    const needsUpdate = !localTab || new Date(serverTab.updatedAt) > new Date(localTab.updatedAt);

                    if (needsUpdate) {
                        console.info(`Updating cache for tab: ${serverTab.title} (${serverTab.id})`);
                        // Standard fetch to single tab detail automatically caches config, file, and audio in the interceptor
                        await window.fetch((baseURL || "") + `/api/tab/${serverTab.id}`);
                    }
                }
            }
        }

        console.info("Synchronization complete.");
    } catch (e) {
        console.error("Sync run encountered error:", e);
    } finally {
        isSyncing = false;
    }
}
