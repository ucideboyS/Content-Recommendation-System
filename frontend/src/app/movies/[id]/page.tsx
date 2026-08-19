'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import Sidebar from '@/components/ui/Sidebar';
import MovieCard from '@/components/ui/MovieCard';

interface MovieDetails {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    backdrop_path: string;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genres: Array<{ id: number; name: string }>;
    runtime: number;
    tagline: string;
    budget: number;
    revenue: number;
    status: string;
    original_language: string;
    popularity: number;
    production_companies: Array<{ id: number; name: string; logo_path: string }>;
    spoken_languages?: Array<{ english_name: string; iso_639_1: string }>;
    videos: {
        results: Array<{
            key: string;
            site: string;
            type: string;
            official: boolean;
        }>;
    };
    credits?: {
        cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
        crew: Array<{ id: number; name: string; job: string }>;
    };
    number_of_seasons?: number;
    number_of_episodes?: number;
    imdb_id?: string;
}

interface Recommendation {
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

/* ============================================================================
   LANGUAGE CODE → DISPLAY NAME MAP
   ============================================================================ */
const LANG_MAP: Record<string, string> = {
    en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', de: 'German',
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', pt: 'Portuguese', it: 'Italian',
    ru: 'Russian', ar: 'Arabic', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam',
    kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi', ur: 'Urdu',
    tr: 'Turkish', th: 'Thai', sv: 'Swedish', pl: 'Polish', nl: 'Dutch',
    da: 'Danish', no: 'Norwegian', fi: 'Finnish', id: 'Indonesian',
};

/* ============================================================================
   SKELETON LOADER COMPONENT
   ============================================================================ */
function SkeletonPulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return (
        <div
            className={`animate-pulse rounded-lg ${className || ''}`}
            style={{ background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)', backgroundSize: '200% 100%', ...style }}
        />
    );
}

/* ============================================================================
   MAIN PAGE
   ============================================================================ */
export default function MovieDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [movie, setMovie] = useState<MovieDetails | null>(null);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingRecs, setIsLoadingRecs] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recError, setRecError] = useState<string | null>(null);
    const [showTrailer, setShowTrailer] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [userRating, setUserRating] = useState<number | null>(null);
    const [isRating, setIsRating] = useState(false);
    const [ratingError, setRatingError] = useState<string | null>(null);
    const [ratingSaved, setRatingSaved] = useState(false);
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [aiInsightLoading, setAiInsightLoading] = useState(false);
    const [inWishlist, setInWishlist] = useState(false);
    const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
    const [imdbRating, setImdbRating] = useState<string | null>(null);

    // Auth check
    useEffect(() => {
        setIsAuthenticated(!!localStorage.getItem('token'));
    }, []);

    // Store history
    const storeMovieHistory = useCallback(async (tmdbId: number) => {
        if (!isAuthenticated) return;
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            await axios.post(`${API_URL}/api/users/history`, { tmdb_movie_id: tmdbId }, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            console.error('Error storing history:', err);
        }
    }, [isAuthenticated]);

    // Fetch IMDB rating via OMDB (free alternative) or TMDB external IDs
    const fetchImdbRating = async (movieData: MovieDetails, type: 'movie' | 'tv') => {
        try {
            // First get the IMDB ID from TMDB
            let imdbId = movieData.imdb_id;
            if (!imdbId) {
                const extResp = await axios.get(
                    `https://api.themoviedb.org/3/${type}/${movieData.id}/external_ids?api_key=${TMDB_KEY}`
                );
                imdbId = extResp.data?.imdb_id;
            }
            if (imdbId) {
                // Use OMDB API for IMDB rating (free tier: 1000 req/day)
                try {
                    const omdbResp = await axios.get(`https://www.omdbapi.com/?i=${imdbId}&apikey=4287ad12`);
                    if (omdbResp.data?.imdbRating && omdbResp.data.imdbRating !== 'N/A') {
                        setImdbRating(omdbResp.data.imdbRating);
                    }
                } catch {
                    // OMDB failed, just skip
                }
            }
        } catch {
            // Non-critical, skip
        }
    };

    // Fetch movie details — try /movie first, then fallback to /tv
    useEffect(() => {
        const fetchMovie = async () => {
            setIsLoading(true);
            try {
                // Try as movie first
                const resp = await axios.get(
                    `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&append_to_response=credits,videos`
                );
                setMovie(resp.data);
                setMediaType('movie');
                fetchImdbRating(resp.data, 'movie');
                if (isAuthenticated) {
                    storeMovieHistory(Number(id));
                    fetchAiInsight(resp.data);
                    checkWishlist('movie');
                } else {
                    // Fetch AI insight even for guests (non-auth endpoint)
                    fetchAiInsightGuest(resp.data);
                }
            } catch {
                // Fallback: try as TV show
                try {
                    const tvResp = await axios.get(
                        `https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&append_to_response=credits,videos`
                    );
                    const tvData = tvResp.data;
                    // Normalize TV fields to match movie interface
                    tvData.title = tvData.name || tvData.title;
                    tvData.release_date = tvData.first_air_date || tvData.release_date;
                    setMovie(tvData);
                    setMediaType('tv');
                    fetchImdbRating(tvData, 'tv');
                    if (isAuthenticated) {
                        storeMovieHistory(Number(id));
                        fetchAiInsight(tvData);
                        checkWishlist('tv');
                    } else {
                        fetchAiInsightGuest(tvData);
                    }
                } catch {
                    setError('Failed to load details');
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchMovie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isAuthenticated, storeMovieHistory]);

    // Auto-load recommendations when movie loads
    useEffect(() => {
        if (!movie?.id || recommendations.length > 0 || isLoadingRecs) return;
        handleGetRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [movie?.id]);

    // AI Insight (authenticated)
    const fetchAiInsight = async (movieData: MovieDetails) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setAiInsightLoading(true);
        try {
            const resp = await axios.post(`${API_URL}/api/ai/trending-context`, {
                title: movieData.title,
                genres: movieData.genres?.map(g => g.name) || [],
                year: movieData.release_date ? new Date(movieData.release_date).getFullYear() : 2024,
                rank: 1,
            }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
            if (resp.data?.context) setAiInsight(resp.data.context);
        } catch { /* non-critical */ }
        finally { setAiInsightLoading(false); }
    };

    // AI Insight fallback for guests — generate a deterministic insight from metadata
    const fetchAiInsightGuest = (movieData: MovieDetails) => {
        const genres = movieData.genres?.map(g => g.name) || [];
        const year = movieData.release_date ? new Date(movieData.release_date).getFullYear() : null;
        const rating = movieData.vote_average;

        if (rating >= 8) {
            setAiInsight(`Critically acclaimed ${genres[0]?.toLowerCase() || ''} ${year ? `from ${year}` : ''} — a must-watch with ${movieData.vote_count?.toLocaleString() || 'many'} votes on TMDB.`);
        } else if (rating >= 7) {
            setAiInsight(`A well-received ${genres.slice(0, 2).join(' & ').toLowerCase() || 'film'} ${year ? `(${year})` : ''} praised by audiences worldwide.`);
        } else if (rating >= 6) {
            setAiInsight(`An entertaining ${genres[0]?.toLowerCase() || ''} pick ${year ? `from ${year}` : ''} with a solid fan following.`);
        } else {
            setAiInsight(`A ${genres[0]?.toLowerCase() || 'film'} worth exploring — ${movieData.vote_count || 0} ratings on TMDB.`);
        }
    };

    // Wishlist
    const checkWishlist = async (type?: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const mt = type || mediaType;
        try {
            const resp = await axios.get(`${API_URL}/api/wishlist/check/${id}?media_type=${mt}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setInWishlist(resp.data?.in_wishlist || false);
        } catch { /* ignore */ }
    };

    const toggleWishlist = async () => {
        const token = localStorage.getItem('token');
        if (!token) { router.push('/login'); return; }
        try {
            if (inWishlist) {
                await axios.delete(`${API_URL}/api/wishlist/remove`, {
                    data: { tmdb_id: Number(id), media_type: mediaType },
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                setInWishlist(false);
            } else {
                await axios.post(`${API_URL}/api/wishlist/add`, { tmdb_id: Number(id), media_type: mediaType }, {
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                setInWishlist(true);
            }
        } catch (err) { console.error('Wishlist error:', err); }
    };

    // Recommendations — auto-loaded, also callable via button
    const handleGetRecommendations = async () => {
        const movieId = movie?.id;
        if (!movieId) return;
        setIsLoadingRecs(true);
        setRecError(null);
        try {
            const token = localStorage.getItem('token');
            const headers: Record<string, string> = {};
            if (token) headers.Authorization = `Bearer ${token}`;
            const resp = await axios.get(`${API_URL}/api/recommend/by-id/${movieId}`, { headers });
            const recs = (resp.data?.recommendations || [])
                .filter((r: Recommendation) => r?.poster_path && r.id !== movieId);
            setRecommendations(recs);
            if (!recs.length) setRecError('No similar titles found yet.');
        } catch {
            setRecError('Recommendations unavailable. Try again later.');
        } finally {
            setIsLoadingRecs(false);
        }
    };

    // Rating
    const fetchUserRating = useCallback(async () => {
        if (!isAuthenticated) return;
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const resp = await axios.get(`${API_URL}/api/users/movies/${id}/rating`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.data?.rating != null) setUserRating(resp.data.rating);
        } catch { /* ignore */ }
    }, [id, isAuthenticated]);

    useEffect(() => { if (isAuthenticated) fetchUserRating(); }, [isAuthenticated, fetchUserRating]);

    const handleRateMovie = async (rating: number) => {
        if (!isAuthenticated) { router.push('/login'); return; }
        setIsRating(true);
        setRatingError(null);
        setRatingSaved(false);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/users/movies/${id}/rate`, { rating }, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setUserRating(rating);
            setRatingSaved(true);
            setTimeout(() => setRatingSaved(false), 3000);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setRatingError(axiosErr.response?.data?.detail || 'Failed to rate');
        } finally {
            setIsRating(false);
        }
    };

    const trailer = movie?.videos?.results?.find(v => v.type === 'Trailer' && v.official && v.site === 'YouTube')
        || movie?.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');
    const director = movie?.credits?.crew?.find(c => c.job === 'Director');
    const cast = movie?.credits?.cast?.slice(0, 8) || [];

    // Helpers
    const formatRuntime = (mins: number) => {
        if (!mins) return null;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const formatMoney = (amount: number) => {
        if (!amount) return null;
        if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
        if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
        return `$${amount.toLocaleString()}`;
    };

    // ---------------------------------------------------------------
    // LOADING STATE — with skeletons
    // ---------------------------------------------------------------
    if (isLoading) {
        return (
            <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f5ff, #e0ecff)' }}>
                <Sidebar />
                <div className="lg:ml-[240px] pt-14 lg:pt-0">
                    {/* Hero skeleton */}
                    <div className="relative w-full overflow-hidden" style={{ height: '420px' }}>
                        <SkeletonPulse className="w-full h-full" style={{ borderRadius: 0 }} />
                        <div className="absolute bottom-8 left-6 right-6 flex gap-6 items-end">
                            <SkeletonPulse className="hidden sm:block w-[180px] h-[270px] rounded-xl" />
                            <div className="flex-1 space-y-3">
                                <SkeletonPulse className="w-48 h-4" />
                                <SkeletonPulse className="w-80 h-8" />
                                <div className="flex gap-2">
                                    <SkeletonPulse className="w-20 h-6 rounded-full" />
                                    <SkeletonPulse className="w-16 h-6 rounded-full" />
                                    <SkeletonPulse className="w-24 h-6 rounded-full" />
                                </div>
                                <div className="flex gap-3">
                                    <SkeletonPulse className="w-36 h-10 rounded-full" />
                                    <SkeletonPulse className="w-36 h-10 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Content skeleton */}
                    <div className="px-6 lg:px-8 pb-10 -mt-2">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                            <div className="lg:col-span-2 glass-card p-6 space-y-3">
                                <SkeletonPulse className="w-32 h-5" />
                                <SkeletonPulse className="w-full h-4" />
                                <SkeletonPulse className="w-full h-4" />
                                <SkeletonPulse className="w-3/4 h-4" />
                                <SkeletonPulse className="w-48 h-4 mt-3" />
                            </div>
                            <div className="space-y-4">
                                <div className="glass-card p-5 space-y-3">
                                    <SkeletonPulse className="w-24 h-4" />
                                    <SkeletonPulse className="w-full h-3" />
                                    <SkeletonPulse className="w-3/4 h-3" />
                                </div>
                                <div className="glass-card p-5 space-y-3">
                                    <SkeletonPulse className="w-28 h-4" />
                                    <div className="flex gap-1">
                                        {[1,2,3,4,5].map(i => <SkeletonPulse key={i} className="w-7 h-7 rounded" />)}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Cast skeleton */}
                        <div className="mb-8">
                            <SkeletonPulse className="w-20 h-5 mb-4" />
                            <div className="flex gap-4">
                                {[1,2,3,4,5,6].map(i => (
                                    <div key={i} className="flex-shrink-0 w-[100px] flex flex-col items-center gap-2">
                                        <SkeletonPulse className="w-[80px] h-[80px] rounded-full" />
                                        <SkeletonPulse className="w-16 h-3" />
                                        <SkeletonPulse className="w-12 h-2" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !movie) {
        return (
            <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f5ff, #e0ecff)' }}>
                <Sidebar />
                <div className="lg:ml-[240px] pt-14 lg:pt-0 flex items-center justify-center min-h-screen">
                    <div className="glass-card p-8 text-center">
                        <p className="text-lg font-semibold mb-3" style={{ color: '#ef4444' }}>{error || 'Movie not found'}</p>
                        <button onClick={() => router.push('/')} className="btn-primary">Go Home</button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------
    // MAIN RENDER
    // ---------------------------------------------------------------
    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f5ff, #e0ecff)' }}>
            <Sidebar />
            <div className="lg:ml-[240px] pt-14 lg:pt-0">

                {/* HERO BACKDROP */}
                <div className="relative w-full overflow-hidden" style={{ height: '420px' }}>
                    {movie.backdrop_path && (
                        <Image
                            src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
                            alt={movie.title} fill className="object-cover" priority
                        />
                    )}
                    {/* Stronger gradient overlay for readability */}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.75) 50%, rgba(15,23,42,0.4) 100%)' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(240,245,255,1) 0%, rgba(240,245,255,0.3) 20%, transparent 45%)' }} />

                    {/* Hero content */}
                    <div className="absolute bottom-8 left-6 right-6 flex gap-6 items-end">
                        {/* Poster */}
                        {movie.poster_path && (
                            <div className="hidden sm:block w-[180px] flex-shrink-0 rounded-xl overflow-hidden shadow-2xl"
                                style={{ border: '3px solid rgba(255,255,255,0.3)' }}>
                                <Image src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                                    alt={movie.title} width={180} height={270} className="w-full" />
                            </div>
                        )}
                        <div className="flex-1 max-w-2xl">
                            {movie.tagline && <p className="text-blue-300 text-sm italic mb-1">{movie.tagline}</p>}
                            <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">{movie.title}</h1>
                            <div className="flex flex-wrap items-center gap-3 mb-4">
                                <span className="badge" style={{ background: mediaType === 'tv' ? 'rgba(192,132,252,0.25)' : 'rgba(96,165,250,0.25)', color: mediaType === 'tv' ? '#c084fc' : '#60a5fa', fontWeight: 600 }}>
                                    {mediaType === 'tv' ? '📺 TV Show' : '🎥 Movie'}
                                </span>
                                {/* TMDB Rating */}
                                <span className="badge" style={{ background: 'rgba(251,191,36,0.25)', color: '#fbbf24', fontWeight: 600 }}>
                                    ⭐ {movie.vote_average?.toFixed(1)} <span style={{ opacity: 0.7, fontSize: '0.6rem', marginLeft: '2px' }}>TMDB</span>
                                </span>
                                {/* IMDB Rating (if available) */}
                                {imdbRating && (
                                    <span className="badge" style={{ background: 'rgba(245,197,24,0.25)', color: '#f5c518', fontWeight: 600 }}>
                                        🏆 {imdbRating} <span style={{ opacity: 0.7, fontSize: '0.6rem', marginLeft: '2px' }}>IMDb</span>
                                    </span>
                                )}
                                {movie.release_date && (
                                    <span className="text-slate-300 text-xs font-medium">{new Date(movie.release_date).getFullYear()}</span>
                                )}
                                {movie.runtime > 0 && <span className="text-slate-300 text-xs">{formatRuntime(movie.runtime)}</span>}
                                {mediaType === 'tv' && movie.number_of_seasons && (
                                    <span className="text-slate-300 text-xs">{movie.number_of_seasons} Season{movie.number_of_seasons > 1 ? 's' : ''}</span>
                                )}
                                {/* Genre tags with stronger contrast */}
                                {movie.genres?.map(g => (
                                    <span key={g.id} className="badge" style={{
                                        background: 'rgba(59,130,246,0.2)',
                                        color: '#93c5fd',
                                        fontWeight: 600,
                                        border: '1px solid rgba(59,130,246,0.3)',
                                    }}>{g.name}</span>
                                ))}
                            </div>
                            <div className="flex gap-3 flex-wrap">
                                {trailer && (
                                    <button className="btn-primary flex items-center gap-2" onClick={() => setShowTrailer(true)}>
                                        ▶ Watch Trailer
                                    </button>
                                )}
                                <button
                                    className={`btn-glass flex items-center gap-2 ${inWishlist ? '!border-pink-400 !text-pink-400' : ''}`}
                                    onClick={toggleWishlist}
                                >
                                    {inWishlist ? '❤️ In Wishlist' : '🤍 Add to Wishlist'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* TRAILER MODAL */}
                {showTrailer && trailer && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setShowTrailer(false)}>
                        <div className="w-full max-w-4xl mx-4 aspect-video" onClick={e => e.stopPropagation()}>
                            <iframe src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                                className="w-full h-full rounded-xl" allow="autoplay; encrypted-media" allowFullScreen />
                        </div>
                    </div>
                )}

                {/* CONTENT */}
                <div className="px-6 lg:px-8 pb-10 -mt-2">

                    {/* Overview + Details + AI Insight + Rating */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        <div className="lg:col-span-2 space-y-4">
                            {/* Overview card */}
                            <div className="glass-card p-6">
                                <h2 className="text-lg font-bold mb-3" style={{ color: '#1e293b' }}>Overview</h2>
                                <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{movie.overview || 'No overview available.'}</p>
                                {director && (
                                    <p className="text-sm mt-3" style={{ color: '#64748b' }}>
                                        <strong>Director:</strong> {director.name}
                                    </p>
                                )}
                            </div>

                            {/* Movie Details card */}
                            <div className="glass-card p-6">
                                <h2 className="text-sm font-bold mb-3" style={{ color: '#1e293b' }}>📋 Details</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6 text-xs">
                                    {movie.release_date && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Release Date</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>
                                                {new Date(movie.release_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </p>
                                        </div>
                                    )}
                                    {movie.runtime > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Runtime</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>{formatRuntime(movie.runtime)}</p>
                                        </div>
                                    )}
                                    {movie.original_language && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Language</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>
                                                {LANG_MAP[movie.original_language] || movie.original_language.toUpperCase()}
                                            </p>
                                        </div>
                                    )}
                                    {movie.status && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Status</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>{movie.status}</p>
                                        </div>
                                    )}
                                    {movie.vote_count > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>TMDB Votes</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>{movie.vote_count.toLocaleString()}</p>
                                        </div>
                                    )}
                                    {movie.budget > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Budget</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>{formatMoney(movie.budget)}</p>
                                        </div>
                                    )}
                                    {movie.revenue > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Revenue</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>{formatMoney(movie.revenue)}</p>
                                        </div>
                                    )}
                                    {mediaType === 'tv' && movie.number_of_seasons && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Seasons</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>
                                                {movie.number_of_seasons} ({movie.number_of_episodes || '?'} episodes)
                                            </p>
                                        </div>
                                    )}
                                    {movie.spoken_languages && movie.spoken_languages.length > 0 && (
                                        <div>
                                            <span style={{ color: '#94a3b8' }}>Spoken Languages</span>
                                            <p className="font-semibold" style={{ color: '#334155' }}>
                                                {movie.spoken_languages.map(l => l.english_name).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {/* Production companies */}
                                {movie.production_companies?.length > 0 && (
                                    <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                        <span className="text-xs" style={{ color: '#94a3b8' }}>Production</span>
                                        <p className="text-xs font-semibold mt-1" style={{ color: '#334155' }}>
                                            {movie.production_companies.map(c => c.name).join(' • ')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* AI Insight */}
                            <div className="glass-card p-5" style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}>
                                <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#8b5cf6' }}>
                                    🧠 AI Insight
                                </h3>
                                {aiInsightLoading ? (
                                    <div className="space-y-2">
                                        <SkeletonPulse className="w-full h-3" style={{ background: 'rgba(139,92,246,0.1)' }} />
                                        <SkeletonPulse className="w-3/4 h-3" style={{ background: 'rgba(139,92,246,0.1)' }} />
                                    </div>
                                ) : aiInsight ? (
                                    <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>{aiInsight}</p>
                                ) : (
                                    <p className="text-xs" style={{ color: '#94a3b8' }}>Insight unavailable for this title.</p>
                                )}
                            </div>

                            {/* Rating */}
                            <div className="glass-card p-5">
                                <h3 className="text-sm font-bold mb-3" style={{ color: '#1e293b' }}>⭐ Rate this {mediaType === 'tv' ? 'Show' : 'Movie'}</h3>
                                {!isAuthenticated ? (
                                    <button onClick={() => router.push('/login')} className="btn-outline text-xs">Log in to rate</button>
                                ) : (
                                    <div>
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <button key={star} onClick={() => handleRateMovie(star)} disabled={isRating}
                                                    className="text-2xl transition-all duration-200 hover:scale-125"
                                                    style={{ color: userRating && star <= userRating ? '#fbbf24' : '#cbd5e1' }}>
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                        {/* Rating confirmation */}
                                        {ratingSaved && (
                                            <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#10b981' }}>
                                                ✅ Rating saved! ({userRating}/5)
                                            </p>
                                        )}
                                        {userRating && !ratingSaved && (
                                            <p className="text-xs mt-2" style={{ color: '#64748b' }}>Your rating: {userRating}/5</p>
                                        )}
                                        {ratingError && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{ratingError}</p>}
                                    </div>
                                )}
                            </div>

                            {/* Ratings comparison */}
                            <div className="glass-card p-5">
                                <h3 className="text-sm font-bold mb-3" style={{ color: '#1e293b' }}>📊 Ratings</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium" style={{ color: '#475569' }}>TMDB</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                                                <div className="h-full rounded-full" style={{
                                                    width: `${(movie.vote_average / 10) * 100}%`,
                                                    background: movie.vote_average >= 7 ? '#10b981' : movie.vote_average >= 5 ? '#f59e0b' : '#ef4444',
                                                }} />
                                            </div>
                                            <span className="text-xs font-bold" style={{ color: '#334155', minWidth: '28px' }}>{movie.vote_average?.toFixed(1)}</span>
                                        </div>
                                    </div>
                                    {imdbRating && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium" style={{ color: '#475569' }}>IMDb</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(parseFloat(imdbRating) / 10) * 100}%`,
                                                        background: parseFloat(imdbRating) >= 7 ? '#f5c518' : parseFloat(imdbRating) >= 5 ? '#f59e0b' : '#ef4444',
                                                    }} />
                                                </div>
                                                <span className="text-xs font-bold" style={{ color: '#334155', minWidth: '28px' }}>{imdbRating}</span>
                                            </div>
                                        </div>
                                    )}
                                    {userRating && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium" style={{ color: '#475569' }}>Your Rating</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: '#e2e8f0' }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(userRating / 5) * 100}%`,
                                                        background: '#3b82f6',
                                                    }} />
                                                </div>
                                                <span className="text-xs font-bold" style={{ color: '#334155', minWidth: '28px' }}>{userRating}/5</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cast */}
                    {cast.length > 0 && (
                        <section className="mb-8">
                            <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎭 Cast</h2>
                            <div className="flex gap-4 overflow-x-auto pb-2">
                                {cast.map(c => (
                                    <div key={c.id} className="flex-shrink-0 w-[100px] text-center">
                                        {c.profile_path ? (
                                            <Image
                                                src={`https://image.tmdb.org/t/p/w185${c.profile_path}`}
                                                alt={c.name} width={100} height={100}
                                                className="w-[80px] h-[80px] rounded-full mx-auto object-cover mb-2"
                                                style={{ border: '2px solid rgba(255,255,255,0.5)' }}
                                            />
                                        ) : (
                                            <div className="w-[80px] h-[80px] rounded-full mx-auto mb-2 flex items-center justify-center text-xl font-bold"
                                                style={{
                                                    background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
                                                    color: '#fff',
                                                    border: '2px solid rgba(255,255,255,0.5)',
                                                }}>
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <p className="text-xs font-semibold truncate" style={{ color: '#1e293b' }} title={c.name}>{c.name}</p>
                                        <p className="text-xs truncate" style={{ color: '#94a3b8' }} title={c.character}>{c.character}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Recommendations */}
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold" style={{ color: '#1e293b' }}>🎯 Recommendations</h2>
                            {recommendations.length > 0 && (
                                <button onClick={handleGetRecommendations} disabled={isLoadingRecs}
                                    className="btn-outline text-xs px-4 py-2">
                                    🔄 Refresh
                                </button>
                            )}
                        </div>

                        {isLoadingRecs && recommendations.length === 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                    <div key={i} className="aspect-[2/3]">
                                        <SkeletonPulse className="w-full h-full rounded-xl" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {recError && !isLoadingRecs && (
                            <div className="glass-card p-6 text-center">
                                <p className="text-sm mb-3" style={{ color: '#94a3b8' }}>{recError}</p>
                                <button onClick={handleGetRecommendations} className="btn-primary text-xs">
                                    Try Again
                                </button>
                            </div>
                        )}

                        {recommendations.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {recommendations.map(rec => (
                                    <div key={rec.id}>
                                        <MovieCard movie={rec} onClick={() => router.push(`/movies/${rec.id}`)} />
                                    </div>
                                ))}
                            </div>
                        )}

                        {isLoadingRecs && recommendations.length > 0 && (
                            <div className="flex items-center gap-2 mt-4">
                                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                                <span className="text-xs" style={{ color: '#64748b' }}>Refreshing recommendations...</span>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}