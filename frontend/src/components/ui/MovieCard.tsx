import Image from 'next/image';

interface MovieCardProps {
    movie: {
        id: number;
        title: string;
        poster_path: string;
        vote_average: number;
    };
    onClick: () => void;
}

export default function MovieCard({ movie, onClick }: MovieCardProps) {
    return (
        <div
            className="relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer group"
            onClick={onClick}
        >
            <Image
                src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                alt={movie.title}
                width={500}
                height={750}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-lg font-semibold mb-2">{movie.title}</h3>
                    <p className="text-sm text-yellow-400">
                        Rating: {movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'} / 10
                    </p>
                </div>
            </div>
        </div>
    );
}