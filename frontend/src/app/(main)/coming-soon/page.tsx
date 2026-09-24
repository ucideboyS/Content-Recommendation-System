'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface MediaItem {
    id: number;
    title: string;
    overview: string;
    poster_path: string;
    vote_average: number;
    release_date: string;
    media_type: 'movie' | 'tv';
    genre_ids?: number[];
}

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function ComingSoonPage() {
    const router = useRouter();
    const [upcomingMovies, setUpcomingMovies] = useState<MediaItem[]>([]);
    const [upcomingTv, setUpcomingTv] = useState<MediaItem[]>([]);
    const [nowInTheatres, setNowInTheatres] = useState<MediaItem[]>([]);
    const [upcomingTheatres, setUpcomingTheatres] = useState<MediaItem[]>([]);
    const [upcomingHindiMovies, setUpcomingHindiMovies] = useState<MediaItem[]>([]);
    const [upcomingHindiTv, setUpcomingHindiTv] = useState<MediaItem[]>([]);
    const [onAirTv, setOnAirTv] = useState<MediaItem[]>([]);
    const [theatricalForYou, setTheatricalForYou] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const today = new Date().toISOString().split('T')[0];
                const EXCLUDED_TV_GENRES = new Set([10763, 10764, 10767, 10762, 10766]);

                const [movieUp, tvAir, movieNow, discoverUpTheatres, discoverUpTv, hindiMoviesUp, hindiTvUp] = await Promise.all([
                    axios.get(`https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_release_type=2|3&primary_release_date.gte=${today}&sort_by=popularity.desc&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&first_air_date.gte=${today}&sort_by=popularity.desc&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_original_language=hi&primary_release_date.gte=${today}&sort_by=primary_release_date.asc&page=1`),
                    axios.get(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_original_language=hi&first_air_date.gte=${today}&sort_by=first_air_date.asc&page=1`)
                ]);

                const fmtMovie = (m: any): MediaItem => ({ ...m, title: m.title || m.name, media_type: 'movie', release_date: m.release_date || '' });
                const fmtTv = (t: any): MediaItem => ({ ...t, title: t.name || t.title, media_type: 'tv', release_date: t.first_air_date || '' });

                const sortUpcoming = (a: MediaItem, b: MediaItem) => {
                    if (!a.release_date) return 1;
                    if (!b.release_date) return -1;
                    if (a.release_date === b.release_date) return (b.vote_average || 0) - (a.vote_average || 0);
                    return a.release_date.localeCompare(b.release_date);
                };

                let upMovies = (movieUp.data.results || []).map(fmtMovie).filter((m: MediaItem) => m.poster_path && m.title && m.release_date > today).sort(sortUpcoming);
                
                let airTv = (tvAir.data.results || []).map(fmtTv).filter((t: MediaItem) => {
                    const hasExcluded = t.genre_ids?.some((id: number) => EXCLUDED_TV_GENRES.has(id));
                    return !hasExcluded && t.poster_path && t.title;
                });

                let nowTheatres = (movieNow.data.results || []).map(fmtMovie).filter((m: MediaItem) => m.poster_path && m.title && m.release_date <= today);

                let upTheatres = (discoverUpTheatres.data.results || []).map(fmtMovie).filter((m: MediaItem) => m.poster_path && m.title && m.release_date > today).sort(sortUpcoming);

                let upTv = (discoverUpTv.data.results || []).map(fmtTv).filter((t: MediaItem) => {
                    const hasExcluded = t.genre_ids?.some((id: number) => EXCLUDED_TV_GENRES.has(id));
                    return !hasExcluded && t.poster_path && t.title && t.release_date > today;
                }).sort(sortUpcoming);

                let upHindiMovies = (hindiMoviesUp.data.results || []).map(fmtMovie).filter((m: MediaItem) => m.poster_path && m.title && m.release_date > today).sort(sortUpcoming);
                
                let upHindiTv = (hindiTvUp.data.results || []).map(fmtTv).filter((t: MediaItem) => {
                    const hasExcluded = t.genre_ids?.some((id: number) => EXCLUDED_TV_GENRES.has(id));
                    return !hasExcluded && t.poster_path && t.title && t.release_date > today;
                }).sort(sortUpcoming);

                setUpcomingMovies(upMovies);
                setOnAirTv(airTv);
                setNowInTheatres(nowTheatres);
                setUpcomingTheatres(upTheatres);
                setUpcomingTv(upTv);
                setUpcomingHindiMovies(upHindiMovies);
                setUpcomingHindiTv(upHindiTv);

                const token = localStorage.getItem('token');
                if (token) {
                    try {
                        const profileRes = await axios.get(`${API_URL}/api/users/profile`, { headers: { Authorization: `Bearer ${token}` } });
                        const prefLang = profileRes.data.preferred_language || 'en';
                        const ranked = [...nowTheatres].sort((a, b) => {
                            let scoreA = a.vote_average;
                            let scoreB = b.vote_average;
                            if ((a as any).original_language === prefLang) scoreA += 5;
                            if ((b as any).original_language === prefLang) scoreB += 5;
                            return scoreB - scoreA;
                        });
                        const forYou = ranked.slice(0, 6);
                        setTheatricalForYou(forYou);
                        
                        const forYouIds = new Set(forYou.map((m: MediaItem) => m.id));
                        setNowInTheatres(nowTheatres.filter((m: MediaItem) => !forYouIds.has(m.id)));
                    } catch { }
                }
            } catch (err) {
                console.error('Failed to fetch:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const renderBadge = (date: string, type: 'upcoming' | 'theatrical' | 'airing') => {
        if (type === 'theatrical') return { text: '🎟 IN THEATRES', style: { background: 'rgba(236,72,153,0.1)', color: '#ec4899' } };
        if (type === 'airing') return { text: '🔴 ON AIR', style: { background: 'rgba(239,68,68,0.1)', color: '#ef4444' } };
        
        if (!date) return { text: 'COMING SOON', style: { background: 'rgba(59,130,246,0.1)', color: '#3b82f6' } };
        
        const diff = new Date(date).getTime() - Date.now();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        if (days <= 0) return { text: 'OUT NOW', style: { background: 'rgba(34,197,94,0.1)', color: '#22c55e' } };
        if (days <= 7) return { text: '🔜 THIS WEEK', style: { background: 'rgba(249,115,22,0.1)', color: '#f97316' } };
        if (days <= 30) return { text: `🔜 ${days} DAYS TO GO`, style: { background: 'rgba(59,130,246,0.1)', color: '#3b82f6' } };
        
        return { text: 'COMING SOON', style: { background: 'rgba(100,116,139,0.1)', color: '#64748b' } };
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    const Section = ({ title, emoji, data, type }: { title: string, emoji: string, data: MediaItem[], type: 'upcoming' | 'theatrical' | 'airing' }) => {
        if (!data || data.length === 0) return null;
        return (
            <div className="mb-10">
                <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">{emoji}</span>
                    <h2 className="text-lg font-bold" style={{ color: '#1e293b' }}>{title}</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {data.slice(0, 6).map((item) => {
                        const badge = renderBadge(item.release_date, type);
                        return (
                            <div key={item.id} className="animate-fadeIn">
                                <MovieCard
                                    movie={item}
                                    onClick={() => router.push(`/movies/${item.id}`)}
                                />
                                <div className="mt-2 text-center">
                                    <div className="text-[10px] sm:text-xs font-bold px-1 py-1 rounded"
                                        style={{ ...badge.style, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                                        {type === 'upcoming' && item.release_date && (
                                            <span>📅 {new Date(item.release_date).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                                        )}
                                        <span>{badge.text}</span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="mt-8 border-b border-slate-200" />
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen max-w-7xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: '#1e293b' }}>Discovery & Coming Soon</h1>
            <p className="text-sm mb-8" style={{ color: '#64748b' }}>Explore upcoming content and currently airing/playing titles.</p>

            <Section title="In Theatres For You" emoji="🎯" data={theatricalForYou} type="theatrical" />
            <Section title="Now In Theatres" emoji="🎟" data={nowInTheatres} type="theatrical" />
            <Section title="Upcoming In Theatres" emoji="🔜" data={upcomingTheatres} type="upcoming" />
            <Section title="Upcoming Movies" emoji="🎬" data={upcomingMovies} type="upcoming" />
            <Section title="Upcoming Hindi Movies" emoji="🇮🇳" data={upcomingHindiMovies} type="upcoming" />
            <Section title="Upcoming TV Series" emoji="📺" data={upcomingTv} type="upcoming" />
            <Section title="Upcoming Hindi Series" emoji="🇮🇳" data={upcomingHindiTv} type="upcoming" />
            <Section title="On The Air" emoji="🔴" data={onAirTv} type="airing" />
        </div>
    );
}
