import { type CachedSetlist, db } from "./storage.ts";
import { cacheTabAssets } from "./fetch-interceptor.ts";
import { baseURL } from "../app.ts";

/** Fired on `window` when setlists in IndexedDB were changed by a sync. */
export const SETLISTS_CHANGED_EVENT = "gigtab-setlists-changed";

let inFlight: Promise<void> | null = null;

function isNewer(a: string, b: string): boolean {
    return Date.parse(a) > Date.parse(b);
}

function toWire(setlist: CachedSetlist) {
    return {
        id: setlist.id,
        name: setlist.name,
        items: setlist.items,
        createdAt: setlist.createdAt,
        updatedAt: setlist.updatedAt,
        deleted: !!setlist.deleted,
    };
}

/**
 * Two-way setlist sync with the server. Safe to call at any time:
 * it does nothing when the server is unreachable or the user is not logged in,
 * and local changes stay marked as pending until a later run succeeds.
 */
export function syncSetlists(): Promise<void> {
    if (!inFlight) {
        inFlight = doSync()
            .catch((e) => console.info("Setlist sync skipped:", e?.message ?? e))
            .finally(() => {
                inFlight = null;
            });
    }
    return inFlight;
}

async function doSync(): Promise<void> {
    let changed = false;

    // 1. Push local changes. The server keeps whichever copy has the later updatedAt.
    const pending = (await db.setlists.toArray()).filter((s) => s.pendingSync);
    for (const local of pending) {
        const res = await fetch((baseURL || "") + `/api/setlists/${encodeURIComponent(local.id)}`, {
            method: "PUT",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(toWire(local)),
        });
        if (!res.ok) {
            // Not logged in, or the server rejected it. Keep it pending and stop here.
            throw new Error(`push failed (${res.status})`);
        }
        const data = await res.json();

        await db.transaction("rw", db.setlists, async () => {
            const current = await db.setlists.get(local.id);
            // Edited again while the request was in flight: leave it pending for the next run
            if (!current || current.updatedAt !== local.updatedAt) {
                return;
            }
            await db.setlists.put({ ...data.setlist, pendingSync: false });
        });

        if (!data.applied) {
            changed = true;
        }
    }

    // 2. Pull. Only take a server copy that is strictly newer than ours, so a stale
    //    cached response can never roll a setlist back.
    const res = await fetch((baseURL || "") + "/api/setlists", { credentials: "include" });
    if (!res.ok) {
        throw new Error(`pull failed (${res.status})`);
    }
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.setlists)) {
        return;
    }

    for (const remote of data.setlists as CachedSetlist[]) {
        await db.transaction("rw", db.setlists, async () => {
            const local = await db.setlists.get(remote.id);
            if (!local || isNewer(remote.updatedAt, local.updatedAt)) {
                await db.setlists.put({ ...remote, pendingSync: false });
                changed = true;
            }
        });
    }

    if (changed) {
        window.dispatchEvent(new Event(SETLISTS_CHANGED_EVENT));
    }
}

/**
 * A tab created offline gets a real id once it is uploaded. Point setlist items at the new id.
 */
export async function remapSetlistTabId(oldTabId: string, newTabId: string): Promise<void> {
    let changed = false;
    await db.transaction("rw", db.setlists, async () => {
        for (const setlist of await db.setlists.toArray()) {
            if (!setlist.items.some((item) => item.tabId === oldTabId)) {
                continue;
            }
            setlist.items = setlist.items.map((item) => item.tabId === oldTabId ? { ...item, tabId: newTabId } : item);
            setlist.updatedAt = new Date().toISOString();
            setlist.pendingSync = true;
            await db.setlists.put(setlist);
            changed = true;
        }
    });
    if (changed) {
        window.dispatchEvent(new Event(SETLISTS_CHANGED_EVENT));
    }
}

/**
 * True when everything needed to play the tab without a connection is stored on this device:
 * its details, the tab file, and every uploaded audio file.
 * (YouTube and Apple Music always need a connection.)
 */
export async function isTabOffline(tabId: string): Promise<boolean> {
    const tab = await db.tabs.get(tabId);
    if (!tab) {
        return false;
    }
    if (!await db.files.get(tabId)) {
        return false;
    }
    for (const audio of tab.audioList || []) {
        if (!await db.audio.where({ tabId, filename: audio.filename }).first()) {
            return false;
        }
    }
    return true;
}

/**
 * Download one tab (details, file, audio) into IndexedDB. Throws if any part fails.
 */
export async function downloadTabOffline(tabId: string): Promise<void> {
    // Going through the fetch interceptor stores the tab details
    const res = await fetch((baseURL || "") + `/api/tab/${encodeURIComponent(tabId)}`, { credentials: "include" });
    if (!res.ok) {
        throw new Error(`Tab request failed (${res.status})`);
    }
    const data = await res.json();
    if (!data.ok || !data.tab) {
        throw new Error(data.msg || "Tab not available");
    }
    await cacheTabAssets(data.tab.id, data.tab.filename, data.audioList || []);
}
