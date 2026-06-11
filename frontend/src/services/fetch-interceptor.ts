import { db } from "./storage.ts";
import { baseURL } from "../app.ts";

const originalFetch = window.fetch;

// Helper to sanitize filenames in the browser
function sanitize(filename: string): string {
    return filename.replace(/[\\/:*?"<>|]/g, "_");
}

// Global flag to track online status with heartbeats
let _isServerReachable = navigator.onLine;

export async function checkServerReachable(): Promise<boolean> {
    if (!navigator.onLine) {
        _isServerReachable = false;
        return false;
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        // Ping is-finish-setup to verify reachability
        const pingURL = (baseURL || window.location.origin) + "/api/is-finish-setup";
        const res = await originalFetch(pingURL, {
            signal: controller.signal,
            credentials: "omit",
        });
        clearTimeout(timeoutId);
        _isServerReachable = res.ok;
        return res.ok;
    } catch {
        _isServerReachable = false;
        return false;
    }
}

// Periodic background reachability checks
setInterval(checkServerReachable, 15000);

export function initFetchInterceptor() {
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input : (input instanceof URL ? input.href : input.url);

        // Only intercept backend API endpoints
        if (!urlStr.includes("/api/")) {
            return originalFetch(input, init);
        }

        const method = init?.method?.toUpperCase() || "GET";

        try {
            // First check if navigator explicitly reports offline, bypass server try to speed up offline loading
            if (!navigator.onLine) {
                throw new TypeError("Failed to fetch");
            }

            // Attempt online fetch
            const response = await originalFetch(input, init);

            if (response.ok) {
                // Auto-cache successful GET responses
                const url = new URL(urlStr, window.location.origin);
                const path = url.pathname;

                // 1. GET /api/tabs
                if (path === "/api/tabs" && method === "GET") {
                    const clone = response.clone();
                    try {
                        const data = await clone.json();
                        if (data && data.ok && Array.isArray(data.tabs)) {
                            for (const tab of data.tabs) {
                                const existing = await db.tabs.get(tab.id);
                                await db.tabs.put({
                                    ...existing,
                                    ...tab,
                                    pendingSync: false,
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("Auto-caching tabs failed:", e);
                    }
                }

                // 2. GET /api/tab/:id
                const tabMatch = path.match(/^\/api\/tab\/([^\/]+)$/);
                if (tabMatch && method === "GET") {
                    const clone = response.clone();
                    try {
                        const data = await clone.json();
                        if (data && data.ok && data.tab) {
                            const tab = data.tab;
                            const existing = await db.tabs.get(tab.id);
                            await db.tabs.put({
                                ...existing,
                                ...tab,
                                youtubeList: data.youtubeList || [],
                                audioList: data.audioList || [],
                                appleMusicList: data.appleMusicList || [],
                                pendingSync: false,
                            });

                            // Background cache the tab file itself
                            const fileURL = (baseURL || "") + `/api/tab/${tab.id}/file`;
                            originalFetch(fileURL).then(async (fileRes) => {
                                if (fileRes.ok) {
                                    const blob = await fileRes.blob();
                                    const ext = tab.filename.split(".").pop()?.toLowerCase() || "gp";
                                    await db.files.put({
                                        tabId: tab.id,
                                        fileBlob: blob,
                                        extension: ext,
                                    });
                                }
                            }).catch((err) => console.warn(`Background cache file for tab ${tab.id} failed:`, err));

                            // Background cache any associated audio files
                            const audioList = data.audioList || [];
                            for (const audio of audioList) {
                                const audioFilename = audio.filename;
                                const audioURL = (baseURL || "") + `/api/tab/${tab.id}/audio/${encodeURIComponent(audioFilename)}`;

                                // Check if we already have it cached locally
                                const cachedAudio = await db.audio.where({ tabId: tab.id, filename: audioFilename }).first();
                                if (!cachedAudio) {
                                    originalFetch(audioURL).then(async (audioRes) => {
                                        if (audioRes.ok) {
                                            const blob = await audioRes.blob();
                                            await db.audio.put({
                                                tabId: tab.id,
                                                filename: audioFilename,
                                                fileBlob: blob,
                                            });
                                        }
                                    }).catch((err) => console.warn(`Background cache audio ${audioFilename} failed:`, err));
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("Auto-caching single tab failed:", e);
                    }
                }
            }

            return response;
        } catch (error) {
            // Check if it is a connectivity failure
            if (error instanceof TypeError || (error instanceof Error && error.message.includes("Failed to fetch"))) {
                console.info(`Network connection offline. Intercepting API ${method} ${urlStr} from cache...`);
                return await handleOfflineRequest(urlStr, input, init);
            }
            throw error;
        }
    };
}

async function handleOfflineRequest(urlStr: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(urlStr, window.location.origin);
    const path = url.pathname;
    const method = init?.method?.toUpperCase() || "GET";

    // 1. GET /api/tabs
    if (path === "/api/tabs" && method === "GET") {
        const tabs = await db.tabs.toArray();
        return new Response(JSON.stringify({ ok: true, tabs }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 2. GET /api/tab/:id
    const tabMatch = path.match(/^\/api\/tab\/([^\/]+)$/);
    if (tabMatch && method === "GET") {
        const id = tabMatch[1];
        const tab = await db.tabs.get(id);
        if (!tab) {
            return new Response(JSON.stringify({ ok: false, message: "Tab not found in local cache" }), {
                status: 404,
                headers: { "content-type": "application/json" },
            });
        }
        return new Response(
            JSON.stringify({
                ok: true,
                showOpenButtons: false,
                tab: { ...tab, youtubeList: undefined, audioList: undefined, appleMusicList: undefined },
                youtubeList: tab.youtubeList || [],
                audioList: tab.audioList || [],
                appleMusicList: tab.appleMusicList || [],
                filePath: "",
            }),
            {
                headers: { "content-type": "application/json" },
            },
        );
    }

    // 3. GET /api/tab/:id/temp-token
    const tempTokenMatch = path.match(/^\/api\/tab\/([^\/]+)\/temp-token$/);
    if (tempTokenMatch && method === "GET") {
        return new Response(JSON.stringify({ ok: true, token: "local-temp-token" }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 4. GET /api/tab/:id/file
    const fileMatch = path.match(/^\/api\/tab\/([^\/]+)\/file$/);
    if (fileMatch && method === "GET") {
        const id = fileMatch[1];
        const file = await db.files.get(id);
        if (!file) {
            return new Response(JSON.stringify({ ok: false, message: "Tab file not cached" }), {
                status: 404,
                headers: { "content-type": "application/json" },
            });
        }
        return new Response(file.fileBlob, {
            headers: { "content-type": "application/octet-stream" },
        });
    }

    // 4. GET /api/tab/:id/audio/:filename
    const audioMatch = path.match(/^\/api\/tab\/([^\/]+)\/audio\/([^\/]+)$/);
    if (audioMatch && method === "GET") {
        const id = audioMatch[1];
        const filename = decodeURIComponent(audioMatch[2]);
        const audio = await db.audio.where({ tabId: id, filename: filename }).first();
        if (!audio) {
            return new Response(JSON.stringify({ ok: false, message: "Audio file not cached" }), {
                status: 404,
                headers: { "content-type": "application/json" },
            });
        }
        return new Response(audio.fileBlob, {
            headers: { "content-type": "application/octet-stream" },
        });
    }

    // 5. POST /api/tab/:id/fav
    const favMatch = path.match(/^\/api\/tab\/([^\/]+)\/fav$/);
    if (favMatch && method === "POST") {
        const id = favMatch[1];
        const body = JSON.parse(init?.body as string || "{}");
        const tab = await db.tabs.get(id);
        if (tab) {
            tab.fav = body.fav;
            tab.pendingSync = true;
            tab.updatedAt = new Date().toISOString();
            await db.tabs.put(tab);
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 6. POST /api/tab/:id (Edit Tab Info)
    if (tabMatch && method === "POST") {
        const id = tabMatch[1];
        const body = JSON.parse(init?.body as string || "{}");
        const tab = await db.tabs.get(id);
        if (tab) {
            tab.title = body.title;
            tab.artist = body.artist;
            tab.public = body.public;
            tab.pendingSync = true;
            tab.updatedAt = new Date().toISOString();
            await db.tabs.put(tab);
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 7. DELETE /api/tab/:id
    if (tabMatch && method === "DELETE") {
        const id = tabMatch[1];
        const tab = await db.tabs.get(id);
        if (tab) {
            await db.tabs.delete(id);
            await db.files.delete(id);
            const audios = await db.audio.where({ tabId: id }).toArray();
            for (const a of audios) {
                if (a.id) await db.audio.delete(a.id);
            }
            if (!tab.localOnly) {
                const deletedIds = JSON.parse(localStorage.getItem("deletedTabIds") || "[]");
                deletedIds.push(id);
                localStorage.setItem("deletedTabIds", JSON.stringify(deletedIds));
            }
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 8. POST /api/new-tab (Create Offline Tab)
    if (path === "/api/new-tab" && method === "POST") {
        const body = init?.body;
        if (body instanceof FormData) {
            const file = body.get("file") as File;
            const title = (body.get("title") as string || file.name).trim();
            const artist = (body.get("artist") as string || "").trim();
            const ext = file.name.split(".").pop()?.toLowerCase() || "txt";

            const localId = "local_" + crypto.randomUUID();
            const newTab = {
                id: localId,
                title,
                artist,
                public: false,
                fav: false,
                updatedAt: new Date().toISOString(),
                localOnly: true,
                pendingSync: true,
                youtubeList: [],
                audioList: [],
            };

            await db.tabs.put(newTab);
            await db.files.put({
                tabId: localId,
                fileBlob: file,
                extension: ext,
            });

            return new Response(JSON.stringify({ ok: true, id: localId }), {
                headers: { "content-type": "application/json" },
            });
        }
    }

    // 9. POST /api/tab/:id/replace
    const replaceMatch = path.match(/^\/api\/tab\/([^\/]+)\/replace$/);
    if (replaceMatch && method === "POST") {
        const id = replaceMatch[1];
        const body = init?.body;
        if (body instanceof FormData) {
            const file = body.get("file") as File;
            const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
            const tab = await db.tabs.get(id);
            if (tab) {
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
                await db.files.put({
                    tabId: id,
                    fileBlob: file,
                    extension: ext,
                });
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }
    }

    // 10. POST /api/tab/:id/audio
    const audioUploadMatch = path.match(/^\/api\/tab\/([^\/]+)\/audio$/);
    if (audioUploadMatch && method === "POST") {
        const id = audioUploadMatch[1];
        const body = init?.body;
        if (body instanceof FormData) {
            const file = body.get("file") as File;
            const filename = sanitize(file.name);
            const tab = await db.tabs.get(id);
            if (tab) {
                await db.audio.put({
                    tabId: id,
                    filename: filename,
                    fileBlob: file,
                });

                if (!tab.audioList) tab.audioList = [];
                if (!tab.audioList.some((a) => a.filename === filename)) {
                    tab.audioList.push({ filename });
                }
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
            });
        }
    }

    // 11. DELETE /api/tab/:id/audio/:filename
    const audioDeleteMatch = path.match(/^\/api\/tab\/([^\/]+)\/audio\/([^\/]+)$/);
    if (audioDeleteMatch && method === "DELETE") {
        const id = audioDeleteMatch[1];
        const filename = decodeURIComponent(audioDeleteMatch[2]);
        const tab = await db.tabs.get(id);
        if (tab) {
            const localAudio = await db.audio.where({ tabId: id, filename: filename }).first();
            if (localAudio && localAudio.id) {
                await db.audio.delete(localAudio.id);
            }
            tab.audioList = (tab.audioList || []).filter((a) => a.filename !== filename);
            tab.updatedAt = new Date().toISOString();
            tab.pendingSync = true;
            await db.tabs.put(tab);
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 12. POST /api/tab/:id/youtube
    const youtubeMatch = path.match(/^\/api\/tab\/([^\/]+)\/youtube$/);
    if (youtubeMatch && method === "POST") {
        const id = youtubeMatch[1];
        const body = JSON.parse(init?.body as string || "{}");
        const tab = await db.tabs.get(id);
        if (tab) {
            if (!tab.youtubeList) tab.youtubeList = [];
            if (!tab.youtubeList.some((y) => y.videoID === body.videoID)) {
                tab.youtubeList.push({ videoID: body.videoID });
            }
            tab.updatedAt = new Date().toISOString();
            tab.pendingSync = true;
            await db.tabs.put(tab);
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 13. POST/DELETE /api/tab/:id/youtube/:videoID
    const youtubeVideoMatch = path.match(/^\/api\/tab\/([^\/]+)\/youtube\/([^\/]+)$/);
    if (youtubeVideoMatch) {
        const id = youtubeVideoMatch[1];
        const videoID = decodeURIComponent(youtubeVideoMatch[2]);
        const tab = await db.tabs.get(id);
        if (tab) {
            if (method === "POST") {
                const body = JSON.parse(init?.body as string || "{}");
                if (!tab.youtubeList) tab.youtubeList = [];
                const idx = tab.youtubeList.findIndex((y) => y.videoID === videoID);
                if (idx >= 0) {
                    tab.youtubeList[idx] = { ...tab.youtubeList[idx], ...body };
                } else {
                    tab.youtubeList.push({ videoID, ...body });
                }
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
            } else if (method === "DELETE") {
                tab.youtubeList = (tab.youtubeList || []).filter((y) => y.videoID !== videoID);
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
            }
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 14. POST /api/tab/:id/applemusic
    const appleMusicMatch = path.match(/^\/api\/tab\/([^\/]+)\/applemusic$/);
    if (appleMusicMatch && method === "POST") {
        const id = appleMusicMatch[1];
        const body = JSON.parse(init?.body as string || "{}");
        const tab = await db.tabs.get(id);
        if (tab) {
            if (!tab.appleMusicList) tab.appleMusicList = [];
            if (!tab.appleMusicList.some((am) => am.trackID === body.trackID)) {
                tab.appleMusicList.push({ trackID: body.trackID });
            }
            tab.updatedAt = new Date().toISOString();
            tab.pendingSync = true;
            await db.tabs.put(tab);
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 15. POST/DELETE /api/tab/:id/applemusic/:trackID
    const appleMusicTrackMatch = path.match(/^\/api\/tab\/([^\/]+)\/applemusic\/([^\/]+)$/);
    if (appleMusicTrackMatch) {
        const id = appleMusicTrackMatch[1];
        const trackID = decodeURIComponent(appleMusicTrackMatch[2]);
        const tab = await db.tabs.get(id);
        if (tab) {
            if (method === "POST") {
                const body = JSON.parse(init?.body as string || "{}");
                if (!tab.appleMusicList) tab.appleMusicList = [];
                const idx = tab.appleMusicList.findIndex((am) => am.trackID === trackID);
                if (idx >= 0) {
                    tab.appleMusicList[idx] = { ...tab.appleMusicList[idx], ...body };
                } else {
                    tab.appleMusicList.push({ trackID, ...body });
                }
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
            } else if (method === "DELETE") {
                tab.appleMusicList = (tab.appleMusicList || []).filter((am) => am.trackID !== trackID);
                tab.updatedAt = new Date().toISOString();
                tab.pendingSync = true;
                await db.tabs.put(tab);
            }
        }
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 16. GET /api/apple-music/token
    if (path === "/api/apple-music/token" && method === "GET") {
        return new Response(JSON.stringify({ ok: true, token: "" }), {
            headers: { "content-type": "application/json" },
        });
    }

    // 17. POST /api/auth/sign-out
    if (path.includes("/sign-out") && method === "POST") {
        await db.profile.clear();
        await db.tabs.clear();
        await db.files.clear();
        await db.audio.clear();
        return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
        });
    }

    throw new TypeError("Failed to fetch");
}
