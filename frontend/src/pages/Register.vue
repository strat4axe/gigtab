<script>
import { defineComponent } from "vue";
import { authClient } from "../auth-client.ts";
import { notify } from "@kyvg/vue3-notification";
import { baseURL } from "../app.js";
import Logo from "../components/Logo.vue";

export default defineComponent({
    components: { Logo },
    data() {
        return {
            processing: false,
            email: "",
            name: "",
            password: "",
            repeatPassword: "",
            inviteToken: "",
            inviteError: "",
            ready: false,
        };
    },
    computed: {
        isInviteMode() {
            return !!this.inviteToken;
        },
    },
    async mounted() {
        this.inviteToken = this.$route.query.invite || "";

        const res = await fetch(baseURL + "/api/is-finish-setup");
        const isFinishSetup = await res.json();

        if (isFinishSetup && !this.inviteToken) {
            this.$router.push("/");
            return;
        }

        // Validate the invite before showing the form
        if (this.inviteToken) {
            const inviteRes = await fetch(baseURL + `/api/invite-info/${encodeURIComponent(this.inviteToken)}`);
            const inviteData = await inviteRes.json();
            if (!inviteData.ok) {
                this.inviteError = inviteData.msg || "Invalid invite link";
            }
        }

        this.ready = true;
    },
    methods: {
        async submit() {
            if (this.password !== this.repeatPassword) {
                notify({
                    title: "Passwords do not match",
                    type: "error",
                });
                return;
            }

            this.processing = true;

            try {
                if (this.isInviteMode) {
                    // Invited band member: register via the invite-aware endpoint, then sign in
                    const res = await fetch(baseURL + "/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: this.email,
                            name: this.name.trim(),
                            password: this.password,
                            inviteToken: this.inviteToken,
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || "Registration failed");
                    }

                    const { error } = await authClient.signIn.email({
                        email: this.email,
                        password: this.password,
                    });
                    if (error) {
                        throw new Error(error.message);
                    }
                } else {
                    // First user = admin
                    const { error } = await authClient.signUp.email({
                        email: this.email,
                        name: "Admin",
                        password: this.password,
                    });
                    if (error) {
                        throw new Error(error.message);
                    }
                }

                this.$router.push("/");
            } catch (e) {
                notify({
                    title: e.message,
                    type: "error",
                });
            } finally {
                this.processing = false;
            }
        },
    },
});
</script>

<template>
    <div class="form-container" data-cy="setup-form">
        <div class="form">
            <div v-if="inviteError" class="mt-5">
                <div style="font-size: 28px; font-weight: bold" class="mb-4">
                    GigTab
                </div>
                <div class="alert alert-danger">{{ inviteError }}</div>
                <p class="text-secondary">Ask for a new invite link.</p>
            </div>

            <form @submit.prevent="submit" v-else-if="ready">
                <div style="font-size: 28px; font-weight: bold" class="mb-5 mt-5">
                    GigTab
                </div>

                <p class="mt-3" v-if="isInviteMode">
                    You've been invited to join the band. Create your account:
                </p>
                <p class="mt-3" v-else>
                    {{ $t("Create your admin account") }}
                </p>

                <div class="form-floating mt-3" v-if="isInviteMode">
                    <input id="floatingName" v-model="name" type="text" class="form-control" placeholder="Name" required>
                    <label for="floatingName">Your Name</label>
                </div>

                <div class="form-floating mt-3">
                    <input id="floatingInput" v-model="email" type="email" class="form-control" :placeholder='$t("Username")' required>
                    <label for="floatingInput">{{ $t("Email") }}</label>
                </div>

                <div class="form-floating mt-3">
                    <input id="floatingPassword" v-model="password" type="password" class="form-control" :placeholder='$t("Password")' required>
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div class="form-floating mt-3">
                    <input id="repeat" v-model="repeatPassword" type="password" class="form-control" :placeholder='$t("Repeat Password")' required>
                    <label for="repeat">{{ $t("Repeat Password") }}</label>
                </div>

                <button class="w-100 btn btn-primary mt-3" type="submit" :disabled="processing">
                    {{ isInviteMode ? "Join" : $t("Create") }}
                </button>
            </form>
        </div>
    </div>
</template>

<style scoped lang="scss">
.form-container {
    display: flex;
    align-items: center;
    padding-top: 40px;
    padding-bottom: 40px;
}

.form {
    width: 100%;
    max-width: 330px;
    padding: 15px;
    margin: auto;
    text-align: center;
}
</style>
