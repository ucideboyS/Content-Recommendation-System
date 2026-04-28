'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface Movie {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
}

// TMDB Genre IDs for kid-friendly content
const KIDS_GENRE_IDS = {
    animation: 16,
    family: 10751,
    fantasy: 14,
};

export default function KidsPage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);

    const [animationMovies, setAnimationMovies] = useState<Movie[]>([]);
    const [familyMovies, setFamilyMovies] = useState<Movie[]>([]);
    const [fantasyMovies, setFantasyMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isInitialized && !token) {
            router.push('/login');
            return;
        }

        const fetchKidsMovies = async () => {
            try {
                setLoading(true);
                setError(null);

                const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;

                // Fetch animation movies
                const [animRes, familyRes, fantasyRes] = await Promise.all([
                    axios.get(
                        `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.animation}&certification_country=US&certification.lte=PG&page=1`
                    ),
                    axios.get(
                        `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.family}&certification_country=US&certification.lte=PG&page=1`
                    ),
                    axios.get(
                        `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.animation},${KIDS_GENRE_IDS.fantasy}&certification_country=US&certification.lte=PG&page=1`
                    ),
                ]);

                setAnimationMovies(animRes.data.results?.slice(0, 10) || []);
                setFamilyMovies(familyRes.data.results?.slice(0, 10) || []);
                setFantasyMovies(fantasyRes.data.results?.slice(0, 10) || []);
            } catch (err) {
                console.error('Error fetching kids movies:', err);
                setError('Failed to load kids movies. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        if (isInitialized && token) {
            fetchKidsMovies();
        }
    }, [isInitialized, token, router]);

    if (!isInitialized || !token) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
                    <p className="text-white">Loading...</p>
                </div>
            </div>
        );
    }

    const renderSection = (
        title: string,
        emoji: string,
        movies: Movie[],
        bgGradient: string
    ) => (
        <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{emoji}</span>
                <h2 className="text-2xl font-bold">{title}</h2>
            </div>
            {movies.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {movies.map((movie) => (
                        <div key={movie.id} className="group">
                            <div className={`rounded-xl p-[2px] ${bgGradient} transition-all duration-300 group-hover:shadow-lg group-hover:shadow-purple-500/20`}>
                                <MovieCard
                                    movie={movie}
                                    onClick={() => router.push(`/movies/${movie.id}`)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-400">No movies found in this category.</p>
            )}
        </section>
    );

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-950/20 to-gray-900 text-white">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 bg-clip-text text-transparent">
                        🧸 Kids Zone
                    </h1>
                    <p className="text-lg text-gray-300 max-w-2xl mx-auto">
                        Fun, safe, and family-friendly movies for kids of all ages! Discover animated adventures, heartwarming family films, and magical fantasy worlds.
                    </p>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg text-center">
                        <p className="text-red-500">{error}</p>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-16">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto mb-6"></div>
                        <p className="text-gray-400 text-lg">Loading fun movies for you... 🎬</p>
                    </div>
                ) : (
                    <>
                        {renderSection(
                            'Animated Adventures',
                            '🎨',
                            animationMovies,
                            'bg-gradient-to-r from-blue-500 to-purple-500'
                        )}

                        {renderSection(
                            'Family Favorites',
                            '👨‍👩‍👧‍👦',
                            familyMovies,
                            'bg-gradient-to-r from-pink-500 to-yellow-500'
                        )}

                        {renderSection(
                            'Magical Fantasy',
                            '✨',
                            fantasyMovies,
                            'bg-gradient-to-r from-green-500 to-blue-500'
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
