'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function Navbar() {
    const pathname = usePathname();
    const { token, clearAuth } = useAuthStore();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            if (token) {
                await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/logout`,
                    {},
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            }
            await clearAuth();
            router.push('/login');
        } catch (error) {
            console.error('Error during logout:', error);
            await clearAuth();
            router.push('/login');
        }
    };

    const isActive = (path: string) => pathname === path;

    return (
        <nav className="bg-gray-900 border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Link href="/" className="text-white font-bold text-xl">
                            MovieRec
                        </Link>
                    </div>

                    <div className="hidden md:flex items-center space-x-4">
                        <Link
                            href="/"
                            className={`px-3 py-2 rounded-md text-sm font-medium ${
                                isActive('/') 
                                    ? 'bg-gray-800 text-white' 
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                        >
                            Home
                        </Link>
                        <Link
                            href="/search"
                            className={`px-3 py-2 rounded-md text-sm font-medium ${
                                isActive('/search') 
                                    ? 'bg-gray-800 text-white' 
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                        >
                            Search
                        </Link>
                        <Link
                            href="/history"
                            className={`px-3 py-2 rounded-md text-sm font-medium ${
                                isActive('/history') 
                                    ? 'bg-gray-800 text-white' 
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                        >
                            History
                        </Link>
                        <Link
                            href="/kids"
                            className={`px-3 py-2 rounded-md text-sm font-medium ${
                                isActive('/kids') 
                                    ? 'bg-purple-700 text-white' 
                                    : 'text-gray-300 hover:bg-purple-700/50 hover:text-white'
                            }`}
                        >
                            🧸 Kids
                        </Link>
                        <Link
                            href="/profile"
                            className={`px-3 py-2 rounded-md text-sm font-medium ${
                                isActive('/profile') 
                                    ? 'bg-gray-800 text-white' 
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            }`}
                        >
                            Profile
                        </Link>
                    </div>

                    <div className="flex items-center">
                        {token ? (
                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                            >
                                Logout
                            </button>
                        ) : (
                            <Link
                                href="/login"
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                            >
                                Login
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
} 