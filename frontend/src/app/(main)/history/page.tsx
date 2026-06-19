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
                if (!token) { router.push('/login'); return; }

                const response = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/history`,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                );

                const historyData = response.data || [];
                const moviesWithDetails = await Promise.all(
                    historyData.map(async (item: { title: string; movie_id?: number }) => {
                        try {
                            const tmdbResponse = await axios.get(
                                `https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(item.title)}&page=1`
                            );
                            const matchedMovie = tmdbResponse.data.results[0];
                            if (matchedMovie) {
                                return {
                                    id: matchedMovie.id,
                                    title: matchedMovie.title,
                                    poster_path: matchedMovie.poster_path,
                                    vote_average: matchedMovie.vote_average,
                                };
                            }
                            return null;
                        } catch { return null; }
                    })
                );

                setHistory(moviesWithDetails.filter(Boolean) as Movie[]);
            } catch (err) {
                console.error('Error fetching history:', err);
                setError('Failed to load history');
            } finally {
                setLoading(false);
            }
        };

        if (isInitialized) fetchHistory();
    }, [isInitialized, token, router]);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>📖 Watch History</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Movies you&apos;ve browsed recently</p>

            {error && (
                <div className="glass-card p-4 mb-6" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
                    <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
                </div>
            )}

            {history.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <span className="text-5xl mb-4 block">📭</span>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#1e293b' }}>No history yet</h3>
                    <p className="text-sm mb-4" style={{ color: '#64748b' }}>Start exploring movies to build your history</p>
                    <button onClick={() => router.push('/')} className="btn-primary">Browse Movies</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {history.map((movie) => movie.poster_path && (
                        <div key={movie.id} className="animate-fadeIn">
                            <MovieCard movie={movie} onClick={() => router.push(`/movies/${movie.id}`)} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}