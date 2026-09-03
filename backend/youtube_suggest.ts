export interface YoutubeSuggestion {
    videoID: string;
    title: string;
    channelTitle: string;
    duration: string;
    thumbnailUrl: string;
    isOfficial: boolean;
    isVerified: boolean;
    score: number;
}

function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .replace(/official|music|vevo|topic|channel|video/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

export async function suggestYoutubeVideo(artist: string, trackTitle: string): Promise<YoutubeSuggestion[]> {
    const query = artist ? `${artist} - ${trackTitle}` : trackTitle;
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    console.log(`Searching YouTube for: "${query}"`);

    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch YouTube search results: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract ytInitialData JSON payload
    const startKeyword = "ytInitialData =";
    let startIndex = html.indexOf(startKeyword);
    if (startIndex === -1) {
        const altStartKeyword = 'window["ytInitialData"] =';
        startIndex = html.indexOf(altStartKeyword);
    }

    if (startIndex === -1) {
        throw new Error("Could not find ytInitialData in YouTube response HTML");
    }

    const jsonStart = html.indexOf("{", startIndex);
    if (jsonStart === -1) {
        throw new Error("Could not find JSON start brace in ytInitialData");
    }

    const scriptEnd = html.indexOf("</script>", jsonStart);
    if (scriptEnd === -1) {
        throw new Error("Could not find closing script tag for ytInitialData");
    }

    let jsonStr = html.substring(jsonStart, scriptEnd).trim();
    if (jsonStr.endsWith(";")) {
        jsonStr = jsonStr.substring(0, jsonStr.length - 1);
    }

    // deno-lint-ignore no-explicit-any
    let data: any;
    try {
        data = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse ytInitialData JSON:", e);
        throw new Error("Failed to parse YouTube search result payload");
    }

    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents || !Array.isArray(contents)) {
        throw new Error("Search results page format changed (missing twoColumnSearchResultsRenderer contents)");
    }

    // deno-lint-ignore no-explicit-any
    let items: any[] = [];
    for (const section of contents) {
        if (section.itemSectionRenderer?.contents) {
            items = section.itemSectionRenderer.contents;
            break;
        }
    }

    const suggestions: YoutubeSuggestion[] = [];

    for (const item of items) {
        if (!item.videoRenderer) continue;
        const vr = item.videoRenderer;

        const videoID = vr.videoId || "";
        if (!videoID) continue;

        const title = vr.title?.runs?.map((r: { text?: string }) => r.text).join("") || "";
        const channelTitle = vr.ownerText?.runs?.map((r: { text?: string }) => r.text).join("") || "";
        const duration = vr.lengthText?.simpleText || "";
        const thumbnailUrl = vr.thumbnail?.thumbnails?.[0]?.url || "";

        let isOfficial = false;
        let isVerified = false;

        const ownerBadges = vr.ownerBadges || [];
        for (const badge of ownerBadges) {
            const renderer = badge.metadataBadgeRenderer;
            if (renderer) {
                if (renderer.style === "BADGE_STYLE_TYPE_VERIFIED_ARTIST") {
                    isOfficial = true;
                } else if (renderer.style === "BADGE_STYLE_TYPE_VERIFIED") {
                    isVerified = true;
                }
            }
        }

        const lowerChannel = channelTitle.toLowerCase().trim();
        if (lowerChannel.endsWith(" - topic") || lowerChannel.endsWith("-topic") || lowerChannel.endsWith("vevo")) {
            isOfficial = true;
        }

        // Scoring system
        let score = 0;

        if (isOfficial) {
            score += 15;
        } else if (isVerified) {
            score += 5;
        }

        const cleanArtist = normalizeString(artist);
        const cleanChannel = normalizeString(channelTitle);

        if (cleanArtist && cleanChannel) {
            if (cleanChannel.includes(cleanArtist) || cleanArtist.includes(cleanChannel)) {
                score += 10;
                if (cleanChannel === cleanArtist) {
                    score += 5;
                }
            }
        }

        const lowerTitle = title.toLowerCase();
        const lowerArtist = artist.toLowerCase();
        const lowerTrack = trackTitle.toLowerCase();

        if (lowerTitle.includes(lowerTrack)) {
            score += 15;
        }

        if (artist && lowerTitle.includes(lowerArtist)) {
            score += 5;
        }

        if (lowerTitle.includes("official music video") || lowerTitle.includes("official video")) {
            score += 5;
        } else if (lowerTitle.includes("official audio") || lowerTitle.includes("audio")) {
            score += 3;
        }

        if (lowerTitle.includes("cover") && !lowerTrack.includes("cover")) {
            score -= 15;
        }
        if (lowerTitle.includes("tutorial") || lowerTitle.includes("how to play") || lowerTitle.includes("lesson")) {
            score -= 20;
        }
        if (lowerTitle.includes("reaction") || lowerTitle.includes("reacts")) {
            score -= 20;
        }
        if (lowerTitle.includes("live") && !lowerTrack.includes("live")) {
            score -= 5;
        }
        if (lowerTitle.includes("remix") && !lowerTrack.includes("remix")) {
            score -= 8;
        }
        if (lowerTitle.includes("karaoke") || lowerTitle.includes("instrumental") || lowerTitle.includes("backing track")) {
            score -= 10;
        }

        suggestions.push({
            videoID,
            title,
            channelTitle,
            duration,
            thumbnailUrl,
            isOfficial,
            isVerified,
            score,
        });
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions;
}
