<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { BDropdown, BDropdownDivider, BDropdownItem } from "bootstrap-vue-next";
import { notify } from "@kyvg/vue3-notification";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { isLoggedIn as checkIsLoggedIn } from "../auth-client.js";
import { baseURL, connectSocketIO, getSetting } from "../app.js";

import { useAlphaTab } from "../composables/useAlphaTab.ts";
import { usePlaybackControl } from "../composables/usePlaybackControl.ts";
import { useScrollBehavior } from "../composables/useScrollBehavior.ts";
import { useCursorMode } from "../composables/useCursorMode.ts";
import { useAudioSync } from "../composables/useAudioSync.ts";
import { useKeyboardShortcuts } from "../composables/useKeyboardShortcuts.ts";
import { useTrackSelection } from "../composables/useTrackSelection.ts";
import { useWakeLock } from "../composables/useWakeLock.ts";
import { usePerformanceMode } from "../composables/usePerformanceMode.ts";
import PlaybackControls from "../components/PlaybackControls.vue";
import ImportDialog from "../components/ImportDialog.vue";
import ChordSheet from "../components/ChordSheet.vue";
import PerformanceOverlay from "../components/PerformanceOverlay.vue";
import SetlistSidebar from "../components/SetlistSidebar.vue";

const emit = defineEmits(["setFixedHeader"]);

const route = useRoute();
const router = useRouter();

// Template refs
const bassTabContainer = ref(null);
const trackSelector = ref(null);
const trackList = ref(null);
const audioSelector = ref(null);
const audioListRef = ref(null);
const youtubeRef = ref(null);
const audioPlayer = ref(null);
const chordContentRef = ref(null);
const seekIndicator = ref({ visible: false, text: "", top: 0, left: 0 });
let seekIndicatorTimeout = null;

// Local state
const isLoggedIn = ref(false);
// Whether the current user may modify this tab (owner or admin)
const canEdit = ref(false);
const setting = ref({});
const toolbarAutoHide = ref(false);
const enableBackingTrack = ref(true);

// Gig mode (default): no music; the sheet scrolls on the saved song duration.
// Practice mode: play along with YouTube / audio / Apple Music, which then drives the scroll.
const APP_MODE_KEY = "gigtab-mode";
const appMode = ref(localStorage.getItem(APP_MODE_KEY) === "practice" ? "practice" : "gig");
// Set when the chosen music source never starts (no connection, blocked video, ...)
const mediaFailed = ref(false);

// True when scrolling runs on the saved duration instead of a music playhead
function usesTimedScroll() {
    return appMode.value === "gig" || mediaFailed.value || currentAudio.value === "none" || currentAudio.value === "synth";
}

// Gig mode forces "no audio"; that must not overwrite the source chosen for practice
function setAudioSyncConfig(key, value) {
    if (key === "audio" && appMode.value === "gig") {
        return;
    }
    setConfig(key, value);
}

// Config helpers (stay in Tab.vue - they use tabID)
function setConfig(key, value) {
    localStorage.setItem(`tab-${alphaTabState.tabID.value}-${key}`, JSON.stringify(value));
}

function getConfig(key, defaultValue) {
    const value = localStorage.getItem(`tab-${alphaTabState.tabID.value}-${key}`);
    if (value === null) {
        return defaultValue;
    }
    return JSON.parse(value);
}

// --- Composables ---

const { animatedCursor, applyCursorVisibility } = useCursorMode(setting);

const alphaTabState = useAlphaTab(
    setting,
    animatedCursor,
    getConfig,
    (val) => emit("setFixedHeader", val),
);

const {
    api,
    score,
    tracks,
    ready,
    tab,
    tabID,
    youtubeList,
    audioList,
    appleMusicList,
    keySignature,
    playbackRange,
    load,
    loadMetadata,
    getFileText,
    destroyContainer,
    simpleSync,
    advancedSync,
    overrideHiddenStaves,
    onScoreLoaded,
    onPlayerFinished,
    ScrollMode,
    StaveProfile,
} = alphaTabState;

const scrollMode = ref(ScrollMode.Continuous);

const { applyScrollMode } = useScrollBehavior(scrollMode, api);

const wakeLock = useWakeLock();

function closeAllList() {
    trackSelection.showTrackList.value = false;
    audioSync.showAudioList.value = false;
}

function showList(type) {
    if (type === "track") {
        trackSelection.showTrackList.value = !trackSelection.showTrackList.value;
        audioSync.showAudioList.value = false;
    } else if (type === "audio") {
        audioSync.showAudioList.value = !audioSync.showAudioList.value;
        trackSelection.showTrackList.value = false;
    }
}

const trackSelection = useTrackSelection(
    api,
    async (trackID) => {
        await loadTab(trackID);
    },
    setConfig,
    closeAllList,
);

const {
    selectedTrack,
    soloTrackID,
    muteTrackList,
    showTrackList,
    isDrum,
    hasBackingTrack,
    changeTrack,
    toggleSolo,
    toggleMute,
    toggleVolume,
} = trackSelection;

const playback = usePlaybackControl(
    api,
    ready,
    selectedTrack,
    setConfig,
    (isPlaying) => {
        // Apply scroll mode when playing starts
        if (isPlaying) {
            applyScrollMode();
            wakeLock.acquire();
        } else {
            wakeLock.release();
        }

        // Apply cursor visibility
        applyCursorVisibility(isPlaying);
    },
);

