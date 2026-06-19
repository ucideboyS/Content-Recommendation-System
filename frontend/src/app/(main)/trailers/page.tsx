'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Image from 'next/image';

interface Video {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    published_at: string;
}

interface TrailerMovie {
    id: number;
    title: string;
    poster_path: string;
    videos: Video[];
}

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export default function TrailersPage() {
    const [trailers, setTrailers] = useState<TrailerMovie[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);

    useEffect(() => {
        const fetchTrailers = async () => {
            setLoading(true);
            try {
                // Get now playing movies
                const res = await axios.get(
                    `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&page=1`
                );
                const movies = res.data.results || [];

                // Fetch videos for each (limit 12)
                const withVideos = await Promise.all(
                    movies.slice(0, 12).map(async (m: TrailerMovie & { id: number; title: string; poster_path: string }) => {
                        try {
                            const vidRes = await axios.get(
                                `https://api.themoviedb.org/3/movie/${m.id}/videos?api_key=${TMDB_KEY}&language=en-US`
                            );
                            const vids = (vidRes.data.results || []).filter(
                                (v: Video) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
                            );
                            return { id: m.id, title: m.title, poster_path: m.poster_path, videos: vids };
                        } catch {
                            return { id: m.id, title: m.title, poster_path: m.poster_path, videos: [] };
                        }
                    })
                );

                setTrailers(withVideos.filter(m => m.videos.length > 0));
            } catch (err) {
                console.error('Failed to fetch trailers:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchTrailers();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>🎬 Latest Trailers</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Watch the newest movie trailers</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {trailers.map((movie) => {
                    const trailer = movie.videos[0];
                    const isPlaying = playingId === trailer.key;

                    return (
                        <div key={movie.id} className="glass-card overflow-hidden animate-fadeIn">
                            <div className="relative aspect-video">
                                {isPlaying ? (
                                    <iframe
                                        src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1`}
                                        className="w-full h-full"
                                        allow="autoplay; encrypted-media"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div
                                        className="relative w-full h-full cursor-pointer group"
                                        onClick={() => setPlayingId(trailer.key)}
                                    >
                                        <Image
                                            src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`}
                                            alt={trailer.name}
                                            width={640}
                                            height={360}
                                            className="w-full h-full object-cover"
                                            unoptimized
                                        />
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                                            <div className="w-16 h-16 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                                                style={{ background: 'rgba(59,130,246,0.9)', backdropFilter: 'blur(4px)' }}>
                                                <span className="text-white text-2xl ml-1">▶</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-4">
                                <h3 className="font-semibold text-sm" style={{ color: '#1e293b' }}>{movie.title}</h3>
                                <p className="text-xs mt-1" style={{ color: '#64748b' }}>{trailer.name}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
