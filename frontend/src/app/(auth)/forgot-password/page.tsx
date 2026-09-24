'use client';

import Link from 'next/link';
import { useState } from 'react';
import axios from 'axios';
import { ApiError } from '@/types/api';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        
        setError(null);
        setMessage(null);
        setLoading(true);

        try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
            const response = await axios.post(`${API_BASE_URL}/api/users/forgot-password`, { email });
            setMessage(response.data.message || "If an account exists for this email, a password reset link has been sent.");
        } catch (err) {
            const apiError = err as ApiError;
            // We usually want to show generic message even on errors to prevent enumeration, but network errors should be shown.
            setError(apiError.response?.data?.detail || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
             style={{ background: 'linear-gradient(135deg, #f0f5ff 0%, #dbeafe 30%, #e0ecff 60%, #f0f5ff 100%)' }}>

            <div className="w-full max-w-md">
                <div className="glass-card p-8" style={{ background: 'rgba(255,255,255,0.75)' }}>
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
                             style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                            🔒
                        </div>
                        <h1 className="text-2xl font-bold" style={{ color: '#1e293b' }}>Reset Password</h1>
                        <p className="text-sm mt-1" style={{ color: '#64748b' }}>Enter your email to receive a reset link</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                            {error}
                        </div>
                    )}
                    
                    {message && (
                        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(34,197,94,0.08)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.15)' }}>
                            {message}
                        </div>
                    )}

                    <form className="space-y-5" onSubmit={handleSubmit}>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block" style={{ color: '#374151' }}>Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="name@example.com"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                            disabled={!email || loading}
                        >
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                    </form>

                    <p className="text-center mt-6 text-sm" style={{ color: '#64748b' }}>
                        Remembered your password?{' '}
                        <Link href="/login" className="font-semibold" style={{ color: '#3b82f6' }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
