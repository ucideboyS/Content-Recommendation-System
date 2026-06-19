'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';
import Image from 'next/image';

interface Movie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date?: string;
    backdrop_path?: string;
    media_type?: string;
    genre_ids?: number[];
    name?: string;
    first_air_date?: string;
}

interface MoodMovie {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    vote_average: number;
    release_date: string;
    fit_score: number;
    reason: string;
}

const MOODS = [
    { key: 'happy', emoji: '😊', label: 'Happy', color: '#fbbf24' },
    { key: 'sad', emoji: '😢', label: 'Sad', color: '#60a5fa' },
    { key: 'tense', emoji: '😰', label: 'Tense', color: '#ef4444' },
    { key: 'nostalgic', emoji: '🥹', label: 'Nostalgic', color: '#f97316' },
    { key: 'adventurous', emoji: '🗺️', label: 'Adventurous', color: '#10b981' },
    { key: 'romantic', emoji: '💕', label: 'Romantic', color: '#ec4899' },
    { key: 'thoughtful', emoji: '🧠', label: 'Thoughtful', color: '#8b5cf6' },
];

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/* ============================================================================
   CAROUSEL COMPONENT
   ============================================================================ */
function Carousel({ title, movies, onMovieClick, icon }: {
    title: string;
    movies: Movie[];
    onMovieClick: (id: number) => void;
    icon?: string;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: 'left' | 'right') => {
        if (scrollRef.current) {
            const amount = dir === 'left' ? -400 : 400;
            scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
        }
    };

    if (!movies.length) return null;

    return (
        <section className="mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-lg font-bold" style={{ color: '#1e293b' }}>
                    {icon && <span className="mr-2">{icon}</span>}{title}
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => scroll('left')}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
                        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
                        ‹
                    </button>
                    <button onClick={() => scroll('right')}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all"
                        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
                        ›
                    </button>
                </div>
            </div>
            <div ref={scrollRef} className="carousel-row">
                {movies.map((movie) => (
                    <div key={movie.id} className="w-[160px] sm:w-[180px]">
                        <MovieCard movie={movie} onClick={() => onMovieClick(movie.id)} />
                    </div>
                ))}
            </div>
        </section>
    );
}

/* ============================================================================
   HOME PAGE
   ============================================================================ */
