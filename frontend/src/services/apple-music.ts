import { baseURL } from "../app.ts";

let musicKitInstance: any = null;
let isLoaded = false;

export async function loadMusicKit(): Promise<any> {
    if (musicKitInstance) return musicKitInstance;

    if (!isLoaded) {
        await new Promise<void>((resolve, reject) => {
            if ((window as any).MusicKit) {
                isLoaded = true;
                resolve();
                return;
            }

            const script = document.createElement("script");
            script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
            script.async = true;
            script.onload = () => {
                isLoaded = true;
                resolve();
            };
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
        });
    }

    const MusicKit = (window as any).MusicKit;
    if (!MusicKit) {
        throw new Error("MusicKit JS could not be loaded.");
    }

    // Fetch developer token from backend
    const res = await fetch((baseURL || "") + "/api/apple-music/token", { credentials: "include" });
    if (!res.ok) {
        throw new Error("Failed to retrieve Apple Music developer token from server.");
    }
    const data = await res.json();
    const developerToken = data.token;

    if (!developerToken) {
        throw new Error("Apple Music developer token is not configured on the server.");
    }

    try {
        await MusicKit.configure({
            developerToken,
            app: {
                name: "GigTab",
                build: "1.6.2",
            },
        });
        musicKitInstance = MusicKit.getInstance();
        return musicKitInstance;
    } catch (e) {
        console.error("MusicKit configuration failed:", e);
        throw e;
    }
}

export async function getMusicKitInstance(): Promise<any> {
    if (!musicKitInstance) {
        return await loadMusicKit();
    }
    return musicKitInstance;
}

export async function isAuthorized(): Promise<boolean> {
    try {
        const music = await getMusicKitInstance();
        return music ? music.isAuthorized : false;
    } catch {
        return false;
    }
}

export async function authorize(): Promise<boolean> {
    const music = await getMusicKitInstance();
    if (!music) return false;
    await music.authorize();
    return music.isAuthorized;
}

export async function unauthorize(): Promise<void> {
    const music = await getMusicKitInstance();
    if (music) {
        await music.unauthorize();
    }
}