const {
    playing,
    enableCountIn,
    enableMetronome,
    isLooping,
    speed,
    playPause,
    play,
    pause,
    countIn,
    metronome,
    loop,
    playFromHighlightedRange,
    playFromFirstBarContainingNotes,
    moveToBar,
} = playback;

const audioSync = useAudioSync(
    api,
    tabID,
    tab,
    youtubeList,
    audioList,
    appleMusicList,
    simpleSync,
    advancedSync,
    pause,
    play,
    playing,
    isLooping,
    closeAllList,
    setAudioSyncConfig,
);

const {
    currentAudio,
    youtube,
    audio,
    appleMusic,
    simpleSyncSecond,
    showAudioList,
    syncMethod,
    audioYoutube,
    audioFile,
    audioAppleMusic,
    audioSynth,
    audioBackingTrack,
    saveYoutube,
    saveAudio,
    saveAppleMusic,
    setYoutubeRef,
    setAudioPlayerRef,
    getPlaybackTimeAndDuration,
    getCurrentSyncOffsetMs,
    mediaError,
    seekTo,
    seekByProgress,
} = audioSync;

useKeyboardShortcuts({
    playPause,
    moveToBar,
    playFromHighlightedRange,
    playFromFirstBarContainingNotes,
});

const { performanceMode, enter: enterPerformanceMode, exit: exitPerformanceMode } = usePerformanceMode();

// Track tick position for performance overlay progress bar
const currentTick = ref(0);
const endTick = ref(0);

let tickInterval = null;

// Scroll and duration tracking for text tabs
const durationMinutes = ref(3);
const durationSeconds = ref(0);
const songDurationMs = ref(180000);

function updateDuration() {
    setSongDuration((durationMinutes.value * 60 + durationSeconds.value) * 1000, true);
}

let durationSaveTimer = null;

