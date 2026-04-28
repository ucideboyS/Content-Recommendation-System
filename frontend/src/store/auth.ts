import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import axios from "axios";

interface User {
  id: number;
  username: string;
  email: string;
  favorite_genres: string[];
  favorite_actors: string[];
  favorite_directors: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  clearAuth: () => Promise<void>;
  isInitialized: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isInitialized: false,
      setToken: (token) => set({ token, isInitialized: true }),
      setUser: (user) => set({ user }),
      clearAuth: async () => {
        try {
          const currentToken = useAuthStore.getState().token;
          if (currentToken) {
            try {
              await axios.post(
                `${process.env.NEXT_PUBLIC_API_URL}/logout`,
                {},
                {
                  headers: {
                    'Authorization': `Bearer ${currentToken}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
            } catch (error) {
              console.error('Error during logout:', error);
            }
          }
        } finally {
          // Clear all state and storage
          set({ token: null, user: null, isInitialized: true });
          localStorage.removeItem('auth-storage');
          sessionStorage.clear();
          
          // Clear cookies
          document.cookie.split(";").forEach((c) => {
            document.cookie = c
              .replace(/^ +/, "")
              .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
          });

          // Redirect to login
          window.location.href = '/login';
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isInitialized = true;
        }
      },
    }
  )
);
