'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/auth';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

interface Profile {
    username: string;
    email: string;
    favorite_genres: string[];
    favorite_actors: string[];
    favorite_directors: string[];
    preferred_language?: string;
    preferred_content_type?: string;
    preferred_regional_languages?: string[];
    preferred_movie_genres?: string[];
    preferred_series_genres?: string[];
    preferred_release_era?: string;
    two_factor_enabled?: boolean;
    profile_picture_url?: string;
    google_profile_picture_url?: string;
    auth_provider?: string;
}

const LANGUAGES = [
    { code: 'hi', name: 'Hindi' },
    { code: 'en', name: 'English' },
    { code: 'mr', name: 'Marathi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'kn', name: 'Kannada' },
    { code: 'bn', name: 'Bengali' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'gu', name: 'Gujarati' },
];

interface Genre { id: number; name: string; }

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [genres, setGenres] = useState<Genre[]>([]);
    const token = useAuthStore(state => state.token);
    const isInitialized = useAuthStore(state => state.isInitialized);
    const router = useRouter();

    // 2FA Modal states
    const [show2FAModal, setShow2FAModal] = useState(false);
    const [totpUri, setTotpUri] = useState<string | null>(null);
    const [totpSecret, setTotpSecret] = useState<string | null>(null);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [authCode, setAuthCode] = useState('');
    const [password, setPassword] = useState('');
    const [setupStep, setSetupStep] = useState<'generate' | 'verify' | 'done'>('generate');
    
    // Disable/Regenerate 2FA Modal states
    const [showDisableModal, setShowDisableModal] = useState(false);
    const [showRegenerateModal, setShowRegenerateModal] = useState(false);

    // Edit Username states
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [editUsernameVal, setEditUsernameVal] = useState('');
    const [usernameError, setUsernameError] = useState<string | null>(null);

    // Avatar states
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (isInitialized && !token) router.push('/login'); }, [isInitialized, token, router]);

    useEffect(() => {
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        Promise.all([
            axios.get(`${API_URL}/api/users/profile`, { headers }),
            axios.get(`${API_URL}/api/users/favorites/genres`, { headers }),
        ]).then(([profileRes, genresRes]) => {
            setProfile(profileRes.data);
            const genreList = genresRes.data.genres || [];
            setGenres(genreList.map((name: string, i: number) => ({ id: i, name })));
        }).catch(() => setError('Failed to load profile'))
          .finally(() => setLoading(false));
    }, [token]);

    const updateAllPreferences = async () => {
        setError(null); setSuccess(null); setLoading(true);
        try {
            await axios.put(`${API_URL}/api/users/preferences`, {
                favorite_genres: profile?.favorite_genres.filter(s => s.trim()),
                favorite_actors: profile?.favorite_actors.filter(s => s.trim()),
                favorite_directors: profile?.favorite_directors.filter(s => s.trim()),
                preferred_language: profile?.preferred_language || null,
                preferred_content_type: profile?.preferred_content_type || null,
                preferred_regional_languages: profile?.preferred_regional_languages || [],
                preferred_movie_genres: profile?.preferred_movie_genres || [],
                preferred_series_genres: profile?.preferred_series_genres || [],
                preferred_release_era: profile?.preferred_release_era || null
            }, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            setSuccess(`Preferences updated successfully`);
        } catch { setError(`Failed to update preferences`); }
        finally { setLoading(false); }
    };

    const start2FASetup = async () => {
        setError(null); setSuccess(null);
        try {
            const res = await axios.post(`${API_URL}/api/users/2fa/setup`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTotpUri(res.data.uri);
            setTotpSecret(res.data.secret);
            setRecoveryCodes(res.data.recovery_codes);
            setSetupStep('verify');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to initiate 2FA setup');
            setShow2FAModal(false);
        }
    };

    const verify2FASetup = async () => {
        if (!authCode) return;
        setError(null); setSuccess(null);
        try {
            await axios.post(`${API_URL}/api/users/2fa/verify-setup`, { code: authCode }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (profile) setProfile({ ...profile, two_factor_enabled: true });
            setSetupStep('done');
            setSuccess('2FA enabled successfully. Please save your recovery codes securely.');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Invalid authenticator code');
        }
    };

    const disable2FA = async () => {
        if (!authCode || !password) return;
        setError(null); setSuccess(null);
        try {
            await axios.post(`${API_URL}/api/users/2fa/disable`, {
                password: password,
                code: authCode,
                is_recovery_code: authCode.length > 6 // naive heuristic, backend handles exact validation if needed but it's explicit in schema if we add a checkbox. For now we use the checkbox state if we had one. Let's assume standard code for simplicity.
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            if (profile) setProfile({ ...profile, two_factor_enabled: false });
            setShowDisableModal(false);
            setPassword('');
            setAuthCode('');
            setSuccess('2FA has been disabled.');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to disable 2FA');
        }
    };

    const regenerateCodes = async () => {
        if (!authCode || !password) return;
        setError(null); setSuccess(null);
        try {
            const res = await axios.post(`${API_URL}/api/users/2fa/recovery-codes/regenerate`, {
                password: password,
                code: authCode
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            setRecoveryCodes(res.data.recovery_codes);
            setShowRegenerateModal(false);
            setPassword('');
            setAuthCode('');
            setShow2FAModal(true);
            setSetupStep('done'); // Reuse the done view to show codes
            setSuccess('Recovery codes regenerated successfully.');
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to regenerate codes');
        }
    };

    const handleUsernameSave = async () => {
        if (!editUsernameVal.trim()) return;
        setUsernameError(null);
        try {
            const res = await axios.patch(`${API_URL}/api/users/profile`, 
                { username: editUsernameVal }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setProfile(prev => prev ? { ...prev, username: res.data.username } : null);
            setIsEditingUsername(false);
            setSuccess('Username updated successfully');
        } catch (err: any) {
            setUsernameError(err.response?.data?.detail || 'Failed to update username');
        }
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            setPhotoError('File size must be less than 5MB');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        
        setUploadingPhoto(true);
        setPhotoError(null);
        try {
            const res = await axios.post(`${API_URL}/api/users/profile/photo`, formData, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            setProfile(prev => prev ? { ...prev, profile_picture_url: res.data.profile_picture_url } : null);
            setShowPhotoModal(false);
            setSuccess('Profile photo updated');
        } catch (err: any) {
            setPhotoError(err.response?.data?.detail || 'Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemovePhoto = async () => {
        setUploadingPhoto(true);
        setPhotoError(null);
        try {
            const res = await axios.delete(`${API_URL}/api/users/profile/photo`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProfile(prev => prev ? { 
                ...prev, 
                profile_picture_url: res.data.profile_picture_url,
                google_profile_picture_url: res.data.google_profile_picture_url 
            } : null);
            setShowPhotoModal(false);
            setSuccess('Profile photo removed');
        } catch (err: any) {
            setPhotoError(err.response?.data?.detail || 'Failed to remove photo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleUseGooglePhoto = async () => {
        setUploadingPhoto(true);
        setPhotoError(null);
        try {
            const res = await axios.post(`${API_URL}/api/users/profile/photo/use-google`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProfile(prev => prev ? { 
                ...prev, 
                profile_picture_url: res.data.profile_picture_url,
                google_profile_picture_url: res.data.google_profile_picture_url 
            } : null);
            setShowPhotoModal(false);
            setSuccess('Switched to Google photo');
        } catch (err: any) {
            setPhotoError(err.response?.data?.detail || 'Failed to use Google photo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    if (!isInitialized || !token || (loading && !profile)) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <p style={{ color: '#ef4444' }}>Failed to load profile</p>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 min-h-screen max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>👤 Profile Settings</h1>
            <p className="text-sm mb-6" style={{ color: '#64748b' }}>Manage your preferences for better recommendations</p>

            {/* Alerts */}
            {error && (
                <div className="glass-card p-3 mb-4" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)' }}>
                    <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>
                </div>
            )}
            {success && (
                <div className="glass-card p-3 mb-4" style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.15)' }}>
                    <p className="text-sm" style={{ color: '#10b981' }}>✅ {success}</p>
                </div>
            )}

            {/* User info */}
            <div className="glass-card p-6 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl overflow-hidden shadow-sm shrink-0"
                             style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}>
                            {profile.profile_picture_url || profile.google_profile_picture_url ? (
                                <img 
                                    src={(profile.profile_picture_url || profile.google_profile_picture_url)?.startsWith('/') 
                                        ? `${API_URL}${profile.profile_picture_url || profile.google_profile_picture_url}` 
                                        : (profile.profile_picture_url || profile.google_profile_picture_url)} 
                                    alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                profile.username[0]?.toUpperCase()
                            )}
                        </div>
                        <div className="flex flex-col gap-1">
                            {isEditingUsername ? (
                                <div className="flex items-center gap-2">
                                    <input type="text" value={editUsernameVal} onChange={e => setEditUsernameVal(e.target.value)}
                                           className="px-3 py-1.5 rounded-lg text-sm border outline-none" style={{ borderColor: usernameError ? '#ef4444' : '#e2e8f0' }} autoFocus />
                                    <button onClick={handleUsernameSave} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Save</button>
                                    <button onClick={() => { setIsEditingUsername(false); setUsernameError(null); }} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200">Cancel</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <h2 className="font-bold text-lg" style={{ color: '#1e293b' }}>{profile.username}</h2>
                                    <button onClick={() => { setEditUsernameVal(profile.username); setIsEditingUsername(true); }} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                                </div>
                            )}
                            {usernameError && <p className="text-xs text-red-500 mt-1">{usernameError}</p>}
                            <p className="text-sm" style={{ color: '#64748b' }}>{profile.email}</p>
                        </div>
                    </div>
                    <div className="sm:ml-auto mt-4 sm:mt-0">
                        <button onClick={() => setShowPhotoModal(true)} className="btn-outline text-xs px-4 py-2">Change Photo</button>
                    </div>
                </div>
            </div>

            {/* Favorite Genres */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎭 Favorite Genres</h2>
                <div className="flex flex-wrap gap-2 mb-4">
                    {genres.map((genre) => {
                        const isSelected = profile.favorite_genres.includes(genre.name);
                        return (
                            <button key={genre.id}
                                onClick={() => {
                                    const newGenres = isSelected
                                        ? profile.favorite_genres.filter(g => g !== genre.name)
                                        : [...profile.favorite_genres, genre.name];
                                    setProfile({ ...profile, favorite_genres: newGenres });
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
                                style={isSelected ? {
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.08))',
                                    border: '2px solid #3b82f6',
                                    color: '#3b82f6',
                                } : {
                                    background: 'rgba(241,245,249,0.8)',
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    color: '#64748b',
                                }}>
                                {genre.name}
                            </button>
                        );
                    })}
                </div>
                <button onClick={updateAllPreferences}
                    disabled={loading} className="btn-primary text-xs">Save Genres</button>
            </div>

            {/* Favorite Actors */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🌟 Favorite Actors</h2>
                <div className="space-y-3 mb-4">
                    {profile.favorite_actors.map((actor, i) => (
                        <div key={i} className="flex gap-2">
                            <input type="text" value={actor}
                                onChange={e => {
                                    const arr = [...profile.favorite_actors]; arr[i] = e.target.value;
                                    setProfile({ ...profile, favorite_actors: arr });
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="Actor name"
                            />
                            <button onClick={() => {
                                setProfile({ ...profile, favorite_actors: profile.favorite_actors.filter((_, idx) => idx !== i) });
                            }} className="px-3 py-2 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setProfile({ ...profile, favorite_actors: [...profile.favorite_actors, ''] })}
                        className="btn-outline text-xs">+ Add Actor</button>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Actors</button>
                </div>
            </div>

            {/* Favorite Directors */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🎬 Favorite Directors</h2>
                <div className="space-y-3 mb-4">
                    {profile.favorite_directors.map((director, i) => (
                        <div key={i} className="flex gap-2">
                            <input type="text" value={director}
                                onChange={e => {
                                    const arr = [...profile.favorite_directors]; arr[i] = e.target.value;
                                    setProfile({ ...profile, favorite_directors: arr });
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                                style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                                placeholder="Director name"
                            />
                            <button onClick={() => {
                                setProfile({ ...profile, favorite_directors: profile.favorite_directors.filter((_, idx) => idx !== i) });
                            }} className="px-3 py-2 rounded-xl text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setProfile({ ...profile, favorite_directors: [...profile.favorite_directors, ''] })}
                        className="btn-outline text-xs">+ Add Director</button>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Directors</button>
                </div>
            </div>

            {/* Language Preference */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🌐 Language Preference</h2>
                <p className="text-sm mb-4" style={{ color: '#64748b' }}>Select your preferred language for localized recommendations.</p>
                <div className="flex gap-2">
                    <select 
                        value={profile.preferred_language || ""}
                        onChange={e => setProfile({ ...profile, preferred_language: e.target.value || undefined })}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                    >
                        <option value="">None (Default)</option>
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs">Save Language</button>
                </div>
            </div>

            {/* Content Type & Era Preferences */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>📺 Content Preferences</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm mb-2" style={{ color: '#64748b' }}>Preferred Content Type</label>
                        <select 
                            value={profile.preferred_content_type || ""}
                            onChange={e => setProfile({ ...profile, preferred_content_type: e.target.value || undefined })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                        >
                            <option value="">Both (Default)</option>
                            <option value="movie">Movies</option>
                            <option value="tv">Web Series</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm mb-2" style={{ color: '#64748b' }}>Preferred Release Era</label>
                        <select 
                            value={profile.preferred_release_era || ""}
                            onChange={e => setProfile({ ...profile, preferred_release_era: e.target.value || undefined })}
                            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)', color: '#1e293b' }}
                        >
                            <option value="">Any Era</option>
                            <option value="2020s">2020s (Current)</option>
                            <option value="2010s">2010s</option>
                            <option value="2000s">2000s</option>
                            <option value="classic">Classic (Pre-2000)</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={updateAllPreferences}
                        disabled={loading} className="btn-primary text-xs w-full text-center justify-center">Save All Preferences</button>
                </div>
            </div>

            {/* Account Security */}
            <div className="glass-card p-6 mb-6">
                <h2 className="text-lg font-bold mb-4" style={{ color: '#1e293b' }}>🔐 Account Security</h2>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl mb-4" 
                     style={{ background: 'rgba(241,245,249,0.8)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div>
                        <h3 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Two-Factor Authentication (2FA)</h3>
                        <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                            {profile.two_factor_enabled 
                                ? 'Your account is protected with an authenticator app.'
                                : 'Add an extra layer of security to your account.'}
                        </p>
                    </div>
                    <div className="mt-3 sm:mt-0 flex gap-2">
                        {profile.two_factor_enabled ? (
                            <>
                                <button onClick={() => setShowRegenerateModal(true)} className="btn-outline text-xs">Regenerate Codes</button>
                                <button onClick={() => setShowDisableModal(true)} className="px-3 py-2 rounded-xl text-xs font-semibold"
                                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    Disable
                                </button>
                            </>
                        ) : (
                            <button onClick={() => { setShow2FAModal(true); start2FASetup(); }} className="btn-primary text-xs">
                                Enable 2FA
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals for 2FA */}
            {show2FAModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="glass-card w-full max-w-md p-6 bg-white relative">
                        <button onClick={() => setShow2FAModal(false)} className="absolute top-4 right-4 text-gray-500">✕</button>
                        <h2 className="text-xl font-bold mb-4">Set up 2FA</h2>
                        
                        {setupStep === 'verify' && totpUri && (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-600">1. Scan this QR code in your Authenticator app (Google Authenticator, Authy, etc).</p>
                                <div className="flex justify-center p-4 bg-white rounded-xl">
                                    {/* Using qrcode.react - since we can't import dynamically easily here without breaking hooks if not careful, we will just use an img tag pointing to an open api OR use qrcode.react directly if imported at top */}
                                    <QRCodeSVG value={totpUri} size={150} />
                                </div>
                                <p className="text-xs text-center text-gray-500">Manual key: <strong className="break-all">{totpSecret}</strong></p>
                                <p className="text-sm text-gray-600 mt-4">2. Enter the 6-digit code from the app to verify setup.</p>
                                <input type="text" value={authCode} onChange={e => setAuthCode(e.target.value)} 
                                       className="w-full px-4 py-2 rounded-xl text-sm outline-none border" placeholder="000000" />
                                <button onClick={verify2FASetup} className="w-full btn-primary text-sm mt-2">Verify and Enable</button>
                            </div>
                        )}

                        {setupStep === 'done' && (
                            <div className="space-y-4">
                                <div className="p-3 bg-green-50 text-green-700 rounded-xl text-sm mb-4">
                                    ✅ 2FA is now enabled.
                                </div>
                                <h3 className="font-bold text-red-600">Save your recovery codes!</h3>
                                <p className="text-sm text-gray-600">If you lose access to your authenticator, you can use these one-time codes to log in. <strong>This is the only time they will be shown.</strong></p>
                                <div className="bg-gray-100 p-4 rounded-xl grid grid-cols-2 gap-2 text-sm font-mono">
                                    {recoveryCodes.map(c => <div key={c}>{c}</div>)}
                                </div>
                                <button onClick={() => setShow2FAModal(false)} className="w-full btn-primary text-sm mt-4">I have saved my codes</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(showDisableModal || showRegenerateModal) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="glass-card w-full max-w-sm p-6 bg-white relative">
                        <button onClick={() => { setShowDisableModal(false); setShowRegenerateModal(false); }} className="absolute top-4 right-4 text-gray-500">✕</button>
                        <h2 className="text-xl font-bold mb-4">{showDisableModal ? 'Disable 2FA' : 'Regenerate Codes'}</h2>
                        <p className="text-sm text-gray-600 mb-4">Please enter your password and a current authenticator code to confirm.</p>
                        
                        <div className="space-y-3">
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} 
                                   className="w-full px-4 py-2 rounded-xl text-sm outline-none border" placeholder="Password" />
                            <input type="text" value={authCode} onChange={e => setAuthCode(e.target.value)} 
                                   className="w-full px-4 py-2 rounded-xl text-sm outline-none border" placeholder="Authenticator Code" />
                            <button onClick={showDisableModal ? disable2FA : regenerateCodes} 
                                    className="w-full py-2 rounded-xl text-white font-semibold text-sm transition-all bg-blue-600">
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Modal */}
            {showPhotoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="glass-card w-full max-w-sm p-6 bg-white relative">
                        <button onClick={() => { setShowPhotoModal(false); setPhotoError(null); }} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">✕</button>
                        <h2 className="text-xl font-bold mb-4">Change Profile Photo</h2>
                        
                        {photoError && <div className="mb-4 p-2 bg-red-50 text-red-600 text-xs rounded-lg">{photoError}</div>}
                        
                        <div className="space-y-3">
                            <div>
                                <input type="file" accept="image/jpeg, image/png, image/webp" className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} />
                                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
                                        style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}>
                                    {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                                </button>
                            </div>
                            
                            {profile.auth_provider === 'google' && profile.google_profile_picture_url && profile.profile_picture_url && (
                                <button onClick={handleUseGooglePhoto} disabled={uploadingPhoto} className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
                                        style={{ background: 'rgba(241,245,249,0.8)', color: '#475569', border: '1px solid rgba(0,0,0,0.06)' }}>
                                    Use Google Photo
                                </button>
                            )}
                            
                            {(profile.profile_picture_url || profile.google_profile_picture_url) && (
                                <button onClick={handleRemovePhoto} disabled={uploadingPhoto} className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
                                        style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    Remove Photo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}