export default function HomePage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);

    const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
    const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
    const [topRated, setTopRated] = useState<Movie[]>([]);
    const [tvSeries, setTvSeries] = useState<Movie[]>([]);
    const [hindiMovies, setHindiMovies] = useState<Movie[]>([]);
    const [heroMovie, setHeroMovie] = useState<Movie | null>(null);
    const [loading, setLoading] = useState(true);

    // Mood
    const [selectedMood, setSelectedMood] = useState<string | null>(null);
    const [moodMovies, setMoodMovies] = useState<MoodMovie[]>([]);
    const [moodLoading, setMoodLoading] = useState(false);

    const navigateToMovie = (id: number) => router.push(`/movies/${id}`);

    // ---------------------------------------------------------------
    // Fetch all movie data
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!isInitialized) return;

        const fetchAll = async () => {
            setLoading(true);
            try {
                const [trendRes, popRes, topRes, tvRes, hindiRes] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_original_language=hi&sort_by=popularity.desc&vote_count.gte=50&page=1`),
                ]);

                // Kids genre IDs — filter these from main carousels (they have their own section)
                const KIDS_GENRE_IDS = [10751]; // Family
                const isNotKids = (m: Movie) => {
                    const genres = m.genre_ids || [];
                    return !genres.some(g => KIDS_GENRE_IDS.includes(g));
                };

                // Sort helpers
                const byPopularity = (a: Movie & { popularity?: number }, b: Movie & { popularity?: number }) =>
                    (b.popularity || 0) - (a.popularity || 0);
                const byRating = (a: Movie, b: Movie) =>
                    (b.vote_average || 0) - (a.vote_average || 0);

                // Trending — sorted by popularity (already trending, but ensure order)
                const trending = (trendRes.data.results || [])
                    .map((m: Movie) => ({ ...m, media_type: m.media_type || 'movie' }))
                    .filter(isNotKids)
                    .sort(byPopularity);
                setTrendingMovies(trending);

                // Popular — sorted by popularity
                setPopularMovies((popRes.data.results || [])
                    .map((m: Movie) => ({ ...m, media_type: 'movie' }))
                    .filter(isNotKids)
                    .sort(byPopularity));

                // Top Rated — sorted by rating (highest first)
                setTopRated((topRes.data.results || [])
                    .map((m: Movie) => ({ ...m, media_type: 'movie' }))
                    .filter(isNotKids)
                    .sort(byRating));

                // TV Series — sorted by popularity, filter kids
                const tvData = (tvRes.data.results || [])
                    .map((t: Movie) => ({
                        ...t,
                        title: t.name || t.title,
                        release_date: t.first_air_date,
                        media_type: 'tv',
                    }))
                    .filter(isNotKids)
                    .sort(byPopularity);
                setTvSeries(tvData);

                // Hindi Movies — sorted by popularity
                setHindiMovies((hindiRes.data.results || [])
                    .map((m: Movie) => ({ ...m, media_type: 'movie' }))
                    .filter(isNotKids)
                    .sort(byPopularity));

                // Pick hero from trending (non-kids)
                const heroCandidate = trending.find((m: Movie) => m.backdrop_path && m.overview);
                setHeroMovie(heroCandidate || trending[0] || null);
            } catch (err) {
                console.error('Failed to fetch movies:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchAll();
    }, [isInitialized]);

    // ---------------------------------------------------------------
    // Mood handler
    // ---------------------------------------------------------------
    const handleMoodSelect = async (mood: string) => {
        if (selectedMood === mood) {
            setSelectedMood(null);
            setMoodMovies([]);
            return;
        }

        setSelectedMood(mood);
        setMoodLoading(true);

        try {
            const resp = await axios.post(
                `${API_URL}/api/ai/mood-recommendations`,
                { mood },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            setMoodMovies(resp.data?.recommendations || []);
        } catch {
            // Fallback to TMDB
            try {
                const resp = await axios.get(`${API_URL}/api/recommend/mood/${mood}`);
                const recs = (resp.data?.recommendations || []).map((m: MoodMovie & { mood_score?: number }) => ({
                    ...m,
                    fit_score: m.mood_score || 0,
                    reason: 'Matches your mood',
                }));
                setMoodMovies(recs);
            } catch {
                setMoodMovies([]);
            }
        } finally {
            setMoodLoading(false);
        }
    };

    // ---------------------------------------------------------------
    // RENDER
    // ---------------------------------------------------------------
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                    <p style={{ color: '#64748b' }}>Loading your experience...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-10">
            {/* ============================================================
                HERO BANNER
                ============================================================ */}
            {heroMovie && (
                <div className="relative w-full overflow-hidden" style={{ height: '480px' }}>
                    <Image
                        src={`https://image.tmdb.org/t/p/original${heroMovie.backdrop_path}`}
                        alt={heroMovie.title}
                        fill
                        className="object-cover"
                        priority
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(to right, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.5) 50%, transparent 100%)',
                    }} />
                    <div className="absolute inset-0" style={{
                        background: 'linear-gradient(to top, rgba(240,245,255,1) 0%, transparent 30%)',
                    }} />

                    {/* Hero content */}
                    <div className="absolute bottom-12 left-8 right-8 max-w-xl">
                        <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">{heroMovie.title}</h1>
                        <p className="text-slate-200 text-sm leading-relaxed mb-5 line-clamp-3">{heroMovie.overview}</p>
                        <div className="flex gap-3">
                            <button className="btn-primary flex items-center gap-2"
                                onClick={() => navigateToMovie(heroMovie.id)}>
                                ▶ More Info
                            </button>
                            <button className="btn-glass flex items-center gap-2"
                                onClick={() => navigateToMovie(heroMovie.id)}>
                                ⭐ {heroMovie.vote_average?.toFixed(1)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================
                CONTENT AREA
                ============================================================ */}
            <div className="px-6 lg:px-8 -mt-4">

                {/* MOOD SELECTOR */}
                <section className="mb-8">
                    <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>
                        🎭 How are you feeling?
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {MOODS.map((mood) => (
                            <button
                                key={mood.key}
                                onClick={() => handleMoodSelect(mood.key)}
                                className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                                    selectedMood === mood.key ? 'scale-105' : ''
                                }`}
                                style={selectedMood === mood.key ? {
                                    background: `linear-gradient(135deg, ${mood.color}22, ${mood.color}11)`,
                                    border: `2px solid ${mood.color}`,
                                    color: mood.color,
                                    boxShadow: `0 0 16px ${mood.color}30`,
                                } : {
                                    background: 'rgba(255,255,255,0.6)',
                                    backdropFilter: 'blur(8px)',
                                    border: '1px solid rgba(255,255,255,0.5)',
                                    color: '#475569',
                                }}
                            >
                                <span className="text-xl">{mood.emoji}</span>
                                {mood.label}
                            </button>
                        ))}
                    </div>

                    {/* Mood results */}
                    {moodLoading && (
                        <div className="mt-4 flex items-center gap-3 text-sm" style={{ color: '#64748b' }}>
                            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                            Finding movies for your mood...
                        </div>
                    )}
                    {selectedMood && !moodLoading && moodMovies.length > 0 && (
                        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {moodMovies.map((m) => m.poster_path && (
                                <div key={m.id} className="animate-fadeIn">
                                    <MovieCard
                                        movie={{ ...m, poster_path: m.poster_path || '' }}
                                        onClick={() => navigateToMovie(m.id)}
                                    />
                                    {m.reason && (
                                        <p className="mt-2 text-xs italic px-1" style={{ color: '#64748b' }}>
                                            &ldquo;{m.reason}&rdquo;
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* CAROUSELS */}
                <Carousel title="Trending Now" icon="🔥" movies={trendingMovies} onMovieClick={navigateToMovie} />
                <Carousel title="Popular Movies" icon="🎬" movies={popularMovies} onMovieClick={navigateToMovie} />
                <Carousel title="Popular TV Series" icon="📺" movies={tvSeries} onMovieClick={navigateToMovie} />
                <Carousel title="Hindi Movies" icon="🇮🇳" movies={hindiMovies} onMovieClick={navigateToMovie} />
                <Carousel title="Top Rated" icon="⭐" movies={topRated} onMovieClick={navigateToMovie} />
            </div>
        </div>
    );
}