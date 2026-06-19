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

const KIDS_GENRE_IDS = { animation: 16, family: 10751, fantasy: 14 };

export default function KidsPage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);

    const [animationMovies, setAnimationMovies] = useState<Movie[]>([]);
    const [familyMovies, setFamilyMovies] = useState<Movie[]>([]);
    const [fantasyMovies, setFantasyMovies] = useState<Movie[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isInitialized && !token) { router.push('/login'); return; }

        const fetchKidsMovies = async () => {
            try {
                setLoading(true);
                const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
                const [animRes, familyRes, fantasyRes] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.animation}&certification_country=US&certification.lte=PG&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.family}&certification_country=US&certification.lte=PG&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&language=en-US&sort_by=popularity.desc&with_genres=${KIDS_GENRE_IDS.animation},${KIDS_GENRE_IDS.fantasy}&certification_country=US&certification.lte=PG&page=1`),
                ]);
                setAnimationMovies(animRes.data.results?.slice(0, 10) || []);
                setFamilyMovies(familyRes.data.results?.slice(0, 10) || []);
                setFantasyMovies(fantasyRes.data.results?.slice(0, 10) || []);
            } catch (err) {
                console.error('Error fetching kids movies:', err);
            } finally {
                setLoading(false);
            }
        };

        if (isInitialized && token) fetchKidsMovies();
    }, [isInitialized, token, router]);

    const renderSection = (title: string, emoji: string, movies: Movie[], accentColor: string) => (
        <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{emoji}</span>
                <h2 className="text-lg font-bold" style={{ color: '#1e293b' }}>{title}</h2>
            </div>
            {movies.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {movies.map((movie) => (
                        <div key={movie.id} className="animate-fadeIn">
                            <div className="rounded-xl p-[2px] transition-all duration-300 hover:shadow-lg"
                                style={{ background: `linear-gradient(135deg, ${accentColor}40, ${accentColor}10)` }}>
                                <MovieCard movie={movie} onClick={() => router.push(`/movies/${movie.id}`)} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p style={{ color: '#94a3b8' }}>No movies found in this category.</p>
            )}
        </section>
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                    <p style={{ color: '#64748b' }}>Loading fun movies... 🎬</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            {/* Hero */}
            <div className="text-center mb-10 glass-card p-8" style={{
                background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(236,72,153,0.06), rgba(251,191,36,0.06))'
            }}>
                <h1 className="text-3xl font-extrabold mb-3"
                    style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    🧸 Kids Zone
                </h1>
                <p className="text-sm max-w-xl mx-auto" style={{ color: '#64748b' }}>
                    Fun, safe, and family-friendly movies for kids of all ages!
                </p>
            </div>

            {renderSection('Animated Adventures', '🎨', animationMovies, '#8b5cf6')}
            {renderSection('Family Favorites', '👨‍👩‍👧‍👦', familyMovies, '#ec4899')}
            {renderSection('Magical Fantasy', '✨', fantasyMovies, '#10b981')}
        </div>
    );
}
