<script lang="ts">
import { defineComponent } from "vue";
import { SettingSchema } from "../zod.ts";
import { baseURL, checkFetch, generalError, getSetting, successMessage } from "../app.js";
import { ScrollMode } from "@coderline/alphatab";
import { authorize, isAuthorized, unauthorize } from "../services/apple-music.ts";

export default defineComponent({
    computed: {
        ScrollMode() {
            return ScrollMode;
        },
    },
    data() {
        return {
            setting: {
                scoreColor: "",
                noteColor: "",
                cursor: "",
                scoreStyle: "",
                groupByArtist: false,
                showKeySignature: false,
                scrollMode: "",
                scale: 1,
                toolbarAutoHide: false,
            },
            isProcessing: false,
            isAppleMusicConnected: false,
            isAdmin: false,
            invites: [] as any[],
            users: [] as any[],
        };
    },
    mounted() {
        this.setting = getSetting();
        this.checkAppleMusicAuth();
        this.loadBandInfo();
    },
    methods: {
        /**
         * Load the setting from the server
         */
        async loadFromServer() {
            const ok = window.confirm("This will overwrite your local settings. Are you sure?");
            if (!ok) {
                return;
            }

            try {
                this.isProcessing = true;
                const res = await fetch(baseURL + `/api/settings`, {
                    credentials: "include",
                });
                await checkFetch(res);
                const data = await res.json();
                const serverSetting = data.setting || {};
                const parsed = SettingSchema.parse(serverSetting);
                this.setting = parsed;
                localStorage.setItem("userSetting", JSON.stringify(parsed));
                successMessage("Settings loaded from server");
            } catch (e) {
                generalError(e);
            } finally {
                this.isProcessing = false;
            }
        },

        /**
         * Save the current setting to the server.
         */
        async saveToServer() {
            const ok = window.confirm("This will overwrite the settings stored on the server. Are you sure?");
            if (!ok) {
                return;
            }

            try {
                this.isProcessing = true;
                const parsedSetting = SettingSchema.parse(this.setting);
                const res = await fetch(baseURL + `/api/settings`, {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(parsedSetting),
                });
                await checkFetch(res);
                successMessage("Settings saved to server");
            } catch (e) {
                generalError(e);
            } finally {
                this.isProcessing = false;
            }
        },

        /**
         * Reset local/client settings to default values
         */
        async resetToDefault() {
            const ok = window.confirm("Are you sure you want to reset your local settings? This will not affect the settings stored on the server.");
            if (!ok) {
                return;
            }

            try {
                const defaults = SettingSchema.parse({});
                this.setting = defaults;
                localStorage.setItem("userSetting", JSON.stringify(defaults));
                successMessage("Reset to default settings successfully");
            } catch (e) {
                generalError(e);
            }
        },

        async loadBandInfo() {
            try {
                const meRes = await fetch(baseURL + "/api/me", { credentials: "include" });
                const me = await meRes.json();
                this.isAdmin = !!me.isAdmin;

                if (this.isAdmin) {
                    await this.loadInvites();
                }

                const usersRes = await fetch(baseURL + "/api/users", { credentials: "include" });
                const usersData = await usersRes.json();
                this.users = usersData.users || [];
            } catch {
                // Not logged in or older server; hide the band section
                this.isAdmin = false;
            }
        },

        async loadInvites() {
            const res = await fetch(baseURL + "/api/invites", { credentials: "include" });
            const data = await res.json();
            this.invites = data.invites || [];
        },

        async createInvite() {
            try {
                this.isProcessing = true;
                const res = await fetch(baseURL + "/api/invites", {
                    method: "POST",
                    credentials: "include",
                });
                await checkFetch(res);
                const data = await res.json();
                await this.loadInvites();
                await this.copyInvite(data.invite.token);
            } catch (e) {
                generalError(e);
            } finally {
                this.isProcessing = false;
            }
        },

        async copyInvite(token: string) {
            const link = `${location.origin}/register?invite=${token}`;
            try {
                await navigator.clipboard.writeText(link);
                successMessage("Invite link copied to clipboard");
            } catch {
                window.prompt("Copy this invite link:", link);
            }
        },

        async revokeInvite(token: string) {
            if (!window.confirm("Revoke this invite link?")) {
                return;
            }
            try {
                const res = await fetch(baseURL + `/api/invites/${encodeURIComponent(token)}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                await checkFetch(res);
                await this.loadInvites();
            } catch (e) {
                generalError(e);
            }
        },

        inviteStatus(invite: any): string {
            if (invite.usedBy) {
                const user = this.users.find((u: any) => u.id === invite.usedBy);
                return `Used by ${user ? user.name : "a member"}`;
            }
            if (new Date(invite.expiresAt).getTime() < Date.now()) {
                return "Expired";
            }
            return "Active";
        },

        async checkAppleMusicAuth() {
            this.isAppleMusicConnected = await isAuthorized();
        },
        async connectAppleMusic() {
            try {
                this.isProcessing = true;
                const connected = await authorize();
                this.isAppleMusicConnected = connected;
                if (connected) {
                    successMessage("Connected to Apple Music successfully!");
                } else {
                    generalError(new Error("Apple Music authorization failed."));
                }
            } catch (e) {
                generalError(e);
            } finally {
                this.isProcessing = false;
            }
        },
        async disconnectAppleMusic() {
            try {
                this.isProcessing = true;
                await unauthorize();
                this.isAppleMusicConnected = false;
                successMessage("Disconnected from Apple Music successfully!");
            } catch (e) {
                generalError(e);
            } finally {
                this.isProcessing = false;
            }
        },
    },
    watch: {
        setting: {
            handler(newSetting) {
                const parsedSetting = SettingSchema.parse(newSetting);
                localStorage.setItem("userSetting", JSON.stringify(parsedSetting));
            },
            deep: true,
        },
    },
});
</script>

<template>
    <div class="container my-container">
        <h1 class="mb-3">Settings</h1>

        <h2 class="mt-4 mb-4">Tab Player</h2>

        <!--     scoreStyle: z.enum(["tab", "score-tab", "score"]).default("tab"), -->
        <div class="mb-3">
            <label for="scoreStyle" class="form-label">Style</label>
            <select id="scoreStyle" class="form-select" v-model="setting.scoreStyle">
                <option value="tab">Tab</option>
                <option value="score">Score</option>
                <option value="score-tab">Tab + Score</option>
                <option value="horizontal-tab">Horizontal Tab</option>
            </select>
        </div>

        <!-- Score Color Dropdown -->
        <div class="mb-3">
            <label for="scoreColor" class="form-label">Tab/Score Color</label>
            <select id="scoreColor" class="form-select" v-model="setting.scoreColor">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
            </select>
        </div>

        <!-- Tab/Score Display Scale -->
        <div class="mb-3">
            <label for="scale" class="form-label">Tab/Score Display Scale</label>
            <select id="scale" class="form-select" v-model.number="setting.scale">
                <option :value="0.8">80%</option>
                <option :value="1">100%</option>
                <option :value="1.1">110%</option>
                <option :value="1.2">120%</option>
                <option :value="1.3">130%</option>
                <option :value="1.4">140%</option>
                <option :value="1.5">150%</option>
                <option :value="2">200%</option>
                <option :value="3">300%</option>
            </select>
        </div>

        <!-- Scroll Mode -->
        <div class="mb-3">
            <label for="scrollMode" class="form-label">
                Scroll
                <span v-if='setting.scoreStyle === "horizontal-tab"'> (Force Smooth Scroll for Horizontal Tab)</span>
            </label>
            <select id="scrollMode" class="form-select" v-model="setting.scrollMode" :disabled='setting.scoreStyle === "horizontal-tab"'>
                <option :value="ScrollMode.Continuous">Scroll</option>
                <option :value="ScrollMode.Off">Off</option>
                <option :value="ScrollMode.Smooth">Smooth Scroll</option>
            </select>
        </div>

        <!-- Show Key Signature -->
        <div class="mb-3">
            <label for="showKeySignature" class="form-label">Show Key Signature</label>
            <select id="showKeySignature" class="form-select" v-model="setting.showKeySignature">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
            </select>
        </div>

        <!-- Toolbar Auto-hide -->
        <div class="mb-3">
            <label for="toolbarAutoHide" class="form-label">Auto-hide bottom toolbar</label>
            <select id="toolbarAutoHide" class="form-select" v-model="setting.toolbarAutoHide">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
            </select>
        </div>

        <h2 class="mt-5 mb-4">Assists</h2>

        <!-- Note Color refer to SettingSchema   noteColor: z.enum(["rocksmith", "none"]).default("none"), -->
        <div class="mb-3">
            <label for="noteColor" class="form-label">Note Color</label>
            <select id="noteColor" class="form-select" v-model="setting.noteColor">
                <option value="none">No Color</option>
                <option value="rocksmith">Rocksmith 2014 Color Scheme</option>
                <option value="louis-bass-v">Louis' 5-string Bass Color Scheme</option>
            </select>
        </div>

        <!--     cursor: z.enum(["animated", "instant", "bar", "invisible"]).default("animated"),-->
        <div class="mb-3">
            <label for="cursor" class="form-label">Cursor Style</label>
            <select id="cursor" class="form-select" v-model="setting.cursor">
                <option value="invisible">No Cursor</option>
                <option value="animated">Cursor (Smooth)</option>
                <option value="instant">Cursor (Instant)</option>
                <option value="bar">Bar</option>
            </select>
        </div>

        <p class="text-secondary">Tips: If you want to check if the sync points is correct, "Cursor (Instant)" is a good indicator.</p>

        <h2 class="mt-5 mb-4">Tab List</h2>

        <!-- Group by artist -->
        <div class="mb-3">
            <label for="groupByArtist" class="form-label">Group tabs by Artist</label>
            <select id="groupByArtist" class="form-select" v-model="setting.groupByArtist">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
            </select>
        </div>

        <h2 class="mt-5 mb-4">Apple Music</h2>
        <div class="mb-3">
            <label class="form-label d-block">Connection Status</label>
            <div class="d-flex align-items-center gap-3">
                <span class="badge" :class='isAppleMusicConnected ? "bg-success" : "bg-secondary"'>
                    {{ isAppleMusicConnected ? "Connected" : "Disconnected" }}
                </span>
                <button v-if="!isAppleMusicConnected" class="btn btn-primary" :disabled="isProcessing" @click.prevent="connectAppleMusic">
                    Connect Apple Music
                </button>
                <button v-else class="btn btn-danger" :disabled="isProcessing" @click.prevent="disconnectAppleMusic">
                    Disconnect
                </button>
            </div>
        </div>

        <template v-if="isAdmin">
            <h2 class="mt-5 mb-4">Band Members</h2>

            <div class="mb-3" v-if="users.length > 0">
                <label class="form-label">Members</label>
                <ul class="list-group">
                    <li class="list-group-item" v-for="(user, index) in users" :key="user.id">
                        {{ user.name }}
                        <span class="badge bg-secondary ms-2" v-if="index === 0">Admin</span>
                    </li>
                </ul>
            </div>

            <div class="mb-3">
                <label class="form-label">Invite Links</label>
                <p class="text-secondary">Create an invite link and send it to a band member. Each link can be used once and expires after 7 days.</p>

                <button class="btn btn-primary mb-3" :disabled="isProcessing" @click.prevent="createInvite">
                    Create Invite Link
                </button>

                <ul class="list-group" v-if="invites.length > 0">
                    <li class="list-group-item d-flex align-items-center gap-2" v-for="invite in invites" :key="invite.token">
                        <span class="badge" :class='inviteStatus(invite) === "Active" ? "bg-success" : "bg-secondary"'>
                            {{ inviteStatus(invite) }}
                        </span>
                        <span class="flex-grow-1 text-truncate font-monospace">{{ invite.token }}</span>
                        <button class="btn btn-sm btn-secondary" v-if='inviteStatus(invite) === "Active"' @click.prevent="copyInvite(invite.token)">
                            Copy Link
                        </button>
                        <button class="btn btn-sm btn-danger" v-if="!invite.usedBy" @click.prevent="revokeInvite(invite.token)">
                            Revoke
                        </button>
                    </li>
                </ul>
            </div>
        </template>

        <h2 class="mt-5 mb-4">Others</h2>

        <div class="mb-3">
            <label class="form-label">Load/Save Settings to Server</label>

            <div class="d-flex gap-2">
                <button class="btn btn-secondary" :disabled="isProcessing" @click.prevent="loadFromServer">Load from Server</button>
                <button class="btn btn-secondary" :disabled="isProcessing" @click.prevent="saveToServer">Save to Server</button>
                <button class="btn btn-danger" :disabled="isProcessing" @click.prevent="resetToDefault">Reset Local</button>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
</style>
