'use client';

import Image from 'next/image';
import Link from 'next/link';

interface MovieCardProps {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  vote_average: number;
}

export default function MovieCard({
  id,
  title,
  overview,
  poster_path,
  vote_average,
}: MovieCardProps) {
  return (
    <Link href={`/movies/${id}`} className="group">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-800">
        <Image
          src={`https://image.tmdb.org/t/p/w500${poster_path}`}
          alt={title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-sm text-gray-300 line-clamp-2 mb-2">{overview}</p>
            <div className="flex items-center">
              <span className="text-yellow-400">★</span>
              <span className="ml-1">{vote_average.toFixed(1)} / 10</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
