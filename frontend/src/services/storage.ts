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

export class GigTabDatabase extends Dexie {
    tabs!: Table<CachedTab, string>;
    files!: Table<CachedFile, string>;
    audio!: Table<CachedAudio, number>;
    profile!: Table<CachedProfile, string>;

    constructor() {
        super("GigTabDatabase");
        this.version(1).stores({
            tabs: "id, title, artist, public, favorite, updatedAt, localOnly, pendingSync",
            files: "tabId",
            audio: "++id, tabId, filename, [tabId+filename]",
            profile: "userId, email",
        });
    }
}

export const db = new GigTabDatabase();
