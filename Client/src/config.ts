// Client/src/config.ts

// Use the environment variable if it exists (for Docker/VM deployment), 
// otherwise fall back to localhost (for local development).
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/v1';
