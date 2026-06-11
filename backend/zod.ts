import * as z from "zod";

export const SignUpSchema = z.object({
    email: z.email(),
    name: z.string().min(1),
    password: z.string().min(8),
});
export type SignUpData = z.infer<typeof SignUpSchema>;

export const InviteSignUpSchema = SignUpSchema.extend({
    inviteToken: z.string().min(1).optional(),
});
export type InviteSignUpData = z.infer<typeof InviteSignUpSchema>;

const title = z.string().min(1);
const artist = z.string().min(0);
const isPublic = z.boolean();
const isFav = z.boolean();

export const TabInfoSchema = z.object({
    id: z.string().default("-1"),
    title: title.default("Unknown"),
    artist: artist.default(""),
    filename: z.string().default("tab.gp"),
    originalFilename: z.string().default("Unknown"),
    createdAt: z.iso.datetime().default(() => new Date().toISOString()),
    public: isPublic.default(false),
    fav: isFav.default(false),
    // Empty string = legacy tab from before multi-user; stamped with the admin's id on startup
    ownerId: z.string().default(""),
});
export type TabInfo = z.infer<typeof TabInfoSchema>;

export const UpdateTabInfoSchema = z.object({
    title,
    artist,
    public: isPublic,
});
export type UpdateTabInfo = z.infer<typeof UpdateTabInfoSchema>;

export const UpdateTabFavSchema = z.object({
    fav: isFav,
});
export type UpdateTabFav = z.infer<typeof UpdateTabFavSchema>;

const videoID = z.string().min(1);
const syncMethod = z.enum(["simple", "advanced"]);
const simpleSync = z.number();
const advancedSync = z.string();

export const YoutubeSchema = z.object({
    videoID,
    syncMethod: syncMethod.default("simple"),
    simpleSync: simpleSync.default(0),
    advancedSync: advancedSync.default(""),
});
export type Youtube = z.infer<typeof YoutubeSchema>;

export const YoutubeAddDataSchema = z.object({
    videoID,
});
export type YoutubeData = z.infer<typeof YoutubeAddDataSchema>;

export const AppleMusicAddDataSchema = z.object({
    trackID: z.string().min(1),
});
export type AppleMusicAddData = z.infer<typeof AppleMusicAddDataSchema>;

export const SyncRequestSchema = z.object({
    syncMethod,
    simpleSync,
    advancedSync,
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const AudioDataSchema = z.object({
    filename: z.string().min(1),
    syncMethod: syncMethod.default("simple"),
    simpleSync: simpleSync.default(0),
    advancedSync: advancedSync.default(""),
});

export type AudioData = z.infer<typeof AudioDataSchema>;

export const AppleMusicSchema = z.object({
    trackID: z.string().min(1),
    storefront: z.string().default("us"),
    syncMethod: syncMethod.default("simple"),
    simpleSync: simpleSync.default(0),
    advancedSync: advancedSync.default(""),
});
export type AppleMusic = z.infer<typeof AppleMusicSchema>;

export const ConfigJSONSchema = z.object({
    tab: TabInfoSchema,
    audio: z.array(AudioDataSchema).default([]),
    youtube: z.array(YoutubeSchema).default([]),
    appleMusic: z.array(AppleMusicSchema).default([]),
});
export type ConfigJSON = z.infer<typeof ConfigJSONSchema>;
