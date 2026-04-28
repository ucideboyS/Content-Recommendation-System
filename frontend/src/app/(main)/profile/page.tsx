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
}

interface Genre {
    id: number;
    name: string;
}

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [genres, setGenres] = useState<Genre[]>([]);
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    const router = useRouter();

    useEffect(() => {
        if (isInitialized && !token) {
            router.push('/login');
        }
    }, [isInitialized, token, router]);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const response = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/profile`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                setProfile(response.data);
            } catch (error) {
                console.error('Error fetching profile:', error);
                setError('Failed to load profile');
            } finally {
                setLoading(false);
            }
        };

        const fetchGenres = async () => {
            try {
                const response = await axios.get(
                    `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/genres`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                const genreList = response.data.genres || [];
                setGenres(genreList.map((name: string, index: number) => ({
                    id: index,
                    name: name
                })));
            } catch (error) {
                console.error('Error fetching genres:', error);
            }
        };

        if (token) {
            fetchProfile();
            fetchGenres();
        }
    }, [token]);

    const handleUpdateGenres = async () => {
        if (!profile) return;

        try {
            setLoading(true);
            setError(null);
            setSuccess(null);

            await axios.put(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/genres`,
                profile.favorite_genres,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setSuccess('Favorite genres updated successfully');
        } catch (error) {
            console.error('Error updating genres:', error);
            setError('Failed to update favorite genres');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateActors = async () => {
        if (!profile) return;

        try {
            setLoading(true);
            setError(null);
            setSuccess(null);

            const nonEmptyActors = profile.favorite_actors.filter(actor => actor.trim() !== '');
            await axios.put(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/actors`,
                nonEmptyActors,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setSuccess('Favorite actors updated successfully');
        } catch (error) {
            console.error('Error updating actors:', error);
            setError('Failed to update favorite actors');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateDirectors = async () => {
        if (!profile) return;

        try {
            setLoading(true);
            setError(null);
            setSuccess(null);

            const nonEmptyDirectors = profile.favorite_directors.filter(director => director.trim() !== '');
            await axios.put(
                `${process.env.NEXT_PUBLIC_API_URL}/api/users/favorites/directors`,
                nonEmptyDirectors,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            setSuccess('Favorite directors updated successfully');
        } catch (error) {
            console.error('Error updating directors:', error);
            setError('Failed to update favorite directors');
        } finally {
            setLoading(false);
        }
    };

    if (!isInitialized || !token) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white">Loading...</p>
                </div>
            </div>
        );
    }

    if (loading && !profile) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-white">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white">Failed to load profile</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

                {error && (
                    <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
                        <p className="text-red-500">{error}</p>
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-4 bg-green-900/50 border border-green-500 rounded-lg">
                        <p className="text-green-500">{success}</p>
                    </div>
                )}

                <div className="bg-gray-800 rounded-lg p-6 mb-8">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Username</label>
                            <p className="mt-1 text-lg">{profile.username}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Email</label>
                            <p className="mt-1 text-lg">{profile.email}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div>
                        <h2 className="text-2xl font-semibold mb-4">Favorite Genres</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {genres.map((genre) => (
                                <label key={genre.id} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={profile.favorite_genres.includes(genre.name)}
                                        onChange={(e) => {
                                            const newGenres = e.target.checked
                                                ? [...profile.favorite_genres, genre.name]
                                                : profile.favorite_genres.filter(g => g !== genre.name);
                                            setProfile({ ...profile, favorite_genres: newGenres });
                                        }}
                                        className="form-checkbox h-5 w-5 text-blue-600"
                                    />
                                    <span>{genre.name}</span>
                                </label>
                            ))}
                        </div>
                        <button
                            onClick={handleUpdateGenres}
                            disabled={loading}
                            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Update Genres
                        </button>
                    </div>

                    <div>
                        <h2 className="text-2xl font-semibold mb-4">Favorite Actors</h2>
                        <div className="space-y-4">
                            {profile.favorite_actors.map((actor, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={actor}
                                        onChange={(e) => {
                                            const newActors = [...profile.favorite_actors];
                                            newActors[index] = e.target.value;
                                            setProfile({ ...profile, favorite_actors: newActors });
                                        }}
                                        className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
                                    />
                                    <button
                                        onClick={() => {
                                            const newActors = profile.favorite_actors.filter((_, i) => i !== index);
                                            setProfile({ ...profile, favorite_actors: newActors });
                                        }}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => {
                                    setProfile({
                                        ...profile,
                                        favorite_actors: [...profile.favorite_actors, '']
                                    });
                                }}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                Add Actor
                            </button>
                        </div>
                        <button
                            onClick={handleUpdateActors}
                            disabled={loading}
                            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Update Actors
                        </button>
                    </div>

                    <div>
                        <h2 className="text-2xl font-semibold mb-4">Favorite Directors</h2>
                        <div className="space-y-4">
                            {profile.favorite_directors.map((director, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={director}
                                        onChange={(e) => {
                                            const newDirectors = [...profile.favorite_directors];
                                            newDirectors[index] = e.target.value;
                                            setProfile({ ...profile, favorite_directors: newDirectors });
                                        }}
                                        className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-blue-500"
                                    />
                                    <button
                                        onClick={() => {
                                            const newDirectors = profile.favorite_directors.filter((_, i) => i !== index);
                                            setProfile({ ...profile, favorite_directors: newDirectors });
                                        }}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => {
                                    setProfile({
                                        ...profile,
                                        favorite_directors: [...profile.favorite_directors, '']
                                    });
                                }}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                Add Director
                            </button>
                        </div>
                        <button
                            onClick={handleUpdateDirectors}
                            disabled={loading}
                            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            Update Directors
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
} 