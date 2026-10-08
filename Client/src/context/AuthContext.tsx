import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { isTokenExpired } from '../utils/token';

export interface User {
  id: number;
  email: string;
  fullName?: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string, userData?: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setAccessToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  // Initialize from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('access_token');
    const storedUser = localStorage.getItem('user');
    
    if (storedToken) {
      if (isTokenExpired(storedToken)) {
        console.warn('Token expired on load, logging out...');
        logout();
      } else {
        setAccessToken(storedToken);
        setIsAuthenticated(true);
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error('Failed to parse stored user:', e);
          }
        }
      }
    }
    setLoading(false);
  }, [logout]);

  const login = (token: string, refreshToken: string, userData?: User) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('refresh_token', refreshToken);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    }
    setAccessToken(token);
    setIsAuthenticated(true);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, accessToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

