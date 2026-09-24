'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { loginUser, exchangeOAuthCode } from '@/lib/api';
import { ApiError } from '@/types/api';
import axios from 'axios';

export default function Login() {
    const [loginData, setLoginData] = useState({ username: '', password: '' });
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 2FA state
    const [requires2FA, setRequires2FA] = useState(false);
    const [temp2FAToken, setTemp2FAToken] = useState<string | null>(null);
    const [authCode, setAuthCode] = useState('');
    const [isRecoveryCode, setIsRecoveryCode] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const { setToken, setUser } = useAuthStore();

    useEffect(() => {
        setButtonDisabled(!(loginData.username && loginData.password));
    }, [loginData]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const oauthCode = urlParams.get('oauth_code');
        if (oauthCode) {
            setLoading(true);
            exchangeOAuthCode(oauthCode)
                .then((data) => {
                    if (data.requires_2fa) {
                        setRequires2FA(true);
                        setTemp2FAToken(data['2fa_token']);
                    } else if (data.access_token) {
                        localStorage.setItem('token', data.access_token);
                        document.cookie = `token=${data.access_token}; path=/`;
                        setToken(data.access_token);
                        setUser({
                            id: 0,
                            username: '', // Would need to decode token, but this is fine for now
                            email: '',
                            favorite_genres: [],
                            favorite_actors: [],
                            favorite_directors: []
                        });
                        window.location.href = '/';
                    }
                })
                .catch((err) => {
                    const apiError = err as ApiError;
                    setError(apiError.response?.data?.detail || 'OAuth login failed.');
                })
                .finally(() => {
                    setLoading(false);
                    // Remove oauth_code from URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
        }
    }, [setToken, setUser]);

    const loginHandler = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (requires2FA) {
            // Handle 2FA verification
            if (!authCode) return;
            setError(null);
            try {
                setLoading(true);
                const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
                const response = await axios.post(`${API_BASE_URL}/api/users/login/verify-2fa`, {
                    token: temp2FAToken,
                    code: authCode,
                    is_recovery_code: isRecoveryCode
                });
                
                if (response.data.access_token) {
                    localStorage.setItem('token', response.data.access_token);
                    document.cookie = `token=${response.data.access_token}; path=/`;
                    setToken(response.data.access_token);
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
                setError(apiError.response?.data?.detail || 'Invalid code.');
            } finally {
                setLoading(false);
            }
            return;
        }

        // Handle initial login
        if (!loginData.username || !loginData.password) return;
        setError(null);

        try {
            setLoading(true);
            const data = await loginUser(loginData);
            if (data.requires_2fa) {
                setRequires2FA(true);
                setTemp2FAToken(data['2fa_token']);
            } else if (data.access_token) {
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

                    {!requires2FA ? (
                        <>
                            <button
                                type="button"
                                onClick={() => window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/users/auth/google/login`}
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
                                <span className="flex-shrink-0 mx-4 text-sm" style={{ color: '#94a3b8' }}>Or sign in with email</span>
                                <div className="flex-grow border-t border-gray-200"></div>
                            </div>

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
                    </>
                    ) : (
                    <form className="space-y-5" onSubmit={loginHandler}>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#374151' }}>
                                {isRecoveryCode ? 'Recovery Code' : 'Authenticator Code'}
                            </label>
                            <input
                                type="text"
                                value={authCode}
                                onChange={e => setAuthCode(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder={isRecoveryCode ? "Enter recovery code" : "6-digit code"}
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                            disabled={!authCode || loading}
                        >
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>
                        
                        <div className="text-center mt-4">
                            <button 
                                type="button" 
                                onClick={() => setIsRecoveryCode(!isRecoveryCode)}
                                className="text-sm font-semibold" 
                                style={{ color: '#3b82f6' }}>
                                {isRecoveryCode ? 'Use Authenticator App' : 'Use a recovery code'}
                            </button>
                        </div>
                    </form>
                    )}

                    {!requires2FA && (
                        <>
                            <div className="flex justify-between items-center mt-6 text-sm" style={{ color: '#64748b' }}>
                                <span>Don&apos;t have an account? <Link href="/signup" className="font-semibold" style={{ color: '#3b82f6' }}>Sign up</Link></span>
                                <Link href="/forgot-password" className="font-semibold" style={{ color: '#3b82f6' }}>Forgot Password?</Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
