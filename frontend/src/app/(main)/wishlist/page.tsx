'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import axios from 'axios';
import MovieCard from '@/components/ui/MovieCard';

interface WishlistItem {
    id: number;
    tmdb_id: number;
    media_type: string;
    title: string;
    overview: string;
    poster_path: string | null;
    vote_average: number;
    release_date: string;
    added_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function WishlistPage() {
    const router = useRouter();
    const token = useAuthStore(state => state.token);
    const [items, setItems] = useState<WishlistItem[]>([]);
    const [reminders, setReminders] = useState<WishlistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [nowPlayingIds, setNowPlayingIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!token) return;
        fetchWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const fetchWishlist = async () => {
        setLoading(true);
        try {
            const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
            const [resp, remindersResp, np1, np2, np3] = await Promise.all([
                axios.get(`${API_URL}/api/wishlist`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                axios.get(`${API_URL}/api/reminders`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(() => ({ data: [] })),
                axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&page=1`).catch(() => ({ data: { results: [] } })),
                axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&page=2`).catch(() => ({ data: { results: [] } })),
                axios.get(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&page=3`).catch(() => ({ data: { results: [] } }))
            ]);
            
            const ids = new Set<number>();
            [np1, np2, np3].forEach(res => {
                res.data.results?.forEach((m: any) => ids.add(m.id));
            });
            setNowPlayingIds(ids);
            
            const today = new Date().toISOString().split('T')[0];
            
            // Filter out expired reminders and sort ascending
            const activeReminders = (remindersResp.data || [])
                .filter((r: any) => r.release_date && r.release_date > today)
                .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));
            
            setReminders(activeReminders);
            setItems(resp.data?.wishlist || []);
        } catch (err) {
            console.error('Failed to fetch wishlist:', err);
        } finally {
            setLoading(false);
        }
    };

    const removeItem = async (tmdb_id: number, media_type: string) => {
        try {
            await axios.delete(`${API_URL}/api/wishlist/remove`, {
                data: { tmdb_id, media_type },
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setItems(prev => prev.filter(i => !(i.tmdb_id === tmdb_id && i.media_type === media_type)));
        } catch (err) {
            console.error('Failed to remove:', err);
        }
    };

    const removeReminder = async (tmdb_id: number, media_type: string) => {
        try {
            await axios.delete(`${API_URL}/api/reminders/${tmdb_id}?media_type=${media_type}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setReminders(prev => prev.filter(i => !(i.tmdb_id === tmdb_id && i.media_type === media_type)));
        } catch (err) {
            console.error('Failed to remove reminder:', err);
        }
    };

    const getStatusBadge = (date: string, type: string, tmdb_id: number) => {
        if (type === 'tv' || !date) return null;
        const today = new Date().toISOString().split('T')[0];
        const diffDays = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        
        if (date > today) {
            const d = Math.ceil(diffDays);
            return { text: `📅 Releases in ${d} days`, bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' };
        } else if (nowPlayingIds.has(tmdb_id)) {
            return { text: '🎟 NOW IN THEATRES', bg: 'rgba(236,72,153,0.1)', color: '#ec4899', isTheatrical: true };
        }
        return null;
    };

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            {/* REMINDERS SECTION */}
            <div className="mb-12">
                <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>🔔 Reminders</h1>
                <p className="text-sm mb-6" style={{ color: '#64748b' }}>Movies and shows you are waiting for</p>
                
                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                ) : reminders.length === 0 ? (
                    <div className="glass-card p-12 text-center bg-slate-50 border-slate-200">
                        <span className="text-4xl mb-3 block">🔔</span>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: '#1e293b' }}>No reminders yet</h3>
                        <p className="text-sm mb-4" style={{ color: '#64748b' }}>Set a reminder on an upcoming movie or series and it will appear here.</p>
                        <button onClick={() => router.push('/coming-soon')} className="btn-primary py-2 px-6 shadow-sm">Explore Coming Soon</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {reminders.map((item) => {
                            if (!item.poster_path) return null;
                            const diffDays = (new Date(item.release_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                            const d = Math.ceil(diffDays);
                            const countdown = d === 1 ? 'Tomorrow' : d === 0 ? 'Releases today' : `Releases in ${d} days`;
                            return (
                            <div key={`rem-${item.tmdb_id}-${item.media_type}`} className="animate-fadeIn relative group flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/movies/${item.tmdb_id}`)}>
                                <div className="relative aspect-[2/3] w-full">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="p-3 flex flex-col flex-grow">
                                    <h3 className="font-bold text-sm truncate" style={{ color: '#1e293b' }}>{item.title}</h3>
                                    <span className="text-xs font-semibold mt-1" style={{ color: '#3b82f6' }}>{countdown}</span>
                                    <div className="mt-auto pt-3 flex flex-col gap-2">
                                        <div className="w-full text-center py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-600 border border-green-200">
                                            ✓ Reminder Set
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); removeReminder(item.tmdb_id, item.media_type); }}
                                            className="w-full text-center py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                                        >
                                            Remove Reminder
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                )}
            </div>

            {/* WATCHLIST SECTION */}
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>❤️ My Watchlist</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Movies and shows you want to watch</p>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : items.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <span className="text-5xl mb-4 block">💫</span>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#1e293b' }}>Your wishlist is empty</h3>
                    <p className="text-sm mb-4" style={{ color: '#64748b' }}>Browse movies and add them here to watch later</p>
                    <button onClick={() => router.push('/')} className="btn-primary">Browse Movies</button>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {items.map((item) => {
                        if (!item.poster_path) return null;
                        const badge = getStatusBadge(item.release_date, item.media_type, item.tmdb_id);
                        return (
                        <div key={`${item.tmdb_id}-${item.media_type}`} className="animate-fadeIn relative group">
                            <MovieCard
                                movie={{ id: item.tmdb_id, title: item.title, poster_path: item.poster_path, vote_average: item.vote_average, media_type: item.media_type }}
                                onClick={() => router.push(`/movies/${item.tmdb_id}`)}
                            />
                            {badge && (
                                <div className="mt-2 text-center">
                                    <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: badge.bg, color: badge.color, display: 'inline-block', width: '100%' }}>
                                        {badge.text}
                                    </span>
                                    {badge.isTheatrical && (
                                        <button className="text-[10px] font-semibold underline mt-1" style={{ color: badge.color }} 
                                        onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/search?q=${encodeURIComponent(`${item.title} movie showtimes tickets`)}`, '_blank'); }}>
                                            Find Showtimes
                                        </button>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); removeItem(item.tmdb_id, item.media_type); }}
                                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-20 shadow-md"
                                style={{ background: 'rgba(239,68,68,0.9)', color: 'white', backdropFilter: 'blur(4px)' }}
                                title="Remove from wishlist"
                            >✕</button>
                        </div>
                    )})}
                </div>
            )}
        </div>
    );
}
