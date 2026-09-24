'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { registerUser } from '@/lib/api';
import { ApiError } from '@/types/api';
import Image from 'next/image';

const LottieAnimation = dynamic(() => import('@/components/ui/loginDynamicLottie'), {
    ssr: false,
});

const GENRES = [
    'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama',
    'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance',
    'Science Fiction', 'TV Movie', 'Thriller', 'War', 'Western'
];

export default function Signup() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        favorite_genres: [] as string[],
        favorite_actors: '',
        favorite_directors: ''
    });

    const handleGenreToggle = (genre: string) => {
        setFormData(prev => ({
            ...prev,
            favorite_genres: prev.favorite_genres.includes(genre)
                ? prev.favorite_genres.filter(g => g !== genre)
                : [...prev.favorite_genres, genre]
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Convert comma-separated strings to arrays
            const actors = formData.favorite_actors.split(',').map(actor => actor.trim()).filter(Boolean);
            const directors = formData.favorite_directors.split(',').map(director => director.trim()).filter(Boolean);

            await registerUser({
                ...formData,
                favorite_actors: actors,
                favorite_directors: directors
            });

            alert('Registration successful! Please login.');
            router.push('/login');
        } catch (error) {
            const apiError = error as ApiError;
            alert(apiError.response?.data?.detail || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignup = () => {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        window.location.href = `${API_BASE_URL}/api/users/auth/google/login`;
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
             style={{ background: 'linear-gradient(135deg, #f0f5ff 0%, #dbeafe 30%, #e0ecff 60%, #f0f5ff 100%)' }}>

            <div className="w-full max-w-lg my-8">
                {/* Glass card */}
                <div className="glass-card p-8" style={{ background: 'rgba(255,255,255,0.75)' }}>

                    {/* Logo */}
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
                             style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                            🎬
                        </div>
                        <h1 className="text-2xl font-bold" style={{ color: '#1e293b' }}>Create Account</h1>
                        <p className="text-sm mt-1" style={{ color: '#64748b' }}>Sign up to MovieRec</p>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignup}
                        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all mb-5 flex items-center justify-center"
                        style={{ background: 'white', border: '1px solid #e2e8f0', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>

                    <div className="relative flex items-center py-2 mb-4">
                        <div className="flex-grow border-t border-gray-200"></div>
                        <span className="flex-shrink-0 mx-4 text-sm" style={{ color: '#94a3b8' }}>Or sign up with email</span>
                        <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Username</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Password</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Favorite Genres</label>
                            <div className="grid grid-cols-3 gap-2 mt-2 h-40 overflow-y-auto p-1">
                                {GENRES.map(genre => (
                                    <button
                                        key={genre}
                                        type="button"
                                        onClick={() => handleGenreToggle(genre)}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            formData.favorite_genres.includes(genre)
                                                ? 'bg-blue-500 text-white shadow-sm'
                                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {genre}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Favorite Actors <span className="text-xs text-gray-400 font-normal">(comma-separated)</span></label>
                            <input
                                type="text"
                                value={formData.favorite_actors}
                                onChange={e => setFormData({ ...formData, favorite_actors: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="e.g., Tom Cruise, Brad Pitt"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1 block" style={{ color: '#374151' }}>Favorite Directors <span className="text-xs text-gray-400 font-normal">(comma-separated)</span></label>
                            <input
                                type="text"
                                value={formData.favorite_directors}
                                onChange={e => setFormData({ ...formData, favorite_directors: e.target.value })}
                                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="e.g., Christopher Nolan"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all mt-4 disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                            disabled={loading}
                        >
                            {loading ? 'Creating Account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="flex justify-center mt-6 text-sm" style={{ color: '#64748b' }}>
                        <span>Already have an account? <Link href="/login" className="font-semibold" style={{ color: '#3b82f6' }}>Sign in</Link></span>
                    </div>
                </div>
            </div>
        </div>
    );
}
