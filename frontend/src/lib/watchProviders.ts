export interface ProviderData {
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority?: number;
}

export interface WatchDestination {
    url: string;
    mode: "direct" | "search";
    label: string;
}

export function getProviderDestination(
    providerName: string,
    title: string,
    tmdbLink?: string
): WatchDestination {
    const encodedTitle = encodeURIComponent(title);
    const pName = providerName.toLowerCase();

    // Check if tmdbLink is a direct provider link rather than JustWatch
    if (tmdbLink && !tmdbLink.includes('justwatch.com') && !tmdbLink.includes('themoviedb.org')) {
        return {
            url: tmdbLink,
            mode: "direct",
            label: `Watch on ${providerName}`
        };
    }

    // Official search fallbacks for Indian OTTs
    if (pName.includes('netflix')) {
        return { url: `https://www.netflix.com/in/search?q=${encodedTitle}`, mode: 'search', label: `Search on Netflix` };
    }
    if (pName.includes('amazon prime') || pName.includes('prime video')) {
        return { url: `https://www.primevideo.com/search/ref=atv_sr_sug_1?phrase=${encodedTitle}`, mode: 'search', label: `Search on Prime Video` };
    }
    if (pName.includes('hotstar')) {
        return { url: `https://www.hotstar.com/in/explore?searchQuery=${encodedTitle}`, mode: 'search', label: `Search on Hotstar` };
    }
    if (pName.includes('jio')) {
        return { url: `https://www.jiocinema.com/search?q=${encodedTitle}`, mode: 'search', label: `Search on JioCinema` };
    }
    if (pName.includes('sonyliv') || pName.includes('sony liv')) {
        return { url: `https://www.sonyliv.com/search?q=${encodedTitle}`, mode: 'search', label: `Search on SonyLIV` };
    }
    if (pName.includes('zee5')) {
        return { url: `https://www.zee5.com/search?q=${encodedTitle}`, mode: 'search', label: `Search on ZEE5` };
    }
    if (pName.includes('apple tv')) {
        return { url: `https://tv.apple.com/search?term=${encodedTitle}`, mode: 'search', label: `Search on Apple TV` };
    }
    if (pName.includes('aha')) {
        return { url: `https://www.aha.video/search?q=${encodedTitle}`, mode: 'search', label: `Search on aha` };
    }
    if (pName.includes('hoichoi')) {
        return { url: `https://www.hoichoi.tv/search?q=${encodedTitle}`, mode: 'search', label: `Search on Hoichoi` };
    }
    if (pName.includes('lionsgate play')) {
        return { url: `https://lionsgateplay.com/search?q=${encodedTitle}`, mode: 'search', label: `Search on Lionsgate Play` };
    }
    if (pName.includes('sun nxt')) {
        return { url: `https://www.sunnxt.com/search?q=${encodedTitle}`, mode: 'search', label: `Search on Sun NXT` };
    }
    if (pName.includes('youtube')) {
        return { url: `https://www.youtube.com/results?search_query=${encodedTitle}+movie`, mode: 'search', label: `Search on YouTube` };
    }
    if (pName.includes('google play movies')) {
        return { url: `https://play.google.com/store/search?q=${encodedTitle}&c=movies`, mode: 'search', label: `Search on Google Play` };
    }

    // Generic fallback to JustWatch if it's the only link provided by TMDB
    if (tmdbLink) {
        return {
            url: tmdbLink,
            mode: "search",
            label: `Search on JustWatch`
        };
    }

    // Absolute generic fallback to Google Search
    return {
        url: `https://www.google.com/search?q=${encodedTitle}+watch+online`,
        mode: "search",
        label: `Search on ${providerName}`
    };
}
