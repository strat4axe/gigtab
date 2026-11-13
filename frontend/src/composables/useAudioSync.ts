import { computed, type Ref, ref, watch } from "vue";
import { ActionBuffer, baseURL, checkFetch, generalError } from "../app.js";
import { notify } from "@kyvg/vue3-notification";
import { getMusicKitInstance } from "../services/apple-music.ts";

const alphaTab = await import("@coderline/alphatab");

const syncOffsetYoutubeActionBuffer = new ActionBuffer(200);
const syncOffsetAudioActionBuffer = new ActionBuffer(200);
const syncOffsetAppleMusicActionBuffer = new ActionBuffer(200);

export function useAudioSync(
    api: Ref<any>,
    tabID: Ref<number | string>,
    tab: Ref<Record<string, any>>,
    youtubeList: Ref<any[]>,
    audioList: Ref<any[]>,
    appleMusicList: Ref<any[]>,
    simpleSync: (offset: number) => void,
    advancedSync: (syncPointsText: string) => void,
    pause: () => void,
    play: () => void,
    playing: Ref<boolean>,
    isLooping: Ref<boolean>,
    closeAllList: () => void,
    setConfig: (key: string, value: any) => void,
) {
    const currentAudio = ref("synth");
    // Set when the selected music source reports that it cannot play (null = no problem)
    const mediaError = ref<{ code: number | string; message: string } | null>(null);
    const youtube = ref<Record<string, any>>({});
    const audio = ref<Record<string, any>>({});
    const appleMusic = ref<Record<string, any>>({});
    const simpleSyncSecond = ref(-1);
    const showAudioList = ref(false);

    let audioHandler: any = null;
    let alphaTabYoutubeHandler: any = null;
    let alphaTabAppleMusicHandler: any = null;
    let youtubePlayer: any = null;
    let lastSeekTime = 0;

    function isTextTab(): boolean {
        const filename = tab.value?.filename;
        return !!(filename && filename.toLowerCase().endsWith(".txt"));
    }

    const syncMethod = computed(() => {
        if (currentAudio.value.startsWith("youtube-")) {
            return youtube.value.syncMethod;
        } else if (currentAudio.value.startsWith("audio-")) {
            return audio.value.syncMethod;
        } else if (currentAudio.value.startsWith("applemusic-")) {
            return appleMusic.value.syncMethod;
        } else {
            return undefined;
        }
    });

    watch(simpleSyncSecond, (newVal, oldVal) => {
        if (!api.value) {
            return;
        }

        let obj: any;

        if (currentAudio.value.startsWith("youtube-")) {
            if (!youtube.value) {
                return;
            }
            obj = youtube.value;
        } else if (currentAudio.value.startsWith("audio-")) {
            if (!audio.value) {
                return;
            }
            obj = audio.value;
        } else if (currentAudio.value.startsWith("applemusic-")) {
            if (!appleMusic.value) {
                return;
            }
            obj = appleMusic.value;
        }

        pause();

        obj.simpleSync = simpleSyncSecond.value * 1000;

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
        api.value.updateSettings();

        simpleSync(obj.simpleSync);

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledExternalMedia;
        api.value.updateSettings();

        if (currentAudio.value.startsWith("youtube-")) {
            api.value.player.output.handler = alphaTabYoutubeHandler;
            syncOffsetYoutubeActionBuffer.run(() => {
                if (oldVal !== -1) {
                    saveYoutube();
                }
            });
        } else if (currentAudio.value.startsWith("applemusic-")) {
            api.value.player.output.handler = alphaTabAppleMusicHandler;
            syncOffsetAppleMusicActionBuffer.run(() => {
                if (oldVal !== -1) {
                    saveAppleMusic();
                }
            });
        } else {
            api.value.player.output.handler = audioHandler;
            syncOffsetAudioActionBuffer.run(() => {
                if (oldVal !== -1) {
                    saveAudio();
                }
            });
        }
    });

    watch(() => youtube.value.simpleSync, () => {
        if (!api.value || !youtube.value) {
            return;
        }
        simpleSyncSecond.value = parseFloat((youtube.value.simpleSync / 1000).toFixed(2));
    });

    watch(() => audio.value.simpleSync, () => {
        if (!api.value || !audio.value) {
            return;
        }
        simpleSyncSecond.value = parseFloat((audio.value.simpleSync / 1000).toFixed(2));
    });

    watch(() => appleMusic.value.simpleSync, () => {
        if (!api.value || !appleMusic.value) {
            return;
        }
        simpleSyncSecond.value = parseFloat((appleMusic.value.simpleSync / 1000).toFixed(2));
    });

    // Switch Audio Source
    watch(currentAudio, async () => {
        console.log("Switching audio to:", currentAudio.value);
        mediaError.value = null;

        if (!api.value) {
            return;
        }

        api.value.player.masterVolume = 1;

        if (currentAudio.value === "synth") {
            await initSynth();
        } else if (currentAudio.value === "backingTrack") {
            api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledBackingTrack;
            api.value.updateSettings();
            pause();
        } else if (currentAudio.value.startsWith("youtube-")) {
            const videoID = currentAudio.value.substring(8);
            await initYoutube(videoID);
        } else if (currentAudio.value.startsWith("audio-")) {
            const filename = currentAudio.value.substring(6);
            await initAudio(filename);
        } else if (currentAudio.value.startsWith("applemusic-")) {
            const trackID = currentAudio.value.substring(11);
            await initAppleMusic(trackID);
        } else if (currentAudio.value === "none") {
            api.value.player.masterVolume = 0;
            pause();
        } else {
            await initSynth();
            notify({
                type: "error",
                title: "Error",
                text: "Unknown audio source, fallback to synth.",
            });
            return;
        }

        setConfig("audio", currentAudio.value);
    });

    async function initSynth() {
        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
        api.value.updateSettings();
        pause();
    }

    async function initAudio(filename: string) {
        if (!api.value) {
            return;
        }

        closeAllList();

        // audioPlayerRef is set once via setAudioPlayerRef
        const audioPlayer = _audioPlayerRef;
        if (!audioPlayer) {
            return;
        }

        // Init the audio handler if not exists
        if (!audioHandler) {
            audioHandler = {
                get backingTrackDuration() {
                    const duration = audioPlayer.duration;
                    return Number.isFinite(duration) ? duration * 1000 : 0;
                },
                get playbackRate() {
                    return audioPlayer.playbackRate;
                },
                set playbackRate(value: number) {
                    audioPlayer.playbackRate = value;
                },
                get masterVolume() {
                    return audioPlayer.volume;
                },
                set masterVolume(value: number) {
                    audioPlayer.volume = value;
                },
                seekTo(time: number) {
                    audioPlayer.currentTime = time / 1000;
                },
                play() {
                    audioPlayer.play();
                },
                pause() {
                    if (isTextTab()) {
                        return;
                    }
                    audioPlayer.pause();
                },
            };

            let updateTimer = 0;
            const onTimeUpdate = () => {
                if (!isTextTab()) {
                    api.value?.player?.output?.updatePosition(
                        audioPlayer.currentTime * 1000,
                    );
                }
            };

            audioPlayer.addEventListener("timeupdate", onTimeUpdate);
            audioPlayer.addEventListener("seeked", onTimeUpdate);
            audioPlayer.addEventListener("play", () => {
                window.clearInterval(updateTimer);
                playing.value = true;
                if (!isTextTab()) {
                    api.value?.play();
                }
                updateTimer = window.setInterval(onTimeUpdate, 50);
            });

            audioPlayer.addEventListener("pause", () => {
                if (audioPlayer.ended) {
                    return;
                }

                if (Date.now() - lastSeekTime < 2500) {
                    console.log("Ignoring transient audio pause during seek");
                    return;
                }

                console.log("[audioPlayer] paused");
                playing.value = false;
                if (!isTextTab()) {
                    api.value?.pause();
                }
                window.clearInterval(updateTimer);
            });
            audioPlayer.addEventListener("ended", () => {
                console.log("[audioPlayer] ended");

                if (isLooping.value) {
                    audioPlayer.currentTime = 0;
                    audioPlayer.play();
                } else {
                    playing.value = false;
                    api.value?.pause();
                    window.clearInterval(updateTimer);
                }
            });
            audioPlayer.addEventListener("volumechange", () => {
                api.value.masterVolume = audioPlayer.volume;
            });
            audioPlayer.addEventListener("ratechange", () => {
                api.value.playbackSpeed = audioPlayer.playbackRate;
            });
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
        api.value.updateSettings();

        let found = false;

        for (const a of audioList.value) {
            if (a.filename === filename) {
                audio.value = a;
                if (a.syncMethod === "advanced") {
                    advancedSync(a.advancedSync);
                } else {
                    simpleSync(a.simpleSync);
                }
                found = true;
                break;
            }
        }

        if (!found) {
            notify({
                type: "error",
                title: "Error",
                text: "Audio file not found, fallback to synth.",
            });
            currentAudio.value = "synth";
            return;
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledExternalMedia;
        api.value.updateSettings();

        api.value.player.output.handler = audioHandler;

        const path = baseURL + `/api/tab/${tabID.value}/audio/${encodeURIComponent(filename)}`;

        audioPlayer.src = path;
        audioPlayer.load();
        audioPlayer.playbackRate = api.value.playbackSpeed;

        pause();
    }

    async function initYoutube(videoID: string) {
        closeAllList();

        if (!youtubePlayer) {
            await initYoutubePlayer();
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
        api.value.updateSettings();

        let found = false;

        for (const yt of youtubeList.value) {
            if (yt.videoID === videoID) {
                youtube.value = yt;
                if (yt.syncMethod === "advanced") {
                    advancedSync(yt.advancedSync);
                } else {
                    simpleSync(yt.simpleSync);
                }
                found = true;
                break;
            }
        }

        if (!found) {
            notify({
                type: "error",
                title: "Error",
                text: "YouTube video not found, fallback to synth.",
            });
            currentAudio.value = "synth";
            return;
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledExternalMedia;
        api.value.updateSettings();

        api.value.player.output.handler = alphaTabYoutubeHandler;
        youtubePlayer.cueVideoById(videoID);
        youtubePlayer.setPlaybackRate(api.value.playbackSpeed);
        pause();
    }

    let _youtubeRef: HTMLElement | null = null;
    let _audioPlayerRef: HTMLAudioElement | null = null;

    function setYoutubeRef(el: HTMLElement) {
        _youtubeRef = el;
    }

    function setAudioPlayerRef(el: HTMLAudioElement) {
        _audioPlayerRef = el;
    }

    // https://developers.google.com/youtube/iframe_api_reference#onError
    function describeYoutubeError(code: unknown): string {
        switch (code) {
            case 2:
                return "The YouTube link for this song is not valid.";
            case 5:
                return "YouTube could not play this video in the embedded player.";
            case 100:
                return "This YouTube video was removed or is private.";
            case 101:
            case 150:
                return "YouTube does not allow this video to play inside other sites. Choose a different video for this song.";
            case 153:
                return "YouTube rejected the embedded player on this address. Open GigTab at http://localhost instead of an IP address.";
            default:
                return "YouTube could not play this video.";
        }
    }

    async function initYoutubePlayer() {
        const ytWarning = setTimeout(() => {
            notify({
                type: "warning",
                title: "Warning",
                text: "If YouTube is taking too long to load, please refresh the page.",
            });
        }, 5000);

        if (_youtubeRef) {
            _youtubeRef.innerHTML = "";
        }

        const isScriptLoaded = typeof (window as any).YT !== "undefined";
        console.log("isScriptLoaded:", isScriptLoaded);

        const playerElement = document.createElement("div");
        if (_youtubeRef) {
            _youtubeRef.appendChild(playerElement);
        }

        if (!isScriptLoaded) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/player_api";
            const firstScriptTag = document.getElementsByTagName("script")[0];
            firstScriptTag.parentNode!.insertBefore(tag, firstScriptTag);
            console.log("Loading YouTube API");

            const youtubeApiReady = Promise.withResolvers<void>();
            (window as any).onYouTubePlayerAPIReady = youtubeApiReady.resolve;
            await youtubeApiReady.promise;
            console.log("YouTube API ready");
        } else {
            console.log("YouTube API already loaded");
        }

        const YT = (window as any).YT;
        const youtubePlayerReady = Promise.withResolvers<void>();
        let currentTimeInterval = 0;
        const player = new YT.Player(playerElement, {
            height: "180",
            width: "320",
            playerVars: { "autoplay": 0 },
            events: {
                "onReady": () => {
                    youtubePlayerReady.resolve();
                },

                "onStateChange": (e: any) => {
                    switch (e.data) {
                        case YT.PlayerState.PLAYING:
                            window.clearInterval(currentTimeInterval);
                            currentTimeInterval = window.setInterval(() => {
                                if (!isTextTab()) {
                                    api.value?.player?.output?.updatePosition(player.getCurrentTime() * 1000);
                                }
                            }, 50);
                            playing.value = true;
                            if (!isTextTab()) {
                                api.value?.play();
                            }
                            break;
                        case YT.PlayerState.ENDED:
                            window.clearInterval(currentTimeInterval);
                            playing.value = false;
                            if (!isTextTab()) {
                                api.value?.stop();
                            }
                            break;
                        case YT.PlayerState.PAUSED:
                            if (Date.now() - lastSeekTime < 2500) {
                                console.log("Ignoring transient YouTube PAUSED state during seek");
                                break;
                            }
                            window.clearInterval(currentTimeInterval);
                            playing.value = false;
                            if (!isTextTab()) {
                                api.value?.pause();
                            }
                            break;
                        default:
                            break;
                    }
                },
                "onPlaybackRateChange": (e: any) => {
                    api.value.playbackSpeed = e.data;
                },
                "onError": (e: any) => {
                    console.warn("YouTube player error:", e?.data);
                    mediaError.value = {
                        code: e?.data ?? "unknown",
                        message: describeYoutubeError(e?.data),
                    };
                    window.clearInterval(currentTimeInterval);
                    youtubePlayerReady.reject(e);
                },
            },
        });

        await youtubePlayerReady.promise;
        console.log("YouTube Player ready");

        let initialSeek = -1;
        alphaTabYoutubeHandler = {
            get backingTrackDuration() {
                return player.getDuration() * 1000;
            },
            get playbackRate() {
                console.log("Get playback rate:", player.getPlaybackRate());
                return player.getPlaybackRate();
            },
            set playbackRate(value: number) {
                console.log("Set playback rate:", value);
                player.setPlaybackRate(value);
            },
            get masterVolume() {
                return player.getVolume() / 100;
            },
            set masterVolume(value: number) {
                player.setVolume(value * 100);
            },
            seekTo(time: number) {
                if (
                    player.getPlayerState() !== YT.PlayerState.PAUSED &&
                    player.getPlayerState() !== YT.PlayerState.PLAYING
                ) {
                    initialSeek = time / 1000;
                } else {
                    player.seekTo(time / 1000);
                }
            },
            play() {
                player.playVideo();
                if (initialSeek >= 0) {
                    player.seekTo(initialSeek);
                    initialSeek = -1;
                }
            },
            pause() {
                if (isTextTab()) {
                    return;
                }
                player.pauseVideo();
            },
        };

        youtubePlayer = player;
        clearTimeout(ytWarning);
    }

    function audioYoutube(videoID: string) {
        currentAudio.value = "youtube-" + videoID;
        closeAllList();
    }

    function audioFile(filename: string) {
        currentAudio.value = "audio-" + filename;
        closeAllList();
    }

    function audioSynth() {
        currentAudio.value = "synth";
        closeAllList();
    }

    function audioBackingTrack(hasBackingTrack: () => boolean) {
        if (!hasBackingTrack()) {
            notify({
                type: "error",
                title: "Error",
                text: "No backing track found in this tab.",
            });
            return;
        }
        currentAudio.value = "backingTrack";
        closeAllList();
    }

    async function saveYoutube() {
        let res;
        try {
            res = await fetch(baseURL + `/api/tab/${tabID.value}/youtube/${youtube.value.videoID}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    syncMethod: youtube.value.syncMethod,
                    simpleSync: youtube.value.simpleSync,
                    advancedSync: youtube.value.advancedSync,
                }),
            });

            await checkFetch(res);
        } catch (e) {
            generalError(e);
        }
    }

    async function saveAudio() {
        let res;
        try {
            res = await fetch(baseURL + `/api/tab/${tabID.value}/audio/${audio.value.filename}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    syncMethod: audio.value.syncMethod,
                    simpleSync: audio.value.simpleSync,
                    advancedSync: audio.value.advancedSync,
                }),
            });

            await checkFetch(res);
        } catch (e) {
            generalError(e);
        }
    }

    async function initAppleMusic(trackID: string) {
        closeAllList();

        let music;
        try {
            music = await getMusicKitInstance();
        } catch (err: any) {
            notify({
                type: "error",
                title: "Apple Music Error",
                text: err.message || "Failed to initialize Apple Music.",
            });
            currentAudio.value = "synth";
            return;
        }

        if (!music.isAuthorized) {
            notify({
                type: "warning",
                title: "Authorization Required",
                text: "Please sign in to Apple Music first in the Settings page.",
            });
            currentAudio.value = "synth";
            return;
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
        api.value.updateSettings();

        let found = false;
        for (const am of appleMusicList.value) {
            if (am.trackID === trackID) {
                appleMusic.value = am;
                if (am.syncMethod === "advanced") {
                    advancedSync(am.advancedSync);
                } else {
                    simpleSync(am.simpleSync);
                }
                found = true;
                break;
            }
        }

        if (!found) {
            notify({
                type: "error",
                title: "Error",
                text: "Linked Apple Music track not found in config, fallback to synth.",
            });
            currentAudio.value = "synth";
            return;
        }

        api.value.settings.player.playerMode = alphaTab.PlayerMode.EnabledExternalMedia;
        api.value.updateSettings();

        if (!alphaTabAppleMusicHandler) {
            let currentTimeInterval = 0;
            const onPlaybackStateChange = () => {
                const state = music.player.state;
                if (state === 3 || state === "playing") { // Playing
                    playing.value = true;
                    if (!isTextTab()) {
                        api.value?.play();
                    }
                    window.clearInterval(currentTimeInterval);
                    currentTimeInterval = window.setInterval(() => {
                        if (!isTextTab()) {
                            api.value?.player?.output?.updatePosition(music.player.currentPlaybackTime * 1000);
                        }
                    }, 50);
                } else if (state === 2 || state === "paused") { // Paused
                    if (Date.now() - lastSeekTime < 2500) {
                        return;
                    }
                    playing.value = false;
                    if (!isTextTab()) {
                        api.value?.pause();
                    }
                    window.clearInterval(currentTimeInterval);
                } else if (state === 5 || state === "completed") { // Completed
                    playing.value = false;
                    if (!isTextTab()) {
                        api.value?.stop();
                    }
                    window.clearInterval(currentTimeInterval);
                }
            };

            music.player.addEventListener("playbackStateDidChange", onPlaybackStateChange);

            alphaTabAppleMusicHandler = {
                get backingTrackDuration() {
                    return music.player.currentPlaybackDuration * 1000;
                },
                get playbackRate() {
                    return music.player.playbackRate || 1;
                },
                set playbackRate(value: number) {
                    music.player.playbackRate = value;
                },
                get masterVolume() {
                    return music.player.volume;
                },
                set masterVolume(value: number) {
                    music.player.volume = value;
                },
                seekTo(time: number) {
                    music.seekTo(time / 1000);
                },
                play() {
                    music.play();
                },
                pause() {
                    if (isTextTab()) {
                        return;
                    }
                    music.pause();
                },
            };
        }

        api.value.player.output.handler = alphaTabAppleMusicHandler;

        await music.setQueue({ song: trackID });
        pause();
    }

    function audioAppleMusic(trackID: string) {
        currentAudio.value = "applemusic-" + trackID;
        closeAllList();
    }

    async function saveAppleMusic() {
        let res;
        try {
            res = await fetch(baseURL + `/api/tab/${tabID.value}/applemusic/${appleMusic.value.trackID}`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    syncMethod: appleMusic.value.syncMethod,
                    simpleSync: appleMusic.value.simpleSync,
                    advancedSync: appleMusic.value.advancedSync,
                }),
            });

            await checkFetch(res);
        } catch (e) {
            generalError(e);
        }
    }

    function getPlaybackTimeAndDuration() {
        if (currentAudio.value.startsWith("youtube-") && youtubePlayer) {
            try {
                return {
                    time: youtubePlayer.getCurrentTime() * 1000,
                    duration: youtubePlayer.getDuration() * 1000,
                };
            } catch (e) {
                // Player might not be ready
            }
        } else if (currentAudio.value.startsWith("audio-") && _audioPlayerRef) {
            return {
                time: _audioPlayerRef.currentTime * 1000,
                duration: _audioPlayerRef.duration * 1000,
            };
        } else if (currentAudio.value.startsWith("applemusic-")) {
            try {
                const music = (window as any).MusicKit?.getInstance();
                if (music) {
                    return {
                        time: music.player.currentPlaybackTime * 1000,
                        duration: music.player.currentPlaybackDuration * 1000,
                    };
                }
            } catch (e) {}
        }
        return null;
    }

    function seekTo(timeMs: number, keepPlaying = true) {
        lastSeekTime = Date.now();

        if (currentAudio.value.startsWith("youtube-")) {
            if (youtubePlayer && typeof youtubePlayer.seekTo === "function") {
                youtubePlayer.seekTo(timeMs / 1000, true);
                if (keepPlaying || playing.value) {
                    youtubePlayer.playVideo();
                    playing.value = true;
                }
            }
        } else if (currentAudio.value.startsWith("audio-")) {
            if (_audioPlayerRef) {
                _audioPlayerRef.currentTime = timeMs / 1000;
                if (keepPlaying || playing.value) {
                    _audioPlayerRef.play().catch(() => {});
                    playing.value = true;
                }
            }
        } else if (currentAudio.value.startsWith("applemusic-")) {
            try {
                const music = (window as any).MusicKit?.getInstance();
                if (music) {
                    music.seekTo(timeMs / 1000);
                    if (keepPlaying || playing.value) {
                        music.play().catch(() => {});
                        playing.value = true;
                    }
                }
            } catch (e) {}
        } else if (currentAudio.value === "synth" || currentAudio.value === "backingTrack") {
            if (api.value) {
                api.value.timePosition = timeMs;
                if (keepPlaying || playing.value) {
                    api.value.play();
                    playing.value = true;
                }
            }
        }
    }

    function getCurrentSyncOffsetMs(): number {
        if (currentAudio.value.startsWith("youtube-")) {
            return youtube.value?.simpleSync ?? 0;
        } else if (currentAudio.value.startsWith("audio-")) {
            return audio.value?.simpleSync ?? 0;
        } else if (currentAudio.value.startsWith("applemusic-")) {
            return appleMusic.value?.simpleSync ?? 0;
        }
        return 0;
    }

    function seekByProgress(progress: number, keepPlaying = true): number | null {
        const clampedProgress = Math.max(0, Math.min(progress, 1));
        const timeAndDuration = getPlaybackTimeAndDuration();

        if (timeAndDuration && timeAndDuration.duration > 0) {
            const offsetMs = getCurrentSyncOffsetMs();
            const span = Math.max(timeAndDuration.duration - offsetMs, 0);
            const targetTimeMs = Math.max(0, Math.min(offsetMs + clampedProgress * span, timeAndDuration.duration));
            seekTo(targetTimeMs, keepPlaying);
            return targetTimeMs;
        } else if (api.value?.score?.masterBars?.length > 0) {
            const masterBars = api.value.score.masterBars;
            const last = masterBars[masterBars.length - 1];
            const endTick = (last.start ?? 0) + (last.calculateDuration?.() ?? 0);
            if (endTick > 0) {
                const targetTick = Math.round(clampedProgress * endTick);
                api.value.tickPosition = targetTick;
                if (keepPlaying || playing.value) {
                    api.value.play();
                    playing.value = true;
                }
                return api.value.timePosition ?? null;
            }
        }
        return null;
    }

    return {
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
        initSynth,
        getPlaybackTimeAndDuration,
        getCurrentSyncOffsetMs,
        mediaError,
        seekTo,
        seekByProgress,
    };
}
