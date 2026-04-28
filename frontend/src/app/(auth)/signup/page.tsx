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

    return (
        <div className='flex items-center bg-black h-screen'>
            <div className='bg-[rgb(250,250,250)] max-md:w-full lg:w-[40%] h-screen text-black overflow-y-auto'>
                <div className='flex flex-col h-full justify-around items-center p-8'>
                    <div className='w-full md:w-3/4 flex flex-col items-center'>
                        <div className="flex items-center justify-center mb-8">
                            <Image
                                src="/logo.png"
                                alt="MovieRec Logo"
                                width={150}
                                height={150}
                                className="w-32 h-32 object-contain"
                            />
                        </div>
                        <h1 className='text-4xl font-semibold'>Create Account</h1>
                        <p className='mt-2 text-gray-500'>Please fill in your details</p>
                        <form className='flex flex-col w-full mt-8' onSubmit={handleSubmit}>
                            <label htmlFor='username' className='mb-1'>Username</label>
                            <input
                                type='text'
                                id='username'
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                required
                            />

                            <label htmlFor='email' className='mb-1'>Email</label>
                            <input
                                type='email'
                                id='email'
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                required
                            />

                            <label htmlFor='password' className='mb-1'>Password</label>
                            <input
                                type='password'
                                id='password'
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                required
                            />

                            <label className='mb-2'>Favorite Genres</label>
                            <div className='grid grid-cols-2 gap-2 mb-5'>
                                {GENRES.map(genre => (
                                    <button
                                        key={genre}
                                        type='button'
                                        onClick={() => handleGenreToggle(genre)}
                                        className={`px-3 py-2 rounded-md border ${
                                            formData.favorite_genres.includes(genre)
                                                ? 'bg-black text-white border-black'
                                                : 'border-gray-300'
                                        }`}
                                    >
                                        {genre}
                                    </button>
                                ))}
                            </div>

                            <label htmlFor='actors' className='mb-1'>Favorite Actors (comma-separated)</label>
                            <input
                                type='text'
                                id='actors'
                                value={formData.favorite_actors}
                                onChange={e => setFormData({ ...formData, favorite_actors: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                placeholder='e.g., Tom Cruise, Brad Pitt'
                            />

                            <label htmlFor='directors' className='mb-1'>Favorite Directors (comma-separated)</label>
                            <input
                                type='text'
                                id='directors'
                                value={formData.favorite_directors}
                                onChange={e => setFormData({ ...formData, favorite_directors: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                placeholder='e.g., Christopher Nolan, Steven Spielberg'
                            />

                            <button
                                type='submit'
                                className='w-full my-4 bg-black font-semibold rounded-md py-4 text-white hover:bg-black/90 disabled:bg-gray-500'
                                disabled={loading}
                            >
                                {loading ? 'Creating Account...' : 'Create Account'}
                            </button>
                        </form>
                    </div>

                    <div className='text-gray-600 w-full flex justify-center'>
                        Already have an account?
                        <Link href='/login' className='text-black font-semibold ml-1'>
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>

            <div className='w-[60%] h-screen flex justify-center items-center rounded-md max-md:hidden'>
                <div className='w-[70vh] rounded-3xl overflow-hidden'>
                    <LottieAnimation />
                </div>
            </div>
        </div>
    );
}
