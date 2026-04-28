import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const token = request.cookies.get('token')?.value;
    const isAuthPage = request.nextUrl.pathname.startsWith('/login') || 
                      request.nextUrl.pathname.startsWith('/signup');
    const isMainPage = request.nextUrl.pathname === '/' ||
                      request.nextUrl.pathname.startsWith('/search') ||
                      request.nextUrl.pathname.startsWith('/history') ||
                      request.nextUrl.pathname.startsWith('/kids') ||
                      request.nextUrl.pathname.startsWith('/profile');

    console.log('Middleware - Current path:', request.nextUrl.pathname);
    console.log('Middleware - Has token:', !!token);
    console.log('Middleware - Is auth page:', isAuthPage);
    console.log('Middleware - Is main page:', isMainPage);

    // For auth pages, redirect to home if already authenticated
    if (isAuthPage && token) {
        console.log('Middleware - User is authenticated, redirecting to home');
        return NextResponse.redirect(new URL('/', request.url));
    }

    // For main pages (including root), redirect to login if not authenticated
    if (isMainPage && !token) {
        console.log('Middleware - No token found, redirecting to login');
        return NextResponse.redirect(new URL('/login', request.url));
    }

    console.log('Middleware - Proceeding with request');
    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/login', '/signup', '/search/:path*', '/history/:path*', '/kids/:path*', '/profile/:path*']
}; 