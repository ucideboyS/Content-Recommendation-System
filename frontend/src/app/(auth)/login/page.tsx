'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { loginUser } from '@/lib/api';
import { ApiError } from '@/types/api';

export default function Login() {
    const [loginData, setLoginData] = useState({ username: '', password: '' });
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const { setToken, setUser } = useAuthStore();

    useEffect(() => {
        setButtonDisabled(!(loginData.username && loginData.password));
    }, [loginData]);

    const loginHandler = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginData.username || !loginData.password) return;
        setError(null);

        try {
            setLoading(true);
            const data = await loginUser(loginData);
            if (data.access_token) {
                localStorage.setItem('token', data.access_token);
                setToken(data.access_token);
                setUser({
                    id: 0,
                    username: loginData.username,
                    email: '',
                    favorite_genres: [],
                    favorite_actors: [],
                    favorite_directors: []
                });
                window.location.href = '/';
            }
        } catch (err) {
            const apiError = err as ApiError;
            if (apiError.response?.status === 404) {
                setError('No account found. Try signing up.');
            } else if (apiError.response?.status === 401) {
                setError('Invalid username or password.');
            } else {
                setError('Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
             style={{ background: 'linear-gradient(135deg, #f0f5ff 0%, #dbeafe 30%, #e0ecff 60%, #f0f5ff 100%)' }}>

            <div className="w-full max-w-md">
                {/* Glass card */}
                <div className="glass-card p-8" style={{ background: 'rgba(255,255,255,0.75)' }}>

                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
                             style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                            🎬
                        </div>
                        <h1 className="text-2xl font-bold" style={{ color: '#1e293b' }}>Welcome back</h1>
                        <p className="text-sm mt-1" style={{ color: '#64748b' }}>Sign in to your MovieRec account</p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                            {error}
                        </div>
                    )}

                    <form className="space-y-5" onSubmit={loginHandler}>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#374151' }}>Username</label>
                            <input
                                type="text"
                                value={loginData.username}
                                onChange={e => setLoginData({ ...loginData, username: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="Enter your username"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#374151' }}>Password</label>
                            <input
                                type="password"
                                value={loginData.password}
                                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="••••••••"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                            disabled={buttonDisabled || loading}
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </form>

                    <p className="text-center mt-6 text-sm" style={{ color: '#64748b' }}>
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="font-semibold" style={{ color: '#3b82f6' }}>
                            Sign up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
