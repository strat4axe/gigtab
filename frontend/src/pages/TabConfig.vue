<script>
import { defineComponent } from "vue";
import { baseURL, checkFetch, convertAlphaTexSyncPoint, generalError } from "../app.js";
import { notify } from "@kyvg/vue3-notification";
import Vue3Dropzone from "@jaxtheprime/vue3-dropzone";
import { supportedAudioFormatCommaString, supportedFormatCommaString } from "../../../backend/common.js";
import SyncOptions from "../components/SyncOptions.vue";
import { FontAwesomeIcon } from "../icon.ts";
import { getMusicKitInstance } from "../services/apple-music.ts";

const alphaTab = await import("@coderline/alphatab");

export default defineComponent({
    components: { SyncOptions, Vue3Dropzone, FontAwesomeIcon },
    data() {
        return {
            tabID: -1,
            tab: {},
            page: "",
            youtubeURL: "",
            youtubeList: [],
            audioList: [],
            appleMusicList: [],
            appleMusicTrackID: "",
            appleMusicSearchQuery: "",
            appleMusicSearchResults: [],
            isSearchingAppleMusic: false,
            // isLocalIP: false,
            supportedFormatCommaString,
            supportedAudioFormatCommaString,
            filePath: "",
            tabFiles: [],
            audioFiles: [],
            isLoading: true,
            isUploading: false,
            showOpenButtons: false,
        };
    },
    async mounted() {
        this.tabID = this.$route.params.id;
        this.page = this.$route.path.split("/").pop();

        try {
            await this.load();
        } catch (e) {
            generalError(e);
        }

        //this.isLocalIP = !!isPrivateIP(window.location.hostname);
    },
    methods: {
        async load() {
            this.isLoading = true;
            try {
                const res = await fetch(baseURL + `/api/tab/${this.tabID}`, {
                    credentials: "include",
                });
                await checkFetch(res);
                const data = await res.json();
                this.tab = data.tab;
                this.youtubeList = data.youtubeList;
                this.audioList = data.audioList;
                this.appleMusicList = data.appleMusicList || [];
                this.filePath = data.filePath;
                this.showOpenButtons = data.showOpenButtons;
            } finally {
                this.isLoading = false;
            }
        },

        async submitInfo() {
            try {
                const tabID = this.$route.params.id;
                const res = await fetch(baseURL + `/api/tab/${tabID}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        title: this.tab.title,
                        artist: this.tab.artist,
                        public: this.tab.public,
                    }),
                });

                await checkFetch(res);

                notify({
                    text: "Tab info updated successfully",
                    type: "success",
                });
            } catch (e) {
                generalError(e);
            }
        },
        async addYoutube() {
            try {
                // Validate URL
                const url = this.youtubeURL;

                const obj = new URL(url);

                if (obj.hostname !== "www.youtube.com" && obj.hostname !== "music.youtube.com") {
                    throw new Error("Invalid YouTube URL");
                }

                // Get ?v
                const videoID = obj.searchParams.get("v");
                if (!videoID) {
                    throw new Error("Invalid YouTube URL, no ?v= params?");
                }

                // Send to api (/tab/:id/youtube)
                const tabID = this.tab.id;

                const res = await fetch(baseURL + `/api/tab/${tabID}/youtube`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        videoID,
                    }),
                });

                await checkFetch(res);
                this.youtubeURL = "";

                await this.load();
            } catch (e) {
                generalError(e);
            }
        },

        async saveYoutube(video) {
            let res;
            try {
                const tabID = this.tab.id;
                res = await fetch(baseURL + `/api/tab/${tabID}/youtube/${video.videoID}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        syncMethod: video.syncMethod,
                        simpleSync: video.simpleSync,
                        advancedSync: video.advancedSync,
                    }),
                });

                await checkFetch(res);

                notify({
                    text: "YouTube video updated successfully",
                    type: "success",
                });
            } catch (e) {
                generalError(e);
            }
        },

        async removeYoutube(video) {
            try {
                if (!confirm("Are you sure you want to remove this YouTube video?")) {
                    return;
                }

                const tabID = this.tab.id;

                const res = await fetch(baseURL + `/api/tab/${tabID}/youtube/${video.videoID}`, {
                    method: "DELETE",
                    credentials: "include",
                });

                await checkFetch(res);

                notify({
                    text: "YouTube video removed successfully",
                    type: "success",
                });

                await this.load();
            } catch (e) {
                generalError(e);
            }
        },

        async uploadTab() {
            this.isUploading = true;
            try {
                if (this.tabFiles.length === 0) {
                    throw new Error("Please select a file to upload");
                }

                const file = this.tabFiles[0].file;

                // Try to parse the file with AlphaTab to ensure it's valid
                const data = await file.arrayBuffer();

                const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
                    new Uint8Array(data),
                    new alphaTab.Settings(),
                );

                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch(baseURL + `/api/tab/${this.tabID}/replace`, {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                });

                await checkFetch(response);
                notify({
                    text: "Tab file uploaded and replaced successfully",
                    type: "success",
                });
                this.$router.push(`/tab/${this.tabID}`);
            } catch (error) {
                notify({
                    text: error.message,
                    type: "error",
                });
            } finally {
                this.isUploading = false;
            }
        },

        async uploadAudio() {
            this.isUploading = true;
            try {
                if (this.audioFiles.length === 0) {
                    throw new Error("Please select a file to upload");
                }

                const file = this.audioFiles[0].file;
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch(baseURL + `/api/tab/${this.tabID}/audio`, {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                });

                await checkFetch(response);
                notify({
                    text: "Upload audio successfully",
                    type: "success",
                });
                this.$refs.audioDropzone.clearFiles();
                await this.load();
            } catch (error) {
                notify({
                    text: error.message,
                    type: "error",
                });
            } finally {
                this.isUploading = false;
            }
        },

        async saveAudio(audio) {
            let res;
            try {
                const tabID = this.tab.id;
                const encoded = encodeURIComponent(audio.filename);
                res = await fetch(baseURL + `/api/tab/${tabID}/audio/${encoded}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        syncMethod: audio.syncMethod,
                        simpleSync: audio.simpleSync,
                        advancedSync: audio.advancedSync,
                    }),
                });

                await checkFetch(res);

                notify({
                    text: "Updated successfully",
                    type: "success",
                });
            } catch (e) {
                generalError(e);
            }
        },

        async removeAudio(audio) {
            try {
                if (!confirm("Are you sure you want to remove this audio file?")) {
                    return;
                }

                const tabID = this.tab.id;
                const encoded = encodeURIComponent(audio.filename);

                const res = await fetch(baseURL + `/api/tab/${tabID}/audio/${encoded}`, {
                    method: "DELETE",
                    credentials: "include",
                });

                await checkFetch(res);

                notify({
                    text: "The audio file has been removed successfully",
                    type: "success",
                });

                await this.load();
            } catch (e) {
                generalError(e);
            }
        },

        dropzoneError(err) {
            console.log(err);
            let error = err.type;
            notify({
                text: error,
                type: "error",
            });
        },

        getAudioURL(tabID, filename) {
            return baseURL + `/api/tab/${tabID}/audio/${encodeURIComponent(filename)}`;
        },

        async openFolder() {
            try {
                const res = await fetch(baseURL + `/api/tab/${this.tabID}/open-folder`, {
                    method: "POST",
                    credentials: "include",
                });
                await checkFetch(res);
                notify({ text: "Opened folder in file manager", type: "success" });
            } catch (e) {
                notify({ text: e.message || e, type: "error" });
            }
        },

        async openExternal() {
            try {
                const res = await fetch(baseURL + `/api/tab/${this.tabID}/open-external`, {
                    method: "POST",
                    credentials: "include",
                });
                await checkFetch(res);
                notify({ text: "Opened with external application", type: "success" });
            } catch (e) {
                notify({ text: e.message || e, type: "error" });
            }
        },

        async searchAppleMusic() {
            if (!this.appleMusicSearchQuery.trim()) {
                return;
            }
            this.isSearchingAppleMusic = true;
            this.appleMusicSearchResults = [];
            try {
                const music = await getMusicKitInstance();
                const response = await music.api.search(this.appleMusicSearchQuery, {
                    types: "songs",
                    limit: 10,
                });
                this.appleMusicSearchResults = response.songs?.data || [];
                if (this.appleMusicSearchResults.length === 0) {
                    notify({
                        text: "No tracks found matching query",
                        type: "info",
                    });
                }
            } catch (e) {
                notify({
                    text: e.message || "Failed to search Apple Music catalog",
                    type: "error",
                });
            } finally {
                this.isSearchingAppleMusic = false;
            }
        },

        async addAppleMusicTrack(trackID) {
            try {
                const tabID = this.tab.id;
                const res = await fetch(baseURL + `/api/tab/${tabID}/applemusic`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        trackID,
                    }),
                });

                await checkFetch(res);
                notify({
                    text: "Apple Music track added successfully",
                    type: "success",
                });
                this.appleMusicTrackID = "";
                await this.load();
            } catch (e) {
                generalError(e);
            }
        },

        async saveAppleMusic(am) {
            let res;
            try {
                const tabID = this.tab.id;
                res = await fetch(baseURL + `/api/tab/${tabID}/applemusic/${am.trackID}`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        syncMethod: am.syncMethod,
                        simpleSync: am.simpleSync,
                        advancedSync: am.advancedSync,
                    }),
                });

                await checkFetch(res);

                notify({
                    text: "Apple Music track updated successfully",
                    type: "success",
                });
            } catch (e) {
                generalError(e);
            }
        },

        async removeAppleMusic(am) {
            try {
                if (!confirm("Are you sure you want to remove this Apple Music track?")) {
                    return;
                }

                const tabID = this.tab.id;

                const res = await fetch(baseURL + `/api/tab/${tabID}/applemusic/${am.trackID}`, {
                    method: "DELETE",
                    credentials: "include",
                });

                await checkFetch(res);

                notify({
                    text: "Apple Music track removed successfully",
                    type: "success",
                });

                await this.load();
            } catch (e) {
                generalError(e);
            }
        },
    },
});
</script>

<template>
    <div class="my-container container" v-if="!isLoading">
        <div class="mt-4 mb-4">
            <router-link :to="`/tab/${tab.id}`" class="btn btn-primary">
                <font-awesome-icon :icon='["fas", "arrow-left"]' />
                Back to Tab
            </router-link>

            <button class="btn btn-secondary ms-2" @click.prevent="openFolder" v-if="showOpenButtons">
                <font-awesome-icon :icon='["fas", "folder"]' />
                Open Folder
            </button>

            <button class="btn btn-secondary ms-2" @click.prevent="openExternal" v-if="showOpenButtons">
                <font-awesome-icon :icon='["fas", "file"]' />
                Edit with External Tool...
            </button>

            <div class="mt-3">
                Editing: {{ tab.artist }} - {{ tab.title }}
            </div>
        </div>

        <div class="menu">
            <div class="btn-group" role="group">
                <router-link :to="`/tab/${tab.id}/edit/info`" class="btn btn-secondary">Info</router-link>
                <router-link :to="`/tab/${tab.id}/edit/audio`" class="btn btn-secondary">Youtube & Audio files</router-link>
                <router-link :to="`/tab/${tab.id}/edit/apple-music`" class="btn btn-secondary">Apple Music</router-link>
                <router-link :to="`/tab/${tab.id}/edit/tab-file`" class="btn btn-secondary">Tab file</router-link>
            </div>
        </div>

        <!-- Info Page -->
        <div v-if='this.page === "info"'>
            <h2 class="mt-4 mb-4">Info</h2>
            <form>
                <!-- Tab Name -->
                <div class="mb-3">
                    <label for="tabName" class="form-label">Name</label>
                    <input type="text" class="form-control" id="tabName" v-model="tab.title">
                </div>

                <!-- Artist -->
                <div class="mb-3">
                    <label for="tabArtist" class="form-label">Artist</label>
                    <input type="text" class="form-control" id="tabArtist" v-model="tab.artist">
                </div>

                <!-- Share with band (Dropdown) -->
                <div class="mb-3">
                    <label for="tabPublic" class="form-label">Sharing</label>
                    <select class="form-control" id="tabPublic" v-model="tab.public">
                        <option :value="false">Private (only me)</option>
                        <option :value="true">Shared with band</option>
                    </select>
                </div>

                <!-- Save -->
                <button type="submit" class="btn btn-primary me-2" @click.prevent="submitInfo()">Save</button>
            </form>
        </div>

        <!-- Audio Page -->
        <div v-else-if='this.page === "audio"'>
            <h3 class="mt-4 mb-2">Youtube</h3>

            <!-- Show alert if using a local ip -->
            <div class="alert alert-info mt-3" role="alert">
                Tip: Youtube videos may not work on a private ip (such as 127.0.0.1). Please use <strong>localhost</strong> or other hostname.
            </div>

            <div class="mb-3">
                <label for="basic-url" class="form-label">Youtube URL</label>
                <div class="input-group">
                    <input type="text" class="form-control" id="basic-url" placeholder="" v-model="youtubeURL">
                    <button class="btn btn-primary" type="button" @click.prevent="addYoutube()">Add</button>
                </div>
            </div>

            <div class="mb-4">
                <!-- Youtube Item -->
                <div v-for="video in youtubeList" :key="video.id" class="mb-3 pb-5 youtube-item">
                    <iframe
                        width="355"
                        height="200"
                        :src="`https://www.youtube.com/embed/${video.videoID}`"
                        title="YouTube video player"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>

                    <div class="info">
                        <div class="mb-3">
                            <strong>Video ID:</strong> <a :href="`https://www.youtube.com/watch?v=${video.videoID}`" target="_blank">{{ video.videoID }}</a>
                        </div>

                        <SyncOptions
                            :syncMethod="video.syncMethod"
                            :simpleSync="video.simpleSync"
                            :advancedSync="video.advancedSync"
                            @update:syncMethod="video.syncMethod = $event"
                            @update:simpleSync="video.simpleSync = $event"
                            @update:advancedSync="video.advancedSync = $event"
                        />

                        <button class="btn btn-primary" @click.prevent="saveYoutube(video)">Save</button>
                    </div>

                    <div class="buttons">
                        <div class="btn-group">
                            <button class="btn btn-danger" @click="removeYoutube(video)">Remove</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-5">
                <h3 class="mb-5">Audio files</h3>

                <div class="mb-5">
                    <div v-for="audio in audioList" class="audio-item mb-3 pb-3" :key="audio.id">
                        <div>
                            <div class="mb-2">
                                <audio :src="getAudioURL(tabID, audio.filename)" controls></audio>
                            </div>

                            <a :href="getAudioURL(tabID, audio.filename)" target="_blank">{{ audio.filename }}</a>
                        </div>
                        <div class="info">
                            <SyncOptions
                                :syncMethod="audio.syncMethod"
                                :simpleSync="audio.simpleSync"
                                :advancedSync="audio.advancedSync"
                                @update:syncMethod="audio.syncMethod = $event"
                                @update:simpleSync="audio.simpleSync = $event"
                                @update:advancedSync="audio.advancedSync = $event"
                            />
                            <button class="btn btn-primary" @click.prevent="saveAudio(audio)">Save</button>
                        </div>
                        <div class="buttons">
                            <div class="btn-group">
                                <button class="btn btn-danger" @click="removeAudio(audio)">Remove</button>
                            </div>
                        </div>
                    </div>
                </div>

                <Vue3Dropzone
                    ref="audioDropzone"
                    v-model="audioFiles"
                    :maxFileSize="100"
                    @error="dropzoneError"
                >
                    <template #placeholder-img>&nbsp;
                    </template>
                    <template #title>
                        Drop your audio file here
                    </template>
                    <template #description>
                        Formats: mp3, ogg, flac (flac will be converted to ogg)
                    </template>
                </Vue3Dropzone>

                <button
                    @click="uploadAudio"
                    class="btn btn-primary w-100 mt-4"
                    :disabled="isUploading"
                >
                    {{ isUploading ? "Uploading..." : "Upload" }}
                </button>
            </div>
        </div>

        <!-- Apple Music Page -->
        <div v-else-if='this.page === "apple-music"'>
            <h2 class="mt-4 mb-4">Apple Music Integration</h2>

            <!-- Manual track ID linking -->
            <div class="mb-4">
                <h4>Link Apple Music Track ID</h4>
                <div class="input-group">
                    <input type="text" class="form-control" placeholder="Enter Apple Music Song Catalog ID (e.g., 1440854431)" v-model="appleMusicTrackID">
                    <button class="btn btn-primary" type="button" @click.prevent="addAppleMusicTrack(appleMusicTrackID)">Link Track</button>
                </div>
            </div>

            <!-- Apple Music Search/Catalog query -->
            <div class="mb-4">
                <h4>Search Apple Music Catalog</h4>
                <div class="input-group mb-3">
                    <input type="text" class="form-control" placeholder="Search title, artist, or album..." v-model="appleMusicSearchQuery" @keyup.enter="searchAppleMusic">
                    <button class="btn btn-primary" type="button" @click.prevent="searchAppleMusic" :disabled="isSearchingAppleMusic">
                        {{ isSearchingAppleMusic ? "Searching..." : "Search" }}
                    </button>
                </div>

                <!-- Search Results -->
                <div v-if="appleMusicSearchResults.length > 0" class="search-results card bg-dark border-secondary p-3 mb-4">
                    <h5 class="mb-3 text-white">Results</h5>
                    <div class="list-group">
                        <div
                            v-for="track in appleMusicSearchResults"
                            :key="track.id"
                            class="list-group-item bg-dark text-white border-secondary d-flex align-items-center justify-content-between gap-3 p-3"
                        >
                            <div class="d-flex align-items-center gap-3">
                                <img
                                    v-if="track.attributes?.artwork"
                                    :src='track.attributes.artwork.url.replace("{w}", "60").replace("{h}", "60")'
                                    alt="Artwork"
                                    width="60"
                                    height="60"
                                    class="rounded"
                                >
                                <div>
                                    <div class="fw-bold">{{ track.attributes?.name }}</div>
                                    <div class="text-secondary small">{{ track.attributes?.artistName }} — {{ track.attributes?.albumName }}</div>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-primary" @click.prevent="addAppleMusicTrack(track.id)">Link this Track</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Linked Apple Music Tracks List -->
            <div class="mb-5">
                <h3>Linked Apple Music Tracks</h3>
                <div v-if="appleMusicList.length === 0" class="text-secondary">
                    No Apple Music tracks currently linked to this tab.
                </div>
                <div v-else>
                    <div v-for="am in appleMusicList" :key="am.trackID" class="apple-music-item mb-3 pb-3">
                        <div class="track-details mb-2">
                            <strong>Track ID:</strong> <a :href="`https://music.apple.com/us/song/${am.trackID}`" target="_blank">{{ am.trackID }}</a>
                        </div>
                        <div class="info">
                            <SyncOptions
                                :syncMethod="am.syncMethod"
                                :simpleSync="am.simpleSync"
                                :advancedSync="am.advancedSync"
                                @update:syncMethod="am.syncMethod = $event"
                                @update:simpleSync="am.simpleSync = $event"
                                @update:advancedSync="am.advancedSync = $event"
                            />
                            <button class="btn btn-primary" @click.prevent="saveAppleMusic(am)">Save</button>
                        </div>
                        <div class="buttons">
                            <button class="btn btn-danger" @click.prevent="removeAppleMusic(am)">Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tab File Page -->
        <div v-else-if='this.page === "tab-file"' class="mb-5">
            <h2 class="mt-4 mb-4">Method 1: Direct Edit</h2>
            <p>
                If you can access the file system, you can edit/replace the tab directly, the path is:<br />
                <strong>{{ filePath }}</strong>
            </p>

            <h2 class="mt-4 mb-4">Method 2: Upload and replace the tab file</h2>

            <Vue3Dropzone
                v-model="tabFiles"
                :maxFileSize="500"
                @error="dropzoneError"
            >
                <template #title>
                    Drop your tab here
                </template>
                <template #description>Supports {{ supportedFormatCommaString }}</template>
            </Vue3Dropzone>

            <button
                @click="uploadTab"
                class="btn btn-primary w-100 mt-4"
                :disabled="isUploading"
            >
                {{ isUploading ? "Uploading..." : "Upload" }}
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
.menu {
    display: flex;
    gap: 10px;

    a {
        //text-decoration: underline;
    }
}

.youtube-item, .audio-item, .apple-music-item {
    display: flex;
    gap: 15px;
    align-items: flex-start;
    border-bottom: 1px solid #333;
    .info {
        flex-grow: 1;
    }
    .buttons {
        align-self: center;
    }
}
</style>
