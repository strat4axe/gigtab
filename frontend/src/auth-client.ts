import { createAuthClient } from "better-auth/vue";
import { baseURL } from "./app.ts";
import { db } from "./services/storage.ts";

export const authClient = createAuthClient({
    baseURL: baseURL,
});

export async function isLoggedIn() {
    try {
        // Try getting session from the server first
        const session = await authClient.getSession();
        if (session && session.data) {
            // Cache session/profile details for offline access
            await db.profile.put({
                userId: session.data.user.id,
                email: session.data.user.email,
                name: session.data.user.name,
                sessionToken: session.data.session.token || "active",
                cachedAt: new Date().toISOString(),
            });
            return true;
        } else {
            // Explicitly logged out online, clear cached profile
            await db.profile.clear();
            return false;
        }
    } catch (e) {
        // Network error/offline fallback
        console.warn("Auth getSession failed (offline mode):", e);
        const cached = await db.profile.toArray();
        return cached.length > 0;
    }
}
