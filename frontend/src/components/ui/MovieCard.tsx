import Image from 'next/image';

interface MovieCardProps {
    movie: {
        id: number;
        title: string;
        poster_path: string;
        vote_average: number;
        media_type?: string;
        release_date?: string;
    };
    onClick: () => void;
}

export default function MovieCard({ movie, onClick }: MovieCardProps) {
    const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;

    return (
        <div
            className="relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer group"
            onClick={onClick}
            style={{
                background: '#f1f5f9',
                border: '1px solid rgba(226,232,240,0.8)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                contain: 'content',
            }}
        >
            <Image
                src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                alt={movie.title}
                width={342}
                height={513}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
            />

            {/* Top badges */}
            <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-10">
                {/* Rating */}
                {movie.vote_average > 0 && (
                    <span className="badge badge-rating flex items-center gap-1"
                          style={{ background: 'rgba(0,0,0,0.65)', color: '#fbbf24' }}>
                        ⭐ {movie.vote_average.toFixed(1)}
                    </span>
                )}
                {/* Media type */}
                {movie.media_type && (
                    <span className={`badge ${movie.media_type === 'tv' ? 'badge-tv' : 'badge-movie'}`}
                          style={{ background: 'rgba(0,0,0,0.65)', color: movie.media_type === 'tv' ? '#c084fc' : '#60a5fa' }}>
                        {movie.media_type === 'tv' ? '📺 TV Show' : '🎥 Movie'}
                    </span>
                )}
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                    <h3 className="text-white text-sm font-semibold leading-tight mb-1">{movie.title}</h3>
                    {year && <p className="text-slate-300 text-xs">{year}</p>}
                </div>
            </div>
        </div>
    );
}