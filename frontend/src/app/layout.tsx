import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MovieRec - Movie Recommendation System',
  description: 'Get personalized movie recommendations based on your interests',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen`} style={{ background: 'linear-gradient(135deg, #f0f5ff 0%, #e0ecff 50%, #f0f5ff 100%)' }}>
        {children}
      </body>
    </html>
  );
}
