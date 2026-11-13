import Dexie, { type Table } from "dexie";

// Define Tab metadata structure stored in IndexedDB
export interface CachedTab {
    id: string; // matches backend UUID or generated local ID
    title: string;
    artist: string;
    public: boolean;
    favorite: boolean;
    updatedAt: string; // ISO timestamp
    localOnly?: boolean; // tab created offline that doesn't exist on server yet
    pendingSync?: boolean; // tab created or modified offline and needs to be synced
    youtubeList?: any[];
    audioList?: any[];
    appleMusicList?: any[];
}

// Define Tab file structure stored in IndexedDB
export interface CachedFile {
    tabId: string;
    fileBlob: Blob;
    extension: string; // e.g., 'gp', 'txt'
}

// Define Audio track structure stored in IndexedDB
export interface CachedAudio {
    id?: number;
    tabId: string;
    filename: string;
    fileBlob: Blob;
}

// Define User Profile structure stored in IndexedDB
export interface CachedProfile {
    userId: string;
    email: string;
    name: string;
    sessionToken: string; // session token from better-auth
    cachedAt: string;
}

// Setlist stored in IndexedDB. Mirrors the server shape plus local sync state.
export interface CachedSetlistItem {
    id: string;
    tabId: string;
    title: string;
    artist: string;
    order: number;
}

export interface CachedSetlist {
    id: string;
    name: string;
    items: CachedSetlistItem[];
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp, used for last-write-wins sync
    deleted?: boolean; // tombstone, kept so the deletion can be synced
    pendingSync?: boolean; // changed on this device and not yet pushed to the server
}

export class GigTabDatabase extends Dexie {
    tabs!: Table<CachedTab, string>;
    files!: Table<CachedFile, string>;
    audio!: Table<CachedAudio, number>;
    profile!: Table<CachedProfile, string>;
    setlists!: Table<CachedSetlist, string>;

    constructor() {
        super("GigTabDatabase");
        this.version(1).stores({
            tabs: "id, title, artist, public, favorite, updatedAt, localOnly, pendingSync",
            files: "tabId",
            audio: "++id, tabId, filename, [tabId+filename]",
            profile: "userId, email",
        });
        this.version(2).stores({
            setlists: "id, updatedAt",
        });
    }
}

export const db = new GigTabDatabase();
