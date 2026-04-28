'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface Movie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
}

interface SearchMovieResponse {
    adult: boolean;
    backdrop_path: string;
    genre_ids: number[];
    id: number;
    original_language: string;
    original_title: string;
    overview: string;
    popularity: number;
    poster_path: string;
    release_date: string;
    title: string;
    video: boolean;
    vote_average: number;
    vote_count: number;
}

export default function SearchPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    const router = useRouter();

    useEffect(() => {
        if (isInitialized && !token) {
            router.push('/login');
        }
    }, [isInitialized, token, router]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        try {
            setLoading(true);
            setError(null);
            setSearchResults([]); // Clear previous results

            const searchResponse = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/search/movie`,
                {
                    params: { query: searchQuery },
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (searchResponse.data && searchResponse.data.results) {
                const movies = searchResponse.data.results.map((movie: SearchMovieResponse) => ({
                    id: movie.id,
                    title: movie.title,
                    overview: movie.overview,
                    poster_path: movie.poster_path,
                    vote_average: movie.vote_average
                }));
                setSearchResults(movies);
            }
        } catch (error) {
            console.error('Error in search:', error);
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    setError('Your session has expired. Please log in again.');
                    router.push('/login');
                } else {
                    setError(`Search failed: ${error.response?.data?.detail || error.message}`);
                }
            } else {
                setError('An unexpected error occurred. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

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
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Search Movies</h1>

                <form onSubmit={handleSearch} className="mb-8">
                    <div className="flex gap-4">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Enter a movie title (e.g., Interstellar)"
                            className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                </form>

                {error && (
                    <div className="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                        <p className="text-red-500">{error}</p>
                    </div>
                )}

                {loading && (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Searching for movies...</p>
                    </div>
                )}

                {!loading && searchResults.length > 0 && (
                    <section>
                        <h2 className="text-2xl font-semibold mb-6">Search Results</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {searchResults.map((movie) => (
                                <MovieCard 
                                    key={movie.id}
                                    movie={movie}
                                    onClick={() => router.push(`/movies/${movie.id}`)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {!loading && searchResults.length === 0 && searchQuery && (
                    <p className="text-gray-400 text-center py-8">
                        No movies found. Try searching for a different movie.
                    </p>
                )}
            </div>
        </div>
    );
} 