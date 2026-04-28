'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import Navbar from '@/components/ui/Navbar';

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
            published_at: string;
        }>;
    };
    userRating?: number;
}

interface Recommendation {
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
}

const RatingComponent = ({ 
    isAuthenticated, 
    userRating, 
    isRating, 
    ratingError, 
    onRateMovie, 
    onLogin 
}: { 
    isAuthenticated: boolean;
    userRating: number | null;
    isRating: boolean;
    ratingError: string | null;
    onRateMovie: (rating: number) => void;
    onLogin: () => void;
}) => {
    if (!isAuthenticated) {
        return (
            <div className="mb-6">
                <p className="text-gray-300 mb-2">Please log in to rate this movie.</p>
                <button
                    onClick={onLogin}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none"
                >
                    Log In
                </button>
            </div>
        );
    }

    return (
        <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Rate this Movie</h3>
            <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => onRateMovie(star)}
                        disabled={isRating}
                        className={`text-2xl focus:outline-none transition-colors ${
                            userRating && star <= userRating
                                ? 'text-yellow-400'
                                : 'text-gray-400 hover:text-yellow-400'
                        }`}
                    >
                        ★
                    </button>
                ))}
                {userRating && (
                    <span className="ml-2 text-gray-300">
                        You rated {userRating} stars
                    </span>
                )}
            </div>
            {ratingError && (
                <p className="mt-2 text-red-500 text-sm">{ratingError}</p>
            )}
            {isRating && (
                <p className="mt-2 text-gray-400 text-sm">Rating...</p>
            )}
        </div>
    );
};

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

    const storeMovieHistory = useCallback(async (tmdbId: number) => {
        if (!isAuthenticated) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setIsAuthenticated(false);
                return;
            }

            await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/history`,
                { tmdb_movie_id: tmdbId },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );            
        } catch (err) {
            console.error('Error storing movie history:', err);
            if (axios.isAxiosError(err) && err.response?.status === 401) {
                localStorage.removeItem('token');
                setIsAuthenticated(false);
                router.push('/login');
            }
        }
    }, [isAuthenticated, router]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsAuthenticated(!!token);
    }, []);

    useEffect(() => {
        const fetchMovieDetails = async () => {
            try {
                setIsLoading(true);
                const response = await axios.get(
                    `https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&append_to_response=credits,videos,production_companies`
                );
                setMovie(response.data);
                if (isAuthenticated && response.data?.id) {
                    await storeMovieHistory(Number(id));
                }
            } catch (err) {
                console.error('Error fetching movie details:', err);
                setError('Failed to load movie details');
            } finally {
                setIsLoading(false);
            }
        };

        fetchMovieDetails();
    }, [id, isAuthenticated, storeMovieHistory]);

    const handleGetRecommendations = async () => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }
    
        if (!movie?.title) {
            setRecError('Movie data is still loading. Please try again.');
            return;
        }

        try {
            setIsLoadingRecs(true);
            setRecError(null);
            setRecommendations([]);
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');
            
            // First store in history
            await storeMovieHistory(movie.id);
    
            // Then get recommendations from our ML model
            const response = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/api/recommend/`,
                {
                    params: { 
                        movie: movie.title.trim() 
                    },
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
    
            if (response.data?.recommendations && response.data.recommendations.length > 0) {
                // Fetch full movie details for each recommendation
                const fullRecommendations = await Promise.all(
                    response.data.recommendations.map(async (movieTitle: string) => {
                        try {
                            const tmdbResponse = await axios.get(
                                `https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(movieTitle)}&page=1`
                            );
                            
                            const matchedMovie = tmdbResponse.data.results[0];
                            if (matchedMovie) {
                                return {
                                    id: matchedMovie.id,
                                    title: matchedMovie.title,
                                    poster_path: matchedMovie.poster_path,
                                    vote_average: matchedMovie.vote_average
                                };
                            }
                            return null;
                        } catch (err) {
                            console.error(`Error fetching details for ${movieTitle}:`, err);
                            return null;
                        }
                    })
                );

                const validRecs = fullRecommendations.filter((rec): rec is Recommendation => rec !== null);
                setRecommendations(validRecs);
                
                if (validRecs.length === 0) {
                    setRecError('Could not find poster details for the recommended movies. Try another movie.');
                }
            } else {
                setRecError('No recommendations available for this movie. Try another movie.');
            }
        } catch (err) {
            console.error('Recommendation error:', err);
            if (axios.isAxiosError(err)) {
                if (err.response?.status === 404) {
                    setRecError('This movie is not in our recommendation database. Try another movie.');
                } else if (err.response?.status === 401) {
                    setRecError('Your session has expired. Please log in again.');
                    router.push('/login');
                } else {
                    setRecError(err.response?.data?.detail || 'Failed to get recommendations. Please try another movie.');
                }
            } else {
                setRecError('Failed to get recommendations. Please try another movie.');
            }
        } finally {
            setIsLoadingRecs(false);
        }
    };

    const getOfficialTrailer = () => {
        if (!movie?.videos?.results) return null;
        return movie.videos.results.find(
            video => video.type === 'Trailer' && video.official && video.site === 'YouTube'
        );
    };

    const fetchUserRating = useCallback(async () => {
        if (!isAuthenticated) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/movies/${id}/rating`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data?.rating !== null) {
                setUserRating(response.data.rating);
            }
        } catch (err) {
            console.error('Error fetching user rating:', err);
        }
    }, [id, isAuthenticated]);

    const handleRateMovie = async (rating: number) => {
        if (!isAuthenticated) {
            router.push('/login');
            return;
        }

        try {
            setIsRating(true);
            setRatingError(null);
            const token = localStorage.getItem('token');
            if (!token) throw new Error('No authentication token found');

            await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/movies/${id}/rate`,
                { rating },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setUserRating(rating);
        } catch (err) {
            console.error('Error rating movie:', err);
            if (axios.isAxiosError(err)) {
                setRatingError(err.response?.data?.detail || 'Failed to rate movie');
            } else {
                setRatingError('Failed to rate movie');
            }
        } finally {
            setIsRating(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchUserRating();
        }
    }, [id, isAuthenticated, fetchUserRating]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 text-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading movie details...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !movie) {
        return (
            <div className="min-h-screen bg-gray-900 text-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
                    <div className="text-center">
                        <p className="text-xl text-red-500 mb-4">{error || 'Movie not found'}</p>
                        <button
                            onClick={() => router.back()}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const trailer = getOfficialTrailer();

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            <Navbar />
            
            {/* Hero Section */}
            <div className="relative h-[60vh] w-full">
                <Image
                    src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
                    alt={movie.title}
                    fill
                    className="object-cover"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                    <div className="max-w-7xl mx-auto">
                        <h1 className="text-4xl font-bold mb-4">{movie.title}</h1>
                        <p className="text-xl text-gray-300 mb-4">{movie.tagline}</p>
                        <div className="flex gap-4 text-sm text-gray-300">
                            <span>{new Date(movie.release_date).getFullYear()}</span>
                            <span>•</span>
                            <span>{movie.runtime} minutes</span>
                            <span>•</span>
                            <span>{movie.vote_average.toFixed(1)} / 10 ({movie.vote_count} votes)</span>
                        </div>
                        {trailer && (
                            <button
                                onClick={() => setShowTrailer(true)}
                                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none flex items-center gap-2"
                            >
                                <span>▶</span> Watch Trailer
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Trailer Modal */}
            {showTrailer && trailer && (
                <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4">
                    <div className="relative w-full max-w-4xl">
                        <button
                            onClick={() => setShowTrailer(false)}
                            className="absolute -top-12 right-0 text-white text-2xl hover:text-gray-300"
                        >
                            ✕
                        </button>
                        <div className="relative pt-[56.25%]">
                            <iframe
                                src={`https://www.youtube.com/embed/${trailer.key}`}
                                className="absolute inset-0 w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Content Section */}
            <div className="max-w-7xl mx-auto px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Movie Poster */}
                    <div className="md:col-span-1">
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden">
                            <Image
                                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                                alt={movie.title}
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>

                    {/* Movie Details */}
                    <div className="md:col-span-2">
                        <RatingComponent 
                            isAuthenticated={isAuthenticated}
                            userRating={userRating}
                            isRating={isRating}
                            ratingError={ratingError}
                            onRateMovie={handleRateMovie}
                            onLogin={() => router.push('/login')}
                        />
                        <h2 className="text-2xl font-bold mb-4">Overview</h2>
                        <p className="text-gray-300 mb-6">{movie.overview}</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Movie Info</h3>
                                <div className="space-y-2 text-gray-300">
                                    <p key="status"><span className="font-medium">Status:</span> {movie.status}</p>
                                    <p key="release"><span className="font-medium">Release Date:</span> {new Date(movie.release_date).toLocaleDateString()}</p>
                                    <p key="runtime"><span className="font-medium">Runtime:</span> {movie.runtime} minutes</p>
                                    <p key="budget"><span className="font-medium">Budget:</span> ${movie.budget?.toLocaleString() || 'N/A'}</p>
                                    <p key="revenue"><span className="font-medium">Revenue:</span> ${movie.revenue?.toLocaleString() || 'N/A'}</p>
                                    <p key="language"><span className="font-medium">Language:</span> {movie.original_language.toUpperCase()}</p>
                                    <p key="popularity"><span className="font-medium">Popularity:</span> {movie.popularity.toFixed(1)}</p>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold mb-2">Genres</h3>
                                <div className="flex flex-wrap gap-2">
                                    {movie.genres.map((genre) => (
                                        <span
                                            key={genre.id}
                                            className="px-3 py-1 bg-blue-600 rounded-full text-sm"
                                        >
                                            {genre.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {movie.production_companies.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold mb-2">Production Companies</h3>
                                <div className="flex flex-wrap gap-4">
                                    {movie.production_companies.map((company) => (
                                        <div key={company.id} className="flex items-center gap-2">
                                            {company.logo_path && (
                                                <Image
                                                    src={`https://image.tmdb.org/t/p/w92${company.logo_path}`}
                                                    alt={company.name}
                                                    width={40}
                                                    height={40}
                                                    className="rounded"
                                                />
                                            )}
                                            <span className="text-gray-300">{company.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <h2 className="text-2xl font-bold mb-4">Get Recommendations</h2>
                        {!isAuthenticated ? (
                            <div className="mb-6">
                                <p className="text-gray-300 mb-4">Please log in to get personalized recommendations.</p>
                                <button
                                    onClick={() => router.push('/login')}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none"
                                >
                                    Log In
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleGetRecommendations}
                                    disabled={isLoadingRecs}
                                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none flex items-center gap-2 disabled:opacity-50 w-fit transition-colors"
                                >
                                    {isLoadingRecs ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                            Getting Recommendations...
                                        </>
                                    ) : (
                                        <>
                                            <span>🎯</span> Get Recommendations Based on This Movie
                                        </>
                                    )}
                                </button>
                                {recError && (
                                    <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg">
                                        <p className="text-red-500">{recError}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Recommendations */}
                {recommendations.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-2xl font-bold mb-6">Recommended Movies</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {recommendations
                                .filter(rec => rec && rec.id)
                                .map((rec) => (
                                <div
                                    key={`rec-${rec.id}`}
                                    className="relative aspect-[2/3] rounded-lg overflow-hidden group cursor-pointer"
                                    onClick={async () => {
                                        if (isAuthenticated) await storeMovieHistory(rec.id);
                                        router.push(`/movies/${rec.id}`);
                                    }}
                                >
                                    <Image
                                        src={`https://image.tmdb.org/t/p/w500${rec.poster_path}`}
                                        alt={`Movie poster for ${rec.title}`}
                                        fill
                                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <div className="absolute bottom-0 left-0 right-0 p-4">
                                            <h3 className="text-lg font-semibold mb-2">{rec.title}</h3>
                                            <p className="text-sm text-yellow-400">
                                                Rating: {rec.vote_average ? rec.vote_average.toFixed(1) : 'N/A'} / 10
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}