'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import axios from 'axios';

const NAV_ITEMS = [
    { href: '/', icon: '🏠', label: 'Browse' },
    { href: '/search', icon: '🔍', label: 'Search' },
    { href: '/wishlist', icon: '❤️', label: 'Wishlist' },
    { href: '/coming-soon', icon: '🕐', label: 'Coming Soon' },
    { href: '/trailers', icon: '🎬', label: 'Trailers' },
    { href: '/kids', icon: '🧸', label: 'Kids' },
    { href: '/history', icon: '📖', label: 'History' },
    { href: '/profile', icon: '👤', label: 'Profile' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { token, clearAuth } = useAuthStore();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = async () => {
        try {
            if (token) {
                await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/logout`,
                    {},
                    { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
                );
            }
            await clearAuth();
            router.push('/login');
        } catch {
            await clearAuth();
            router.push('/login');
        }
    };

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/';
        return pathname.startsWith(path);
    };

    return (
        <>
            {/* Mobile top bar */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4"
                 style={{ background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(20px)' }}>
                <button onClick={() => setCollapsed(!collapsed)} className="text-white text-xl p-1">
                    {collapsed ? '✕' : '☰'}
                </button>
                <span className="text-white font-bold text-lg">
                    <span style={{ color: '#60a5fa' }}>Movie</span>Rec
                </span>
                <div className="w-8" />
            </div>

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out
                    ${collapsed ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
                style={{
                    width: '240px',
                    background: 'rgba(15, 23, 42, 0.95)',
                    backdropFilter: 'blur(20px)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {/* Logo */}
                <div className="h-16 flex items-center px-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Link href="/" className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
                        <span style={{ color: '#60a5fa' }}>Movie</span>Rec
                    </Link>
                </div>

                {/* Nav items */}
                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setCollapsed(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                                ${isActive(item.href)
                                    ? 'text-white'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                            style={isActive(item.href) ? {
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.08))',
                                borderLeft: '3px solid #3b82f6',
                                boxShadow: '0 0 12px rgba(59, 130, 246, 0.15)',
                            } : {
                                borderLeft: '3px solid transparent',
                            }}
                        >
                            <span className="text-lg">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                {/* Bottom section */}
                <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {token ? (
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 transition-colors duration-200"
                            style={{ background: 'rgba(239, 68, 68, 0.08)' }}
                        >
                            <span className="text-lg">🚪</span>
                            <span>Logout</span>
                        </button>
                    ) : (
                        <Link
                            href="/login"
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                        >
                            Login
                        </Link>
                    )}
                </div>
            </aside>

            {/* Mobile overlay */}
            {collapsed && (
                <div
                    className="lg:hidden fixed inset-0 z-30 bg-black/50"
                    onClick={() => setCollapsed(false)}
                />
            )}
        </>
    );
}
