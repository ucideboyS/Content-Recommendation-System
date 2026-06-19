'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';


interface UpcomingMovie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
    backdrop_path?: string;
}

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export default function ComingSoonPage() {
    const router = useRouter();
    const [movies, setMovies] = useState<UpcomingMovie[]>([]);
    const [tvShows, setTvShows] = useState<UpcomingMovie[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUpcoming = async () => {
            setLoading(true);
            try {
                const [movieRes, tvRes] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_KEY}&language=en-US&page=1`),
                ]);
                setMovies((movieRes.data.results || []).map((m: UpcomingMovie) => ({
                    ...m,
                    media_type: 'movie',
                })));
                setTvShows((tvRes.data.results || []).map((t: UpcomingMovie & { name?: string; first_air_date?: string }) => ({
                    ...t, title: t.name || t.title, release_date: t.first_air_date || t.release_date
                })));
            } catch (err) {
                console.error('Failed to fetch upcoming:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchUpcoming();
    }, []);

    const getDaysUntil = (date: string) => {
        const diff = new Date(date).getTime() - Date.now();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days > 0 ? `${days} days` : 'Released';
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>🕐 Coming Soon</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Upcoming movies and TV shows</p>

            {/* Upcoming Movies */}
            <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎬 Upcoming Movies</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-10">
                {movies.filter(m => m.poster_path).slice(0, 18).map((movie) => (
                    <div key={movie.id} className="animate-fadeIn">
                        <MovieCard
                            movie={movie}
                            onClick={() => router.push(`/movies/${movie.id}`)}
                        />
                        <div className="mt-2 px-1">
                            <span className="text-xs font-semibold px-2 py-1 rounded-full"
                                style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                🗓 {movie.release_date ? getDaysUntil(movie.release_date) : 'TBA'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Upcoming TV */}
            <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>📺 On The Air</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {tvShows.filter(m => m.poster_path).slice(0, 12).map((show) => (
                    <div key={show.id} className="animate-fadeIn">
                        <MovieCard
                            movie={{ ...show, media_type: 'tv' }}
                            onClick={() => router.push(`/movies/${show.id}`)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
