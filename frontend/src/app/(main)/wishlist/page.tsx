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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        fetchWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const fetchWishlist = async () => {
        setLoading(true);
        try {
            const resp = await axios.get(`${API_URL}/api/wishlist`, {
                headers: { Authorization: `Bearer ${token}` },
            });
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

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>❤️ My Wishlist</h1>
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
                    {items.map((item) => item.poster_path && (
                        <div key={`${item.tmdb_id}-${item.media_type}`} className="animate-fadeIn relative group">
                            <MovieCard
                                movie={{ id: item.tmdb_id, title: item.title, poster_path: item.poster_path, vote_average: item.vote_average, media_type: item.media_type }}
                                onClick={() => router.push(`/movies/${item.tmdb_id}`)}
                            />
                            <button
                                onClick={(e) => { e.stopPropagation(); removeItem(item.tmdb_id, item.media_type); }}
                                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs z-20"
                                style={{ background: 'rgba(239,68,68,0.9)', color: 'white', backdropFilter: 'blur(4px)' }}
                                title="Remove from wishlist"
                            >✕</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
