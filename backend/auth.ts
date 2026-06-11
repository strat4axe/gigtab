import { betterAuth } from "better-auth";
import { db, getFirstUserId, hasUser } from "./db.ts";
import * as fs from "@std/fs";
import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { devOriginList } from "./util.ts";
import { createAuthMiddleware } from "better-auth/api";
import * as path from "@std/path";
import { dataDir } from "./util.ts";
import { Context } from "@hono/hono";

const configJSONPath = path.join(dataDir, "config.json");

export const auth = betterAuth({
    database: db,
    secret: await getSecretKey(),
    // Hono take care of this
    trustedOrigins: ["*"],
    emailAndPassword: {
        enabled: true,
        disableSignUp: isDisableSignUp(),
    },
    hooks: {
        after: createAuthMiddleware(async (ctx) => {
            if (ctx.path.startsWith("/sign-up")) {
                const newSession = ctx.context.newSession;
                if (newSession) {
                    console.log("First user created: " + newSession.user.email);
                    console.log("Disable sign up after first user created");
                    disableSignUp();
                }
            }
        }),
    },
});

async function getSecretKey() {
    // Read AUTH_SECRET
    let secret = Deno.env.get("AUTH_SECRET");

    if (secret) {
        return secret;
    }

    // Read config.json
    if (await fs.exists(configJSONPath)) {
        const configText = await Deno.readTextFile(configJSONPath);
        const config = JSON.parse(configText);
        if (config.authSecret) {
            return config.authSecret;
        }
    }

    // Generate a random secret
    secret = await generateRandomSecret();

    // Save to config.json
    let config = {
        authSecret: secret,
    };
    await Deno.writeTextFile(configJSONPath, JSON.stringify(config, null, 4));

    return secret;
}

export function isFinishSetup() {
    return hasUser();
}

export function isDisableSignUp() {
    return hasUser();
}

export function disableSignUp() {
    auth.options.emailAndPassword.disableSignUp = true;
}

/**
 * Temporarily allow sign up while creating an invited user, then call
 * disableSignUp() again (use try/finally).
 */
export function enableSignUp() {
    auth.options.emailAndPassword.disableSignUp = false;
}

/**
 * The first registered user is the admin
 */
export function isAdmin(userId: string): boolean {
    const firstUserId = getFirstUserId();
    return firstUserId !== null && firstUserId === userId;
}

/**
 * Get current session and require the admin user, throw otherwise
 */
export async function getAdminSession(c: Context) {
    const session = await getCurrentSession(c);
    if (!isAdmin(session.user.id)) {
        throw new Error("Admin access required");
    }
    return session;
}

export async function checkLogin(c: Context) {
    await getCurrentSession(c);
}

export async function isLoggedIn(c: Context) {
    const session = await auth.api.getSession(c.req.raw);
    return !!session;
}

/**
 * Get current session, throw error if not logged in
 * @param c
 */
export async function getCurrentSession(c: Context) {
    const session = await auth.api.getSession(c.req.raw);
    if (!session) {
        throw new Error("Not logged in");
    }
    return session;
}

async function generateRandomSecret() {
    return Buffer.from(randomBytes(54)).toString("hex");
}
