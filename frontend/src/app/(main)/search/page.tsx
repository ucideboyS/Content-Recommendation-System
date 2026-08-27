'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface Movie {
    id: number;
    title: string;
    name?: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
    media_type?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

type MediaFilter = 'all' | 'movie' | 'tv';

export default function SearchPage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(false);
    const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
    const [smartSearch, setSmartSearch] = useState(false);
    const [parsedFilters, setParsedFilters] = useState<{ genres?: string[]; mood?: string; era?: string; similar_to?: string } | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    const handleSearch = useCallback(async (searchQuery?: string) => {
        const q = (searchQuery ?? query).trim();
        if (!q) {
            setResults([]);
            setHasSearched(false);
            return;
        }
        setLoading(true);
        setParsedFilters(null);
        setHasSearched(true);

        try {
            if (smartSearch && token) {
                // AI-powered search
                try {
                    const resp = await axios.post(
                        `${API_URL}/api/ai/smart-search`,
                        { query: q },
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                    );
                    setResults(resp.data?.results || []);
                    setParsedFilters(resp.data?.parsed_filters || null);
                } catch (err: any) {
                    if (err.response?.status === 401) {
                        useAuthStore.getState().clearAuth();
                    } else {
                        throw err;
                    }
                }
            } else {
                // Always use multi-search for best results (returns media_type)
                const multiResp = await axios.get(
                    `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=en-US&page=1`
                );
                let items = (multiResp.data.results || [])
                    // Filter out people, keep only movie/tv with posters
                    .filter((item: Movie & { media_type?: string }) =>
                        (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
                    )
                    // Apply user's media filter
                    .filter((item: Movie & { media_type?: string }) =>
                        mediaFilter === 'all' || item.media_type === mediaFilter
                    )
                    // Normalize TV fields
                    .map((item: Movie) => ({
                        ...item,
                        title: item.title || item.name,
                        release_date: item.release_date || item.first_air_date,
                    }));

                // If multi-search returns too few results with a specific filter, supplement
                if (items.length < 3 && mediaFilter !== 'all') {
                    const typeEndpoint = mediaFilter === 'tv'
                        ? `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=en-US&page=1`
                        : `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=en-US&page=1`;
                    const typeResp = await axios.get(typeEndpoint);
                    const existingIds = new Set(items.map((i: Movie) => i.id));
                    const extra = (typeResp.data.results || [])
                        .filter((item: Movie) => item.poster_path && !existingIds.has(item.id))
                        .map((item: Movie) => ({
                            ...item,
                            title: item.title || item.name,
                            release_date: item.release_date || item.first_air_date,
                            media_type: mediaFilter,
                        }));
                    items = [...items, ...extra];
                }

                setResults(items);
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setLoading(false);
        }
    }, [query, mediaFilter, smartSearch, token]);

    // Debounced live search — triggers 400ms after user stops typing
    useEffect(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        debounceTimer.current = setTimeout(() => {
            handleSearch(query);
        }, 300);

        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, mediaFilter]);

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>🔍 Search</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Find movies and TV series</p>

            {/* Search bar */}
            <div className="glass-card p-4 mb-6">
                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder={smartSearch ? "Try: 'fun sci-fi movies from the 90s'" : "Start typing to search movies, TV series..."}
                        className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{
                            background: 'rgba(241,245,249,0.8)',
                            border: '1px solid rgba(0,0,0,0.06)',
                            color: '#1e293b',
                        }}
                    />
                    <button onClick={() => handleSearch()} className="btn-primary whitespace-nowrap">
                        Search
                    </button>
                </div>

                {/* Filter row */}
                <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                    {/* Media type tabs */}
                    <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(241,245,249,0.8)' }}>
                        {(['all', 'movie', 'tv'] as MediaFilter[]).map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setMediaFilter(filter)}
                                className="px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                                style={mediaFilter === filter ? {
                                    background: 'white',
                                    color: '#3b82f6',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                } : {
                                    background: 'transparent',
                                    color: '#64748b',
                                }}
                            >
                                {filter === 'all' ? '🌐 All' : filter === 'movie' ? '🎥 Movies' : '📺 TV Series'}
                            </button>
                        ))}
                    </div>

                    {/* Smart search toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs font-medium" style={{ color: '#64748b' }}>🧠 Smart Search</span>
                        <div
                            className="relative w-10 h-5 rounded-full transition-colors cursor-pointer"
                            style={{ background: smartSearch ? '#3b82f6' : '#cbd5e1' }}
                            onClick={() => setSmartSearch(!smartSearch)}
                        >
                            <div
                                className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                                style={{ left: smartSearch ? '22px' : '2px' }}
                            />
                        </div>
                    </label>
                </div>
            </div>

            {/* AI Parsed filters */}
            {parsedFilters && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {parsedFilters.genres?.map((g: string) => (
                        <span key={g} className="badge badge-movie">{g}</span>
                    ))}
                    {parsedFilters.mood && <span className="badge" style={{ background: 'rgba(168,85,247,0.1)', color: '#8b5cf6' }}>🎭 {parsedFilters.mood}</span>}
                    {parsedFilters.era && <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>📅 {parsedFilters.era}</span>}
                    {parsedFilters.similar_to && <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>🎯 Like: {parsedFilters.similar_to}</span>}
                </div>
            )}

            {/* Results */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : results.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {results.filter(m => m.poster_path).map((movie) => (
                        <div key={movie.id} className="animate-fadeIn">
                            <MovieCard
                                movie={{
                                    ...movie,
                                    title: movie.title || movie.name || '',
                                    media_type: movie.media_type,
                                }}
                                onClick={() => router.push(`/movies/${movie.id}`)}
                            />
                        </div>
                    ))}
                </div>
            ) : hasSearched ? (
                <div className="glass-card p-12 text-center">
                    <span className="text-4xl mb-3 block">🔎</span>
                    <p style={{ color: '#64748b' }}>No results found for &ldquo;{query}&rdquo;</p>
                </div>
            ) : (
                <div className="glass-card p-12 text-center">
                    <span className="text-4xl mb-3 block">🎬</span>
                    <p style={{ color: '#64748b' }}>Start typing to search movies and TV series</p>
                </div>
            )}
        </div>
    );
}