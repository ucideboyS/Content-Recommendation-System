'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface Movie {
    id: number;
    title: string;
    poster_path: string;
    vote_average: number;
}

export default function HistoryPage() {
    const [history, setHistory] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    const router = useRouter();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                // Check if we have a valid token
                if (!token) {
                    console.log('No token found, redirecting to login...');
                    router.push('/login');
                    return;
                }

                setLoading(true);
                setError(null);

                // Log the token being used (first 10 characters for security)
                console.log('Using token:', token.substring(0, 10) + '...');

                // Fetch user's history
                console.log('Fetching user history...');
                const response = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/history`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log('History response:', response.data);

                if (!response.data || !Array.isArray(response.data)) {
                    console.error('Invalid history response format:', response.data);
                    setError('Invalid history data received from server');
                    setHistory([]);
                    return;
                }

                if (response.data.length === 0) {
                    console.log('No history items found');
                    setHistory([]);
                    return;
                }

                // Convert history items directly to movies
                const movies: Movie[] = response.data.map(item => ({
                    id: item.id,
                    title: item.title,
                    poster_path: item.poster_path.replace('https://image.tmdb.org/t/p/w500', ''),
                    vote_average: 0 // We don't have this in the history response
                }));

                console.log('Processed movies:', movies);
                setHistory(movies);

                if (movies.length === 0) {
                    setError('No movies found in your history.');
                }
            } catch (error) {
                console.error('Error fetching history:', error);
                if (axios.isAxiosError(error)) {
                    if (error.response?.status === 401) {
                        console.log('Token expired or invalid, redirecting to login...');
                        // Clear the invalid token
                        useAuthStore.getState().clearAuth();
                        setError('Your session has expired. Please log in again.');
                        router.push('/login');
                    } else {
                        const errorMessage = error.response?.data?.detail || error.message;
                        console.error('Detailed error:', errorMessage);
                        setError(`Failed to load history: ${errorMessage}`);
                    }
                } else {
                    setError('An unexpected error occurred. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        // Only fetch if we're initialized and have a token
        if (isInitialized) {
            if (!token) {
                router.push('/login');
            } else {
                fetchHistory();
            }
        }
    }, [isInitialized, token, router]);

    // Show loading state while initializing
    if (!isInitialized) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white">Initializing...</p>
                </div>
            </div>
        );
    }

    // Show nothing while redirecting to login
    if (!token) {
        return null;
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Your Movie History</h1>

                {error && (
                    <div className="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                        <p className="text-red-500">{error}</p>
                        <div className="mt-4 flex gap-4">
                            <button
                                onClick={() => {
                                    if (token) {
                                        setLoading(true);
                                        setError(null);
                                        window.location.reload();
                                    } else {
                                        router.push('/login');
                                    }
                                }}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                {token ? 'Try Again' : 'Login'}
                            </button>
                            <button
                                onClick={() => router.push('/search')}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Search Movies
                            </button>
                        </div>
                    </div>
                )}

                {loading && (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading your movie history...</p>
                    </div>
                )}

                {!loading && history.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {history.map((movie) => (
                            <MovieCard 
                                key={movie.id}
                                movie={movie}
                                onClick={() => router.push(`/movies/${movie.id}`)}
                            />
                        ))}
                    </div>
                )}

                {!loading && history.length === 0 && !error && (
                    <div className="text-center py-12">
                        <p className="text-gray-400 text-lg mb-4">No movies in your history yet.</p>
                        <button
                            onClick={() => router.push('/search')}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Search Movies
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
} 