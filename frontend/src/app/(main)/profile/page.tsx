'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Profile {
    username: string;
    email: string;
    favorite_genres: string[];
    favorite_actors: string[];
    favorite_directors: string[];
    preferred_language?: string;
    preferred_content_type?: string;
    preferred_regional_languages?: string[];
    preferred_movie_genres?: string[];
    preferred_series_genres?: string[];
    preferred_release_era?: string;
}

const LANGUAGES = [
    { code: 'hi', name: 'Hindi' },
    { code: 'en', name: 'English' },
    { code: 'mr', name: 'Marathi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'kn', name: 'Kannada' },
    { code: 'bn', name: 'Bengali' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'gu', name: 'Gujarati' },
];

interface Genre { id: number; name: string; }

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [genres, setGenres] = useState<Genre[]>([]);
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    const router = useRouter();

    useEffect(() => { if (isInitialized && !token) router.push('/login'); }, [isInitialized, token, router]);

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        Promise.all([
            axios.get(`${API_URL}/api/users/profile`, { headers }),
            axios.get(`${API_URL}/api/users/favorites/genres`, { headers }),
        ]).then(([profileRes, genresRes]) => {
            setProfile(profileRes.data);
            const genreList = genresRes.data.genres || [];
            setGenres(genreList.map((name: string, i: number) => ({ id: i, name })));
        }).catch(() => setError('Failed to load profile'))
          .finally(() => setLoading(false));
    }, [token]);

    const updateAllPreferences = async () => {
        setError(null); setSuccess(null); setLoading(true);
        try {
            await axios.put(`${API_URL}/api/users/preferences`, {
                favorite_genres: profile?.favorite_genres.filter(s => s.trim()),
                favorite_actors: profile?.favorite_actors.filter(s => s.trim()),
                favorite_directors: profile?.favorite_directors.filter(s => s.trim()),
                preferred_language: profile?.preferred_language || null,
                preferred_content_type: profile?.preferred_content_type || null,
                preferred_regional_languages: profile?.preferred_regional_languages || [],
                preferred_movie_genres: profile?.preferred_movie_genres || [],
                preferred_series_genres: profile?.preferred_series_genres || [],
                preferred_release_era: profile?.preferred_release_era || null
            }, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setSuccess(`Preferences updated successfully`);
        } catch { setError(`Failed to update preferences`); }
        finally { setLoading(false); }
    };

    if (!isInitialized || !token || (loading && !profile)) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <p style={{ color: '#ef4444' }}>Failed to load profile</p>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>👤 Profile Settings</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Manage your preferences for better recommendations</p>

            {/* Alerts */}
            {error && (
                <div className="glass-card p-3 mb-4" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)' }}>
                    <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
                </div>
            )}
            {success && (
                <div className="glass-card p-3 mb-4" style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.15)' }}>
                    <p className="text-sm" style={{ color: '#10b981' }}>✅ {success}</p>
                </div>
            )}

            {/* User info */}
            <div className="glass-card p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                         style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
                        {profile.username[0]?.toUpperCase()}
                    </div>
                    <div>
                        <h2 className="font-bold text-lg" style={{ color: '#1e293b' }}>{profile.username}</h2>
                        <p className="text-sm" style={{ color: '#64748b' }}>{profile.email}</p>
                    </div>
                </div>
            </div>

            {/* Favorite Genres */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎭 Favorite Genres</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {genres.map((genre) => {
                        const isSelected = profile.favorite_genres.includes(genre.name);
                        return (
                            <button key={genre.id}
                                onClick={() => {
                                    const newGenres = isSelected
                                        ? profile.favorite_genres.filter(g => g !== genre.name)
                                        : [...profile.favorite_genres, genre.name];
                                    setProfile({ ...profile, favorite_genres: newGenres });
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={isSelected ? {
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08))',
                                    border: '2px solid #3b82f6',
                                    color: '#3b82f6',
                                } : {
                                    background: 'rgba(241,245,249,0.8)',
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    color: '#64748b',
                                }}>
                                {genre.name}
                            </button>
                        );
                    })}
                </div>
                <button onClick={updateAllPreferences}
                    disabled={loading} className="btn-primary text-xs">Save Genres</button>
            </div>

            {/* Favorite Actors */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🌟 Favorite Actors</h2>
                <div className="space-y-3 mb-4">
                    {profile.favorite_actors.map((actor, i) => (
                        <div key={i} className="flex gap-2">
                            <input type="text" value={actor}
                                onChange={e => {
                                    const arr = [...profile.favorite_actors]; arr[i] = e.target.value;
                                    setProfile({ ...profile, favorite_actors: arr });
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="Actor name"
                            />
                            <button onClick={() => {
                                setProfile({ ...profile, favorite_actors: profile.favorite_actors.filter((_, idx) => idx !== i) });
                            }} className="px-3 py-2 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setProfile({ ...profile, favorite_actors: [...profile.favorite_actors, ''] })}
                        className="btn-outline text-xs">+ Add Actor</button>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Actors</button>
                </div>
            </div>

            {/* Favorite Directors */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎬 Favorite Directors</h2>
                <div className="space-y-3 mb-4">
                    {profile.favorite_directors.map((director, i) => (
                        <div key={i} className="flex gap-2">
                            <input type="text" value={director}
                                onChange={e => {
                                    const arr = [...profile.favorite_directors]; arr[i] = e.target.value;
                                    setProfile({ ...profile, favorite_directors: arr });
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="Director name"
                            />
                            <button onClick={() => {
                                setProfile({ ...profile, favorite_directors: profile.favorite_directors.filter((_, idx) => idx !== i) });
                            }} className="px-3 py-2 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setProfile({ ...profile, favorite_directors: [...profile.favorite_directors, ''] })}
                        className="btn-outline text-xs">+ Add Director</button>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Directors</button>
                </div>
            </div>

            {/* Language Preference */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🌐 Language Preference</h2>
                <p className="text-sm mb-4" style={{ color: '#64748b' }}>Select your preferred language for localized recommendations.</p>
                <div className="flex gap-2">
                    <select 
                        value={profile.preferred_language || ""}
                        onChange={e => setProfile({ ...profile, preferred_language: e.target.value || undefined })}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                    >
                        <option value="">None (Default)</option>
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Language</button>
                </div>
            </div>

            {/* Content Type & Era Preferences */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>📺 Content Preferences</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm mb-2" style={{ color: '#64748b' }}>Preferred Content Type</label>
                        <select 
                            value={profile.preferred_content_type || ""}
                            onChange={e => setProfile({ ...profile, preferred_content_type: e.target.value || undefined })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                        >
                            <option value="">Both (Default)</option>
                            <option value="movie">Movies</option>
                            <option value="tv">Web Series</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-2" style={{ color: '#64748b' }}>Preferred Release Era</label>
                        <select 
                            value={profile.preferred_release_era || ""}
                            onChange={e => setProfile({ ...profile, preferred_release_era: e.target.value || undefined })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                        >
                            <option value="">Any Era</option>
                            <option value="2020s">2020s (Current)</option>
                            <option value="2010s">2010s</option>
                            <option value="2000s">2000s</option>
                            <option value="classic">Classic (Pre-2000)</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs w-full text-center justify-center">Save All Preferences</button>
                </div>
            </div>
        </div>
    );
}