// Set the scroll duration. With save = true it is kept on this device and,
// if we may edit the tab, stored with the tab so every device gets it.
function setSongDuration(ms, save = false) {
    ms = Math.max(1000, Math.round(ms));
    songDurationMs.value = ms;
    durationMinutes.value = Math.floor(ms / 60000);
    durationSeconds.value = Math.round((ms % 60000) / 1000);

    if (!save) {
        return;
    }
    setConfig("songDurationMs", ms);

    if (!canEdit.value || !tab.value?.title) {
        return;
    }
    // Capture the tab now: the timer may fire after navigating to another song
    const id = tabID.value;
    const body = JSON.stringify({
        title: tab.value.title,
        artist: tab.value.artist ?? "",
        public: !!tab.value.public,
        durationMs: ms,
    });
    tab.value.durationMs = ms;
    clearTimeout(durationSaveTimer);
    durationSaveTimer = setTimeout(async () => {
        try {
            await fetch(baseURL + `/api/tab/${id}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body,
            });
        } catch (e) {
            console.warn("Could not save song duration:", e);
        }
    }, 600);
}

let lastUserScrollTime = 0;
let lastProgrammaticY = -1;
let userScrollDebounceTimer = null;

// True when the page is still where the auto-scroll loop last put it.
// Anything else means the user moved it (swipe, wheel, keyboard, scrollbar).
function isAtProgrammaticPosition() {
    return lastProgrammaticY >= 0 && Math.abs(window.scrollY - lastProgrammaticY) <= 3;
}

function noteUserScroll() {
    lastUserScrollTime = Date.now();

    // Debounce seek while actively scrolling
    if (userScrollDebounceTimer) {
        clearTimeout(userScrollDebounceTimer);
    }
    userScrollDebounceTimer = setTimeout(() => {
        handleUserScrolled();
    }, 150);
}

const onWindowScroll = () => {
    // Scroll events caused by the auto-scroll loops land on their last target
    if (isAtProgrammaticPosition()) {
        return;
    }
    noteUserScroll();
};

function handleUserScrolled() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;

    const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);

    // Seek external media or AlphaTab synth (preserve playing state)
    seekByProgress(progress, playing.value);

    if (isTextFile(tab.value.filename) && usesTimedScroll()) {
        linearScrollOrigin = window.scrollY;
        linearScrollRemainingMs = songDurationMs.value * (1 - progress);
        linearScrollSegmentStart = performance.now();
    }

    lastProgrammaticY = window.scrollY;
    // Allow media auto-scroll to resume smoothly after 1.5 seconds
    lastUserScrollTime = Date.now() - 1500;
}

function showSeekFeedback(targetTimeMs, pageY, pageX) {
    if (typeof targetTimeMs !== "number" || isNaN(targetTimeMs)) return;
    const totalSeconds = Math.max(0, Math.floor(targetTimeMs / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = (totalSeconds % 60).toString().padStart(2, "0");

    if (seekIndicatorTimeout) {
        clearTimeout(seekIndicatorTimeout);
    }
    seekIndicator.value = {
        visible: true,
        text: `${mins}:${secs}`,
        top: pageY,
        left: pageX || Math.min(window.innerWidth - 80, Math.max(20, window.innerWidth / 2)),
    };
    seekIndicatorTimeout = setTimeout(() => {
        seekIndicator.value.visible = false;
    }, 1200);
}

function handleTabClick(event) {
    // If text was highlighted/selected, do not seek
    if (window.getSelection && window.getSelection().toString().trim().length > 0) {
        return;
    }
    // Ignore clicks on controls or interactive elements
    if (event.target.closest(".toolbar, button, a, input, select, .dropdown, .modal, .selector, .offcanvas")) {
        return;
    }

    const isText = isTextFile(tab.value.filename);
    let progress = 0;

    if (isText && chordContentRef.value) {
        const rect = chordContentRef.value.getBoundingClientRect();
        const clickY = event.clientY - rect.top;
        progress = Math.min(Math.max(clickY / Math.max(rect.height, 1), 0), 1);
    } else {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 0) {
            const docY = window.scrollY + event.clientY;
            const headerOffset = 100;
            const contentHeight = Math.max(document.documentElement.scrollHeight - headerOffset, 1);
            progress = Math.min(Math.max((docY - headerOffset) / contentHeight, 0), 1);
        }
    }

    // Always keep playing and skipping smoothly on click
    const targetTimeMs = seekByProgress(progress, true);
    playing.value = true;

    if (isText && usesTimedScroll()) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        linearScrollOrigin = maxScroll > 0 ? progress * maxScroll : 0;
        linearScrollRemainingMs = songDurationMs.value * (1 - progress);
        linearScrollSegmentStart = performance.now();
        showSeekFeedback(progress * songDurationMs.value, event.pageY, event.pageX);
        startLinearScroll(true);
    } else if (targetTimeMs !== null) {
        showSeekFeedback(targetTimeMs, event.pageY, event.pageX);
    }

    lastUserScrollTime = Date.now() - 1500;
}

let linearScrollAnimationId = null;
let linearScrollOrigin = 0;
let linearScrollRemainingMs = 0;
let linearScrollSegmentStart = 0;

function startLinearScroll(fromClick = false) {
    if (linearScrollAnimationId) cancelAnimationFrame(linearScrollAnimationId);

    if (!fromClick) {
        linearScrollOrigin = window.scrollY;

        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const currentProgress = maxScroll > 0 ? linearScrollOrigin / maxScroll : 0;
        linearScrollRemainingMs = songDurationMs.value * (1 - currentProgress);

        linearScrollSegmentStart = performance.now();
    }

    function tick() {
        if (!playing.value || !isTextFile(tab.value.filename) || !usesTimedScroll()) {
            stopLinearScroll();
            return;
        }

        // The user moved the page since our last step (the scroll event may not have fired yet)
        if (lastProgrammaticY >= 0 && !isAtProgrammaticPosition()) {
            lastProgrammaticY = -1;
            noteUserScroll();
        }

        // Skip auto-scrolling if user scrolled recently
        if (Date.now() - lastUserScrollTime < 3000) {
            // Reset segment to start from current scroll position and remaining time
            linearScrollOrigin = window.scrollY;
            const currentMax = document.documentElement.scrollHeight - window.innerHeight;
            const progress = currentMax > 0 ? linearScrollOrigin / currentMax : 0;
            linearScrollRemainingMs = songDurationMs.value * (1 - progress);
            linearScrollSegmentStart = performance.now();
        }

        const elapsed = performance.now() - linearScrollSegmentStart;
        const progress = Math.min(elapsed / Math.max(linearScrollRemainingMs, 1), 1);
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const target = linearScrollOrigin + (maxScroll - linearScrollOrigin) * progress;

        window.scrollTo({ top: target, behavior: "instant" });
        lastProgrammaticY = target;

        if (progress < 1) {
            linearScrollAnimationId = requestAnimationFrame(tick);
        } else {
            playing.value = false;
        }
    }

    linearScrollAnimationId = requestAnimationFrame(tick);
}

function stopLinearScroll() {
    if (linearScrollAnimationId) {
        cancelAnimationFrame(linearScrollAnimationId);
        linearScrollAnimationId = null;
    }
    lastProgrammaticY = -1;
}

// Media-synced scroll for text tabs: follow the YouTube/audio/Apple Music playhead.
// Sheet top = sync offset, sheet bottom = end of media.
// Uses setInterval rather than requestAnimationFrame so tracking continues
// when the page is briefly hidden (rAF freezes in hidden tabs).
let mediaScrollInterval = null;
// When we started waiting for the music source to report a playhead (0 = not waiting)
let mediaWaitingSince = 0;
const MEDIA_START_TIMEOUT_MS = 6000;

function startMediaScroll() {
    if (mediaScrollInterval) clearInterval(mediaScrollInterval);
    mediaWaitingSince = 0;

    mediaScrollInterval = setInterval(() => {
        if (!playing.value || !isTextFile(tab.value.filename) || usesTimedScroll()) {
            stopMediaScroll();
            return;
        }

        const timeAndDuration = getPlaybackTimeAndDuration();
        const mediaReady = !!timeAndDuration && timeAndDuration.duration > 0;

        if (mediaReady) {
            mediaWaitingSince = 0;

            // Remember the song length so Gig mode can scroll without the music
            const span = Math.round(timeAndDuration.duration - getCurrentSyncOffsetMs());
            if (span > 1000 && Math.abs(span - songDurationMs.value) > 1000) {
                setSongDuration(span, true);
            }
        } else if (!mediaWaitingSince) {
            mediaWaitingSince = Date.now();
        } else if (Date.now() - mediaWaitingSince > MEDIA_START_TIMEOUT_MS) {
            // The music never started: keep the sheet moving on the saved duration instead
            mediaFailed.value = true;
            stopMediaScroll();
            startLinearScroll();
            notify({
                type: "warn",
                title: "Music not available",
                text: "Scrolling on the saved song duration instead.",
            });
            return;
        }

        // The user moved the page since our last step (the scroll event may not have fired yet)
        if (lastProgrammaticY >= 0 && !isAtProgrammaticPosition()) {
            lastProgrammaticY = -1;
            noteUserScroll();
        }

        if (Date.now() - lastUserScrollTime >= 3000) {
            if (mediaReady) {
                const offsetMs = getCurrentSyncOffsetMs();
                const span = timeAndDuration.duration - offsetMs;
                const progress = span > 0 ? Math.min(Math.max((timeAndDuration.time - offsetMs) / span, 0), 1) : 0;
                const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                if (maxScroll > 0) {
                    const target = progress * maxScroll;
                    const current = window.scrollY;
                    const delta = target - current;
                    // Ease toward the playhead when far away; track it directly when close
                    // (sub-pixel lerp steps get rounded away by the browser and stall).
                    // behavior: "instant" is required — the global CSS scroll-behavior: smooth
                    // would turn each tick into an animation that the next tick cancels.
                    const next = Math.abs(delta) > 8 ? current + delta * 0.15 : target;
                    window.scrollTo({ top: next, behavior: "instant" });
                    lastProgrammaticY = next;
                }
            }
        }
    }, 50);
}

function stopMediaScroll() {
    if (mediaScrollInterval) {
        clearInterval(mediaScrollInterval);
        mediaScrollInterval = null;
    }
    lastProgrammaticY = -1;
}

watch(playing, (newVal) => {
    if (isTextFile(tab.value.filename)) {
        if (newVal) {
            if (usesTimedScroll()) {
                startLinearScroll();
            } else {
                startMediaScroll();
            }
        } else {
            stopLinearScroll();
            stopMediaScroll();
        }
    }
});

// The music source reported an error: stop waiting for it and scroll on the saved duration
watch(mediaError, (error) => {
    if (!error) {
        return;
    }
    mediaFailed.value = true;
    if (playing.value && isTextFile(tab.value.filename)) {
        stopMediaScroll();
        startLinearScroll();
    }
});

watch(currentAudio, (newVal) => {
    // A newly chosen source gets a fresh chance to start
    mediaFailed.value = false;

    if (isTextFile(tab.value.filename)) {
        if (playing.value) {
            if (usesTimedScroll()) {
                stopMediaScroll();
                startLinearScroll();
            } else {
                stopLinearScroll();
                startMediaScroll();
            }
        }
    }
});

function startTickTracking() {
    if (tickInterval) return;
    tickInterval = setInterval(() => {
        if (!api.value) return;
        currentTick.value = api.value.tickPosition ?? 0;
        const masterBars = api.value.score?.masterBars;
        if (masterBars && masterBars.length > 0) {
            const last = masterBars[masterBars.length - 1];
            endTick.value = (last.start ?? 0) + (last.calculateDuration?.() ?? 0);
        }
    }, 250);
}

function stopTickTracking() {
    if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
    }
}

// Wire up score loaded callback
onScoreLoaded((trackID) => {
    // Set Audio source
    let defaultAudio = getConfig("audio", null);
    if (appMode.value === "gig") {
        // No music at a gig: nothing to load, nothing that can fail
        defaultAudio = "none";
    } else if (!defaultAudio || (defaultAudio === "none" && isTextFile(tab.value.filename))) {
        if (youtubeList.value && youtubeList.value.length > 0) {
            defaultAudio = "youtube-" + youtubeList.value[0].videoID;
        } else if (audioList.value && audioList.value.length > 0) {
            defaultAudio = "audio-" + audioList.value[0].filename;
        } else {
            defaultAudio = "synth";
        }
    }
    currentAudio.value = defaultAudio;

    // Metronome
    enableMetronome.value = getConfig("enableMetronome", false);

    // Count in
    enableCountIn.value = getConfig("enableCountIn", false);

    // Looping
    isLooping.value = getConfig("isLooping", false);

    // Speed
    speed.value = 100;
    speed.value = getConfig("speed", 100);

    // Scroll Mode
    if (setting.value.scoreStyle === "horizontal-tab") {
        scrollMode.value = ScrollMode.Smooth;
    } else {
        scrollMode.value = setting.value.scrollMode;
    }

    selectedTrack.value = trackID;

    // Force score+tab if the current track program = 0 (probably drums)
    if (isDrum()) {
        api.value.settings.display.staveProfile = StaveProfile.ScoreTab;
        api.value.updateSettings();
    } else {
        // This will break drum score
        overrideHiddenStaves(score.value);
    }

    enableBackingTrack.value = hasBackingTrack();
});

onPlayerFinished(() => {
    if (!isLooping.value) {
        playing.value = false;
    }
});

// Socket
let socket = null;

async function initSocketIO() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    socket = connectSocketIO();

    socket.on("connect", () => {
        console.log("Connected to server");
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from server");
    });

    socket.on("play", () => {
        play();
    });

    socket.on("pause", () => {
        pause();
    });

    socket.on("seek", (time) => {
        if (!api.value) {
            return;
        }
        const diff = Math.abs(api.value.timePosition - time);
        console.log(api.value.timePosition, time, diff);
        if (diff < 100) {
            return;
        }
        api.value.timePosition = time;
    });

    socket.on("no-audio", () => {
        currentAudio.value = "none";
    });
}

function edit() {
    router.push(`/tab/${tabID.value}/edit/info`);
}

// Setlist Sidebar
const showSetlist = ref(false);

function navigateToTab(tabId) {
    router.push(`/tab/${tabId}`);
}

// Import Dialog
const showImportDialog = ref(false);
const chordSheetData = ref(null);

function handleImportTab(alphaTex) {
    showImportDialog.value = false;
    if (api.value) {
        api.value.tex(alphaTex);
    }
}

function handleImportChords(parsed) {
    showImportDialog.value = false;
    chordSheetData.value = {
        chordHtml: parsed.chordHtml,
        title: parsed.title,
        artist: parsed.artist,
    };
}

function closeChordSheet() {
    if (isTextFile(tab.value.filename)) {
        router.push("/");
    } else {
        chordSheetData.value = null;
    }
}

function resetAllState() {
    playing.value = false;
    currentAudio.value = "synth";
    enableMetronome.value = false;
    enableCountIn.value = false;
    isLooping.value = false;
    speed.value = 100;
    scrollMode.value = ScrollMode.Continuous;
    soloTrackID.value = -1;
    youtube.value = {};
    appleMusic.value = {};
    simpleSyncSecond.value = -1;
    muteTrackList.value = {};
}

function fullDestroy() {
    destroyContainer();
    resetAllState();
}

function isTextFile(filename) {
    return filename && filename.toLowerCase().endsWith(".txt");
}

function setAppMode(mode) {
    if (appMode.value === mode) {
        return;
    }
    appMode.value = mode;
    localStorage.setItem(APP_MODE_KEY, mode);
    // A full reload guarantees no music player from Practice mode is left running in Gig mode
    window.location.reload();
}

async function loadTab(trackID) {
    if (api.value) {
        fullDestroy();
    }
    mediaFailed.value = false;

    // Fetch metadata first to check file type before initializing alphaTab
    const meta = await loadMetadata(router);
    canEdit.value = !!meta?.canEdit;

    if (isTextFile(tab.value.filename)) {
        // Text file — fetch raw content and render as monospace text
        const text = await getFileText();
        chordSheetData.value = {
            chordHtml: null,
            rawText: text,
            title: tab.value.title,
            artist: tab.value.artist,
        };

        // Scroll duration: stored with the tab (shared by every device), else the value kept on this device
        setSongDuration(tab.value.durationMs || getConfig("songDurationMs", 180000));
    } else {
        chordSheetData.value = null;
    }

    // Music file or empty template for text file — initialize alphaTab
    return await load(trackID, bassTabContainer.value, router);
}

let _onDocumentClick = undefined;

onMounted(async () => {
    isLoggedIn.value = await checkIsLoggedIn();
    setting.value = getSetting();
    toolbarAutoHide.value = setting.value.toolbarAutoHide;
    tabID.value = route.params.id;

    // Set refs for audio sync
    setYoutubeRef(youtubeRef.value);
    setAudioPlayerRef(audioPlayer.value);

    const urlParams = new URLSearchParams(window.location.search);

    try {
        // Override trackID if provided in URL
        const trackParam = urlParams.get("track");
        if (trackParam) {
            const id = parseInt(trackParam);
            if (!isNaN(id)) {
                setConfig("trackID", id);
            }
        }

        // Override audio source if provided in URL
        const audioParam = urlParams.get("audio");
        if (audioParam) {
            setConfig("audio", audioParam);
        }

        const trackID = getConfig("trackID", 0);

        // Load the AlphaTab
        await loadTab(trackID);

        // Close open lists when clicking outside
        _onDocumentClick = (e) => {
            try {
                if (showTrackList.value) {
                    const sel = trackSelector.value;
                    const list = trackList.value;
                    if (!sel.contains(e.target) && !list.contains(e.target)) {
                        showTrackList.value = false;
                    }
                }

                if (showAudioList.value) {
                    const sel = audioSelector.value;
                    const list = audioListRef.value;
                    if (!sel.contains(e.target) && !list.contains(e.target)) {
                        showAudioList.value = false;
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };
        window.addEventListener("click", _onDocumentClick);
        window.addEventListener("scroll", onWindowScroll);
    } catch (e) {
        notify({
            type: "error",
            title: "Error",
            text: e.message,
        });
    }

    await initSocketIO();

    startTickTracking();

    console.log("Mounted");
});

onBeforeUnmount(() => {
    console.log("Before unmount");
    stopTickTracking();
    stopLinearScroll();
    stopMediaScroll();
    fullDestroy();

    if (userScrollDebounceTimer) {
        clearTimeout(userScrollDebounceTimer);
        userScrollDebounceTimer = null;
    }

    if (seekIndicatorTimeout) {
        clearTimeout(seekIndicatorTimeout);
        seekIndicatorTimeout = null;
    }

    window.removeEventListener("scroll", onWindowScroll);

    if (_onDocumentClick) {
        window.removeEventListener("click", _onDocumentClick);
        _onDocumentClick = undefined;
    }

    if (socket) {
        socket.disconnect();
    }
});
</script>

<template>
    <div
        class="main"
        v-show="!chordSheetData || isTextFile(tab.filename)"
        :class='{ "light": setting.scoreColor === "light", "performance-mode": performanceMode }'
        @click="handleTabClick"
    >
        <h1>{{ tab.title }}</h1>
        <h2>{{ tab.artist }}</h2>
        <div class="key-signature badge bg-secondary" v-if="keySignature && setting.showKeySignature">
            {{ keySignature }}
        </div>

        <!-- Inline Chord Sheet Content for Text Tabs -->
        <div
            v-if="isTextFile(tab.filename)"
            class="chord-content-inline"
            ref="chordContentRef"
            title="Click anywhere to sync playback to this position"
        >
            <pre v-if="chordSheetData && chordSheetData.rawText" class="chord-text-inline">{{ chordSheetData.rawText }}</pre>
            <div v-else-if="chordSheetData && chordSheetData.chordHtml" v-html="chordSheetData.chordHtml" class="chord-html-inline"></div>
        </div>

        <!-- Seek Time Feedback Indicator -->
        <transition name="fade">
            <div
                v-if="seekIndicator.visible"
                class="seek-indicator-badge"
                :style='{ top: seekIndicator.top + "px", left: seekIndicator.left + "px" }'
            >
                <font-awesome-icon :icon='["fas", "play"]' class="me-1" />
                <span>{{ seekIndicator.text }}</span>
            </div>
        </transition>

        <!-- AlphaTab Container for GP files -->
        <div v-show="!isTextFile(tab.filename)">
            <div ref="bassTabContainer" v-pre></div>
        </div>

        <!-- Just add a margin, don't let youtube player overlay the tab -->
        <div :class='{ "yt-margin": currentAudio.startsWith(`youtube-`) }'></div>

        <div class="toolbar" :class='{ "auto-hide": setting.toolbarAutoHide }' v-show="!performanceMode">
            <div class="scroll">
                <div class="track-selector selector" ref="trackSelector" v-if="!isTextFile(tab.filename)">
                    <div class="button" @click='showList("track")'>
                        <span v-if="tracks.length > 0">{{ tracks[selectedTrack].name }}</span>
                        <span v-else>Loading...</span>
                    </div>
                </div>

                <div class="btn-group mode-switch" role="group" aria-label="Mode">
                    <button
                        class="btn"
                        :class='appMode === "gig" ? "btn-primary" : "btn-secondary"'
                        :aria-pressed='appMode === "gig"'
                        title="No music: scrolls on the saved song duration"
                        @click='setAppMode("gig")'
                    >
                        Gig
                    </button>
                    <button
                        class="btn"
                        :class='appMode === "practice" ? "btn-primary" : "btn-secondary"'
                        :aria-pressed='appMode === "practice"'
                        title="Play along with YouTube or audio"
                        @click='setAppMode("practice")'
                    >
                        Practice
                    </button>
                </div>

                <div class="audio-selector selector" ref="audioSelector" v-show='appMode === "practice"'>
                    <div class="button" @click='showList("audio")'>
                        Audio
                    </div>
                </div>

                <PlaybackControls
                    :playing="playing"
                    :isLooping="isLooping"
                    :enableCountIn="enableCountIn"
                    :enableMetronome="enableMetronome"
                    v-model:speed="speed"
                    :playbackRange="playbackRange"
                    :currentAudio="currentAudio"
                    @play-pause="playPause"
                    @play-from-highlighted="playFromHighlightedRange()"
                    @toggle-loop="loop()"
                    @toggle-count-in="countIn()"
                    @toggle-metronome="metronome()"
                />

                <div
                    class="duration-group ms-2 me-2 d-flex align-items-center"
                    v-if='isTextFile(tab.filename) && (appMode === "gig" || mediaFailed || currentAudio === "none" || currentAudio === "synth")'
                >
                    <span class="duration-label text-white me-2" style="white-space: nowrap">Duration:</span>
                    <input
                        type="number"
                        class="form-control duration-input"
                        v-model.number="durationMinutes"
                        min="0"
                        max="60"
                        @change="updateDuration"
                        style="width: 50px; background-color: #32393e; border: 1px solid #555b60; color: white; text-align: center; height: 35px"
                    />
                    <span class="text-white ms-1 me-2">m</span>
                    <input
                        type="number"
                        class="form-control duration-input"
                        v-model.number="durationSeconds"
                        min="0"
                        max="59"
                        @change="updateDuration"
                        style="width: 50px; background-color: #32393e; border: 1px solid #555b60; color: white; text-align: center; height: 35px"
                    />
                    <span class="text-white ms-1">s</span>
                </div>

                <button class="btn btn-secondary" @click="showImportDialog = true">Import</button>

                <button class="btn btn-secondary" @click="enterPerformanceMode()">Performance</button>

                <button class="btn btn-secondary" @click="showSetlist = !showSetlist">Setlist</button>

                <div class="btn-edit" v-if="canEdit">
                    <button class="btn btn-secondary" @click="edit()">
                        Edit
                    </button>
                </div>
            </div>

            <div class="track-list list" v-if="showTrackList" ref="trackList">
                <div class="p-2 text-end list-header">
                    <font-awesome-icon :icon='["fas", "xmark"]' class="me-2 close" @click="showTrackList = false" />
                </div>

                <div class="track item" v-for="track in tracks" :key="track.id" :class="{ active: selectedTrack === track.id }">
                    <div class="name" @click="changeTrack(track.id)">{{ track.name }}</div>
                    <div class="list-button solo" @click="toggleSolo(track.id)" :class="{ active: soloTrackID === track.id }">Solo</div>
                    <div class="list-button mute" @click="toggleMute(track.id)" :class="{ active: muteTrackList[track.id] }">Mute</div>
                    <div class="list-button select-percentage">
                        Volume: <input type="number" min="0" max="1000" step="1" value="100" @change="toggleVolume(track.id, $event.target.value)" /> (%)
                    </div>
                </div>
            </div>

            <div class="audio-list list" v-if="showAudioList" ref="audioListRef">
                <div class="p-2 text-end list-header">
                    <font-awesome-icon :icon='["fas", "xmark"]' class="me-2 close" @click="showAudioList = false" />
                </div>

                <div class="audio item" @click="audioSynth" :class='{ active: currentAudio === "synth" }'>
                    <div class="name">Synth</div>
                </div>

                <div class="audio item" @click="audioBackingTrack(hasBackingTrack)" :class='{ active: currentAudio === "backingTrack" }' v-if="enableBackingTrack">
                    <div class="name">Embedded Backing Track</div>
                </div>

                <div class="audio item" @click="audioYoutube(youtube.videoID)" v-for="youtube in youtubeList" :key="youtube.id" :class='{ active: currentAudio === "youtube-" + youtube.videoID }'>
                    <div class="name">Youtube: {{ youtube.videoID }}</div>
                </div>

                <div class="audio item" @click="audioFile(audio.filename)" v-for="audio in audioList" :key="audio.filename" :class='{ active: currentAudio === "audio-" + audio.filename }'>
                    <div class="name">{{ audio.filename }}</div>
                </div>

                <div class="audio item" @click="audioAppleMusic(am.trackID)" v-for="am in appleMusicList" :key="am.trackID" :class='{ active: currentAudio === "applemusic-" + am.trackID }'>
                    <div class="name">Apple Music: {{ am.trackID }}</div>
                </div>

                <!-- No Audio -->
                <div
                    class="audio item"
                    @click='currentAudio = "none";
                    closeAllList()'
                    :class='{ active: currentAudio === "none" }'
                >
                    <div class="name">No Audio (Mute)</div>
                </div>

                <div class="ms-4 me-4 mt-3 mb-3" v-if="canEdit">
                    <router-link :to="`/tab/${tab.id}/edit/audio`">Add Youtube or Audio File...</router-link>
                </div>
            </div>

            <!-- USE v-show, because youtube player is not vue  -->
            <div v-show='currentAudio.startsWith("youtube-") || currentAudio.startsWith("audio-") || currentAudio.startsWith("applemusic-")' class="player-container">
                <!-- Music source problem -->
                <div class="media-error ps-3 pe-3 p-2" v-if="mediaError" role="alert">
                    <div>{{ mediaError.message }}</div>
                    <div class="small">Scrolling on the saved song duration instead. (YouTube error {{ mediaError.code }})</div>
                    <router-link v-if="canEdit" :to="`/tab/${tab.id}/edit/audio`">Choose another video</router-link>
                </div>

                <!-- Simple sync edit -->
                <div class="sync-offset ps-3 pe-3 p-2" v-if='syncMethod === "simple" && canEdit && !mediaError'>
                    Sync Offset: <input type="number" class="form-control" min="-100000" max="100000" step="0.1" v-model="simpleSyncSecond" /> s
                </div>

                <!-- Youtube Player -->
                <div v-show='currentAudio.startsWith("youtube-")'>
                    <div ref="youtubeRef" class="player"></div>
                </div>

                <!-- Audio Player -->
                <audio ref="audioPlayer" class="player" controls v-show='currentAudio.startsWith("audio-")' hidden></audio>
            </div>
        </div>
    </div>

    <PerformanceOverlay
        v-if="performanceMode"
        :is-playing="playing"
        :current-tick="currentTick"
        :end-tick="endTick"
        @toggle-play="playPause()"
        @exit="exitPerformanceMode()"
    />

    <ImportDialog
        v-if="showImportDialog"
        @import-tab="handleImportTab"
        @import-chords="handleImportChords"
        @close="showImportDialog = false"
    />

    <ChordSheet
        v-if="chordSheetData && !isTextFile(tab.filename)"
        :chord-html="chordSheetData.chordHtml"
        :raw-text="chordSheetData.rawText"
        :title="chordSheetData.title"
        :artist="chordSheetData.artist"
        @close="closeChordSheet"
    />

    <SetlistSidebar
        v-if="showSetlist"
        :current-tab-id="String(alphaTabState.tabID.value)"
        :current-tab-title="tab.title"
        :current-tab-artist="tab.artist"
        @navigate-to-tab="navigateToTab"
        @close="showSetlist = false"
    />
</template>

<style scoped lang="scss">
@import "../styles/vars.scss";

$toolbar-height: 60px;
$youtube-height: 200px;

// Light Score

.main {
    width: 95%;
    color: #d6d6d6;
    margin: 0 auto $toolbar-height auto;

    &.light {
        background-color: #f1f1f1;
        padding-top: 30px;

        h1, h2 {
            color: #333;
        }
    }

    &.performance-mode {
        width: 100%;
        margin: 0;
        height: 100dvh;
        overflow: hidden;
    }
}

.yt-margin {
    width: 1px;
    height: $youtube-height !important;
}

.toolbar {
    backdrop-filter: blur(10px);
    border-bottom: 1px solid #3c3b40;
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    z-index: 1000;

    .light & {
        background-color: rgba(33, 37, 41, 0.8);
    }

    &.auto-hide {
        transition: transform 0.3s;
        transform: translateY(calc(100% - 5px));

        &:hover {
            transform: translateY(0);
        }
    }

    // Allow horizontal scroll
    .scroll {
        padding: 8px 15px;
        display: flex;
        align-items: center;
        flex-grow: 4;
        column-gap: 10px;

        .btn-edit {
            flex-grow: 1;
            text-align: right;
        }

        .button, .btn {
            height: 44px;
            white-space: nowrap;
        }

        .btn-secondary {
            &.active {
                //background-color: lighten($primary, 10%);
            }
        }

        .close {
            cursor: pointer;
            &:hover {
                color: white;
            }
        }
    }

    .media-error {
        max-width: 320px;
        white-space: normal;
        color: #fff;
        background-color: #7a3b12;
        font-size: 14px;

        a {
            color: #ffd9a8;
            text-decoration: underline;
        }
    }

    .player-container {
        position: absolute;
        bottom: 100%;
        right: 0;
        display: flex;

        // align bottom
        align-items: flex-end;

        white-space: nowrap;

        .player {
            height: 180px;
        }

        .sync-offset {
            color: white;
            display: flex;
            align-items: center;
            background-color: $dark1;

            input {
                margin: 0 5px;
                background-color: #32393e;
                border: 1px solid #555b60;
                color: white;
            }
        }
    }
}

.youtube {
    margin-top: 20px;
}

h1 {
    text-align: center;
    font-size: 45px;
    font-weight: 300;
    line-height: 45px;
    word-break: break-word;
}

h2 {
    text-align: center;
    margin-bottom: 0;
}

$color: #32393e;
$padding: 20px;

.selector {
    .button {
        cursor: pointer;
        padding: 10px 15px;
        border-radius: 3px;
        background-color: $color;
        user-select: none;
        transition: background-color 0.2s;
        white-space: nowrap;

        &:hover {
            background-color: lighten($color, 10%);
        }
    }
}

.list {
    position: absolute;
    background-color: $color;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 3px;
    bottom: $toolbar-height;
    left: 15px;
    min-width: 400px;
    overflow: scroll;
    max-height: calc(100vh - 90px);

    z-index: 1001;

    .list-header {
        position: sticky;
        top: 0;
        background-color: $color;
        border-bottom: 1px solid darken($color, 5%);
    }

    .item {
        cursor: pointer;
        display: flex;
        align-items: center;
        border-bottom: 1px solid darken($color, 5%);

        &.active {
            background-color: lighten($color, 8%);
        }

        .name {
            flex-grow: 1;
            font-weight: bold;
            padding: $padding;
            height: 100%;
            border-right: 1px solid darken($color, 5%);

            &:hover {
                background-color: lighten($color, 2%);
            }
        }
    }
}

.track-list {
    .track {
        .list-button {
            background-color: lighten($color, 10%);
            border-right: 1px solid darken($color, 5%);
            padding: $padding;
            height: 100%;

            &:hover {
                background-color: lighten($primary, 5%);
            }

            &.active {
                background-color: lighten($primary, 8%);
            }
        }
    }
}

.audio-selector {
    position: relative;
}

.track-selector {
    position: relative;
}

.select-percentage {
    display: flex;
    align-items: center;
    gap: 4px;

    input {
        min-width: 90px;
        border: 0;
    }
}

.mobile {
    h1 {
        font-size: 20px;
    }

    h2 {
        font-size: 16px;
    }

    .list {
        width: 100%;
        left: 0;
    }

    .toolbar {
        .scroll {
            overflow-x: scroll;
        }

        .player-container {
            .sync-offset {
                display: none;
            }
        }
    }

    .speed {
        input {
            width: 100px;
        }
    }
}

.key-signature {
    position: absolute;
    margin-left: 30px;
}

.chord-content-inline {
    padding: 20px 16px;
    font-family: "Courier New", Courier, monospace;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre;
    overflow-x: auto;
    color: #e0e0e0;
    max-width: 1000px;
    margin: 20px auto;
    cursor: pointer;
    user-select: text;
    position: relative;
    border-radius: 8px;
    transition: background-color 0.2s ease;

    &:hover {
        background-color: rgba(255, 255, 255, 0.02);
    }

    // Light theme overrides
    .light & {
        color: #333;

        &:hover {
            background-color: rgba(0, 0, 0, 0.02);
        }

        :deep(.lyrics) {
            color: #333;
        }
    }

    :deep(.chord) {
        color: #5a9fd9;
        font-weight: bold;
    }

    :deep(.lyrics) {
        color: #e0e0e0;
    }

    :deep(.row) {
        display: flex;
        flex-wrap: wrap;
    }

    :deep(.column) {
        display: inline-flex;
        flex-direction: column;
    }
}

.seek-indicator-badge {
    position: absolute;
    transform: translate(-50%, -100%);
    margin-top: -10px;
    background: rgba(15, 23, 42, 0.92);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    backdrop-filter: blur(8px);
    padding: 4px 14px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 700;
    pointer-events: none;
    z-index: 1050;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translate(-50%, -70%);
}

// Responsive breakpoints
@media (min-width: 768px) {
    .chord-content-inline {
        padding: 24px 32px;
        font-size: 16px;
        line-height: 1.8;
    }
}

@media (min-width: 1024px) {
    .chord-content-inline {
        padding: 32px 48px;
        font-size: 18px;
    }
}
</style>
