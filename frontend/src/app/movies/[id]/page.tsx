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
}

interface Recommendation {
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

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
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [aiInsightLoading, setAiInsightLoading] = useState(false);
    const [inWishlist, setInWishlist] = useState(false);
    const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');

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
                if (isAuthenticated) {
                    storeMovieHistory(Number(id));
                    fetchAiInsight(resp.data);
                    checkWishlist('movie');
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
                    if (isAuthenticated) {
                        storeMovieHistory(Number(id));
                        fetchAiInsight(tvData);
                        checkWishlist('tv');
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

    // AI Insight
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

    // Recommendations
    const handleGetRecommendations = async () => {
        if (!isAuthenticated) { router.push('/login'); return; }
        if (!movie?.id) return;
        setIsLoadingRecs(true);
        setRecError(null);
        try {
            const token = localStorage.getItem('token');
            const resp = await axios.get(`${API_URL}/api/recommend/by-id/${movie.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const recs = (resp.data?.recommendations || []).filter((r: Recommendation) => r?.poster_path);
            setRecommendations(recs);
            if (!recs.length) setRecError('No similar movies found.');
        } catch {
            setRecError('Failed to get recommendations.');
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
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/api/users/movies/${id}/rate`, { rating }, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setUserRating(rating);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setRatingError(axiosErr.response?.data?.detail || 'Failed to rate');
        } finally {
            setIsRating(false);
        }
    };

    const trailer = movie?.videos?.results?.find(v => v.type === 'Trailer' && v.official && v.site === 'YouTube');
    const director = movie?.credits?.crew?.find(c => c.job === 'Director');
    const cast = movie?.credits?.cast?.slice(0, 8) || [];

    // ---------------------------------------------------------------
    // LOADING STATE
    // ---------------------------------------------------------------
    if (isLoading) {
        return (
            <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f0f5ff, #e0ecff)' }}>
                <Sidebar />
                <div className="lg:ml-[240px] pt-14 lg:pt-0 flex items-center justify-center min-h-screen">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                        <p style={{ color: '#64748b' }}>Loading movie details...</p>
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
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.6) 60%, rgba(15,23,42,0.3) 100%)' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(240,245,255,1) 0%, transparent 40%)' }} />

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
                                <span className="badge" style={{ background: mediaType === 'tv' ? 'rgba(192,132,252,0.2)' : 'rgba(96,165,250,0.2)', color: mediaType === 'tv' ? '#c084fc' : '#60a5fa' }}>
                                    {mediaType === 'tv' ? '📺 TV Show' : '🎥 Movie'}
                                </span>
                                <span className="badge" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }}>
                                    ⭐ {movie.vote_average?.toFixed(1)}
                                </span>
                                {movie.release_date && (
                                    <span className="text-slate-300 text-xs">{new Date(movie.release_date).getFullYear()}</span>
                                )}
                                {movie.runtime > 0 && <span className="text-slate-300 text-xs">{movie.runtime} min</span>}
                                {mediaType === 'tv' && movie.number_of_seasons && (
                                    <span className="text-slate-300 text-xs">{movie.number_of_seasons} Season{movie.number_of_seasons > 1 ? 's' : ''}</span>
                                )}
                                {movie.genres?.map(g => (
                                    <span key={g.id} className="badge badge-movie">{g.name}</span>
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

                    {/* Overview + AI Insight */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        <div className="lg:col-span-2">
                            <div className="glass-card p-6">
                                <h2 className="text-lg font-bold mb-3" style={{ color: '#1e293b' }}>Overview</h2>
                                <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{movie.overview}</p>
                                {director && (
                                    <p className="text-sm mt-3" style={{ color: '#64748b' }}>
                                        <strong>Director:</strong> {director.name}
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            {/* AI Insight */}
                            <div className="glass-card p-5 mb-4" style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.15)' }}>
                                <h3 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: '#8b5cf6' }}>
                                    🧠 AI Insight
                                </h3>
                                {aiInsightLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                                        <span className="text-xs" style={{ color: '#94a3b8' }}>Generating...</span>
                                    </div>
                                ) : aiInsight ? (
                                    <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>{aiInsight}</p>
                                ) : (
                                    <p className="text-xs" style={{ color: '#94a3b8' }}>No insight available</p>
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
                                                    className="text-2xl transition-transform hover:scale-110"
                                                    style={{ color: userRating && star <= userRating ? '#fbbf24' : '#cbd5e1' }}>
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                        {userRating && <p className="text-xs mt-2" style={{ color: '#64748b' }}>You rated {userRating}/5</p>}
                                        {ratingError && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{ratingError}</p>}
                                    </div>
                                )}
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
                                            <div className="w-[80px] h-[80px] rounded-full mx-auto mb-2 flex items-center justify-center text-2xl"
                                                style={{ background: 'rgba(0,0,0,0.05)' }}>👤</div>
                                        )}
                                        <p className="text-xs font-semibold" style={{ color: '#1e293b' }}>{c.name}</p>
                                        <p className="text-xs" style={{ color: '#94a3b8' }}>{c.character}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Recommendations */}
                    <section className="mb-8">
                        <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎯 Recommendations</h2>
                        <button onClick={handleGetRecommendations} disabled={isLoadingRecs}
                            className="btn-primary mb-4 flex items-center gap-2">
                            {isLoadingRecs ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Finding similar movies...
                                </>
                            ) : 'Get Recommendations'}
                        </button>
                        {recError && <p className="text-sm mb-3" style={{ color: '#ef4444' }}>{recError}</p>}
                        {recommendations.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {recommendations.map(rec => (
                                    <div key={rec.id} className="animate-fadeIn">
                                        <MovieCard movie={rec} onClick={() => router.push(`/movies/${rec.id}`)} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}