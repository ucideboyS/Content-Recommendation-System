'use client';

import { useEffect, useState } from 'react';
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
}

interface Genre {
    id: number;
    name: string;
}

interface Person {
    id: number;
    name: string;
    profile_path: string;
}

export default function HomePage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    
    const [recommendedMovies, setRecommendedMovies] = useState<Movie[]>([]);
    const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
    const [favoriteGenres, setFavoriteGenres] = useState<Genre[]>([]);
    const [favoriteActors, setFavoriteActors] = useState<Person[]>([]);
    const [favoriteDirectors, setFavoriteDirectors] = useState<Person[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isInitialized && !token) {
            router.push('/login');
            return;
        }

        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch popular movies from our backend API
                const popularResponse = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/movies/popular`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (!popularResponse.data || !popularResponse.data.results) {
                    throw new Error('Invalid response format from popular movies endpoint');
                }

                setPopularMovies(popularResponse.data.results || []);

                // Fetch user's history to get recommendations
                const historyResponse = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/history`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                // If user has history, fetch recommendations
                if (historyResponse.data && historyResponse.data.length > 0) {
                    try {
                        const recommendedResponse = await axios.get(
                            `${process.env.NEXT_PUBLIC_API_URL}/api/users/recommendations`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        setRecommendedMovies(recommendedResponse.data.recommendations || []);
                    } catch (recommendError) {
                        console.warn('Failed to fetch recommendations:', recommendError);
                    }
                }

                // Fetch favorite genres
                try {
                    const genresResponse = await axios.get(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/genres`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    // Convert string array to genre objects
                    const genres = (genresResponse.data || []).map((name: string, index: number) => ({
                        id: index + 1,
                        name: name
                    }));
                    setFavoriteGenres(genres);
                } catch (genresError) {
                    console.warn('Failed to fetch favorite genres:', genresError);
                }

                // Fetch favorite actors
                try {
                    const actorsResponse = await axios.get(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/actors`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    // Convert string array to person objects
                    const actors = (actorsResponse.data || []).map((name: string, index: number) => ({
                        id: index + 1,
                        name: name,
                        profile_path: '/default-profile.jpg'
                    }));
                    setFavoriteActors(actors);
                } catch (actorsError) {
                    console.warn('Failed to fetch favorite actors:', actorsError);
                }

                // Fetch favorite directors
                try {
                    const directorsResponse = await axios.get(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/directors`,
                        {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    // Convert string array to person objects
                    const directors = (directorsResponse.data || []).map((name: string, index: number) => ({
                        id: index + 1,
                        name: name,
                        profile_path: '/default-profile.jpg'
                    }));
                    setFavoriteDirectors(directors);
                } catch (directorsError) {
                    console.warn('Failed to fetch favorite directors:', directorsError);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                if (axios.isAxiosError(error)) {
                    if (error.response?.status === 401) {
                        useAuthStore.getState().clearAuth();
                        router.push('/login');
                    } else {
                        setError(error.response?.data?.detail || 'Failed to load data');
                    }
                } else {
                    setError('An unexpected error occurred');
                }
            } finally {
                setLoading(false);
            }
        };

        if (isInitialized && token) {
            fetchData();
        }
    }, [isInitialized, token, router]);

    const renderSection = <T,>(
        title: string,
        items: T[],
        renderItem: (item: T) => React.ReactNode,
        emptyMessage?: string
    ) => (
        <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">{title}</h2>
            {items.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {items.map((item) => renderItem(item))}
                </div>
            ) : (
                <p className="text-gray-400">{emptyMessage || 'No items found.'}</p>
            )}
        </section>
    );

    if (!isInitialized || !token) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="text-white p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold mb-8">Welcome to MovieRec</h1>

                {error && (
                    <div className="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                        <p className="text-red-500">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading your personalized content...</p>
                    </div>
                ) : (
                    <>
                        {/* Popular Movies Section */}
                        {renderSection(
                            'Popular Movies',
                            popularMovies,
                            (movie) => (
                                <MovieCard
                                    key={movie.id}
                                    movie={movie}
                                    onClick={() => router.push(`/movies/${movie.id}`)}
                                />
                            )
                        )}

                        {/* Recommended Movies Section */}
                        {renderSection(
                            'Recommended for You',
                            recommendedMovies,
                            (movie) => (
                                <MovieCard
                                    key={movie.id}
                                    movie={movie}
                                    onClick={() => router.push(`/movies/${movie.id}`)}
                                />
                            ),
                            'Start watching movies to get personalized recommendations!'
                        )}

                        {/* Favorite Genres Section */}
                        {renderSection(
                            'Your Favorite Genres',
                            favoriteGenres,
                            (genre) => (
                                <div
                                    key={genre.id}
                                    className="bg-gray-900 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                                    onClick={() => router.push(`/search?genre=${genre.id}`)}
                                >
                                    <h3 className="text-lg font-medium">{genre.name}</h3>
                                </div>
                            ),
                            'No favorite genres yet. Start exploring movies!'
                        )}

                        {/* Favorite Actors Section */}
                        {renderSection(
                            'Your Favorite Actors',
                            favoriteActors,
                            (actor) => (
                                <div
                                    key={actor.id}
                                    className="bg-gray-900 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                                    onClick={() => router.push(`/search?actor=${actor.id}`)}
                                >
                                    <div className="aspect-square mb-3 rounded-lg overflow-hidden">
                                        <Image
                                            src={`https://image.tmdb.org/t/p/w500${actor.profile_path}`}
                                            alt={actor.name}
                                            width={500}
                                            height={750}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <h3 className="text-lg font-medium">{actor.name}</h3>
                                </div>
                            ),
                            'No favorite actors yet. Start watching movies!'
                        )}

                        {/* Favorite Directors Section */}
                        {renderSection(
                            'Your Favorite Directors',
                            favoriteDirectors,
                            (director) => (
                                <div
                                    key={director.id}
                                    className="bg-gray-900 rounded-lg p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                                    onClick={() => router.push(`/search?director=${director.id}`)}
                                >
                                    <div className="aspect-square mb-3 rounded-lg overflow-hidden">
                                        <Image
                                            src={`https://image.tmdb.org/t/p/w500${director.profile_path}`}
                                            alt={director.name}
                                            width={500}
                                            height={750}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <h3 className="text-lg font-medium">{director.name}</h3>
                                </div>
                            ),
                            'No favorite directors yet. Start watching movies!'
                        )}
                    </>
                )}
            </div>
        </div>
    );
} 