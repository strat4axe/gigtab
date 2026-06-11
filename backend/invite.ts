import { db } from "./db.ts";
import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const INVITE_EXPIRY_DAYS = 7;

export interface Invite {
    token: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    usedBy: string | null;
    usedAt: string | null;
}

export function initInviteTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS invite (
            token TEXT PRIMARY KEY,
            createdBy TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            usedBy TEXT,
            usedAt TEXT
        )
    `);
}

export function createInvite(createdBy: string): Invite {
    const invite: Invite = {
        token: Buffer.from(randomBytes(18)).toString("hex"),
        createdBy,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        usedBy: null,
        usedAt: null,
    };

    db.prepare("INSERT INTO invite (token, createdBy, createdAt, expiresAt) VALUES (?, ?, ?, ?)")
        .run(invite.token, invite.createdBy, invite.createdAt, invite.expiresAt);

    return invite;
}

export function listInvites(): Invite[] {
    const rows = db.prepare("SELECT * FROM invite ORDER BY createdAt DESC").all();
    return rows as unknown as Invite[];
}

export function deleteInvite(token: string) {
    db.prepare("DELETE FROM invite WHERE token = ?").run(token);
}

/**
 * Get an invite that is unused and not expired, throw otherwise
 */
export function getValidInvite(token: string): Invite {
    const row = db.prepare("SELECT * FROM invite WHERE token = ?").get(token) as unknown as Invite | undefined;

    if (!row) {
        throw new Error("Invalid invite link");
    }
    if (row.usedBy) {
        throw new Error("This invite link has already been used");
    }
    if (new Date(row.expiresAt).getTime() < Date.now()) {
        throw new Error("This invite link has expired");
    }

    return row;
}

export function markInviteUsed(token: string, usedBy: string) {
    db.prepare("UPDATE invite SET usedBy = ?, usedAt = ? WHERE token = ?")
        .run(usedBy, new Date().toISOString(), token);
}
