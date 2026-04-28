export interface ApiError {
    response?: {
        status: number;
        data: {
            detail: string;
        };
    };
    message: string;
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
}

export interface RegisterResponse {
    message: string;
}

export interface Movie {
    id: number;
    title: string;
    poster_path: string;
    overview: string;
    vote_average: number;
    genre_ids?: number[];
}

export interface HistoryItem {
    id: number;
    title: string;
    timestamp: string;
    poster_path: string;
} 