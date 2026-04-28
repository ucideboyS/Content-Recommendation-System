'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export default function Navigation() {
    const pathname = usePathname();
    const token = useAuthStore(state => state.token);
    const clearAuth = useAuthStore(state => state.clearAuth);

    if (!token) return null;

    const handleLogout = () => {
        localStorage.removeItem('token');
        clearAuth();
    };

    const isActive = (path: string) => pathname === path;

    return (
        <nav className="bg-gray-900 text-white p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                <div className="flex space-x-6">
                    <Link
                        href="/"
                        className={`hover:text-gray-300 transition-colors ${
                            isActive('/') ? 'text-blue-400' : ''
                        }`}
                    >
                        Home
                    </Link>
                    <Link
                        href="/search"
                        className={`hover:text-gray-300 transition-colors ${
                            isActive('/search') ? 'text-blue-400' : ''
                        }`}
                    >
                        Search
                    </Link>
                    <Link
                        href="/history"
                        className={`hover:text-gray-300 transition-colors ${
                            isActive('/history') ? 'text-blue-400' : ''
                        }`}
                    >
                        History
                    </Link>
                    <Link
                        href="/profile"
                        className={`hover:text-gray-300 transition-colors ${
                            isActive('/profile') ? 'text-blue-400' : ''
                        }`}
                    >
                        Profile
                    </Link>
                </div>
                <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                    Logout
                </button>
            </div>
        </nav>
    );
} 