import { kv } from "./db.ts";
import { Setlist, SetlistSchema } from "./zod.ts";

/**
 * Setlists are a band-wide resource: every logged-in member reads and writes the same list.
 * Devices edit their own copy offline and push it back later, so writes are last-write-wins
 * on `updatedAt`, and deletions are kept as tombstones (`deleted: true`) so they reach
 * devices that were offline when the setlist was removed.
 */

function key(id: string) {
    return ["setlist", id];
}

export async function getAllSetlists(): Promise<Setlist[]> {
    const list: Setlist[] = [];
    for await (const entry of kv.list({ prefix: ["setlist"] })) {
        const parsed = SetlistSchema.safeParse(entry.value);
        if (parsed.success) {
            list.push(parsed.data);
        }
    }
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list;
}

export async function getSetlist(id: string): Promise<Setlist | null> {
    const entry = await kv.get(key(id));
    const parsed = SetlistSchema.safeParse(entry.value);
    return parsed.success ? parsed.data : null;
}

/**
 * Store the incoming setlist unless the server already holds a newer copy.
 * Returns the copy that is on the server afterwards and whether the incoming one was applied.
 */
export async function putSetlist(incoming: Setlist): Promise<{ setlist: Setlist; applied: boolean }> {
    while (true) {
        const entry = await kv.get(key(incoming.id));
        const existing = SetlistSchema.safeParse(entry.value);

        if (existing.success && Date.parse(existing.data.updatedAt) > Date.parse(incoming.updatedAt)) {
            return { setlist: existing.data, applied: false };
        }

        const commit = await kv.atomic()
            .check({ key: key(incoming.id), versionstamp: entry.versionstamp })
            .set(key(incoming.id), incoming)
            .commit();

        if (commit.ok) {
            return { setlist: incoming, applied: true };
        }
    }
}
