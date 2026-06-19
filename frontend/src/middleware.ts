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
                      request.nextUrl.pathname.startsWith('/profile') ||
                      request.nextUrl.pathname.startsWith('/wishlist') ||
                      request.nextUrl.pathname.startsWith('/coming-soon') ||
                      request.nextUrl.pathname.startsWith('/trailers');

    // For auth pages, redirect to home if already authenticated
    if (isAuthPage && token) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // For main pages (including root), redirect to login if not authenticated
    if (isMainPage && !token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/',
        '/login',
        '/signup',
        '/search/:path*',
        '/history/:path*',
        '/kids/:path*',
        '/profile/:path*',
        '/wishlist/:path*',
        '/coming-soon/:path*',
        '/trailers/:path*',
    ]
};