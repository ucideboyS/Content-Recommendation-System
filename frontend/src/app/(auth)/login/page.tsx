'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/auth';
import { loginUser } from '@/lib/api';
import { ApiError } from '@/types/api';
import Image from 'next/image';

const LottieAnimation = dynamic(() => import('@/components/ui/loginDynamicLottie'), {
    ssr: false,
});

export default function Login() {
    const [loginData, setLoginData] = useState({
        username: '',
        password: '',
    });
    const [buttonDisabled, setButtonDisabled] = useState(true);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { setToken, setUser } = useAuthStore();

    useEffect(() => {
        setButtonDisabled(!(loginData.username && loginData.password));
    }, [loginData]);

    const loginHandler = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginData.username || !loginData.password) {
            alert('Please enter all the fields');
            return;
        }

        try {
            setLoading(true);
            console.log('Starting login process...');
            const data = await loginUser(loginData);
            console.log('Login successful, data:', data);

            if (data.access_token) {
                console.log('Setting token and user data...');
                localStorage.setItem('token', data.access_token);
                setToken(data.access_token);
                setUser({
                    id: 0, // This will be updated when we fetch user data
                    username: loginData.username,
                    email: '', // This will be updated when we fetch user data
                    favorite_genres: [],
                    favorite_actors: [],
                    favorite_directors: []
                });
                
                console.log('Attempting to redirect to home page...');
                // Force a hard navigation to the home page
                window.location.href = '/';
            }
        } catch (error) {
            const apiError = error as ApiError;
            console.error('Login error:', apiError);
            if (apiError.response?.status === 404) {
                alert("No account found. Try signing up.");
                router.push('/signup');
            } else if (apiError.response?.status === 401) {
                alert("Invalid username or password. Try again.");
            } else {
                alert('Something went wrong. Please try again.');
                console.error('Login Error:', apiError.response?.data?.detail);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='flex items-center bg-black h-screen'>
            <div className='bg-[rgb(250,250,250)] max-md:w-full lg:w-[40%] h-screen text-black'>
                <div className='flex flex-col h-full justify-around items-center'>
                    <div className='w-full md:w-3/4 p-10 flex flex-col items-center'>
                        <div className="flex items-center justify-center mb-8">
                            <Image
                                src="/logo.png"
                                alt="MovieRec Logo"
                                width={150}
                                height={150}
                                className="w-32 h-32 object-contain"
                            />
                        </div>
                        <h1 className='text-4xl font-semibold'>Welcome back</h1>
                        <p className='mt-2 text-gray-500'>Please enter your details</p>
                        <form className='flex flex-col w-full mt-12' onSubmit={loginHandler}>
                            <label htmlFor='username' className='mb-1'>Username</label>
                            <input
                                type='text'
                                name='username'
                                value={loginData.username}
                                onChange={e => setLoginData({ ...loginData, username: e.target.value })}
                                className='px-3 py-2 border rounded-md border-gray-300 mb-5 w-full'
                                placeholder='Enter your username'
                            />

                            <label htmlFor='password' className='mb-1'>Password</label>
                            <input
                                type='password'
                                name='password'
                                value={loginData.password}
                                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                                className='px-3 py-2 w-full border rounded-md border-gray-300 mb-5'
                                placeholder='••••••••••'
                            />

                            <button
                                type="submit"
                                className='w-full my-4 bg-black font-semibold rounded-md py-4 text-white hover:bg-black/90 disabled:bg-gray-500'
                                disabled={buttonDisabled || loading}
                            >
                                {loading ? 'Signing in...' : 'Sign in'}
                            </button>
                        </form>
                    </div>

                    <div className='text-gray-600 w-full flex justify-center'>
                        Don&apos;t have an account?
                        <Link href='/signup' className='text-black font-semibold ml-1'>
                            Sign up
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
