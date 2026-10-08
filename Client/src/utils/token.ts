/**
 * Utility to manually decode a JWT and check if it is expired.
 * This avoids adding extra dependencies.
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true; // Not a valid JWT

    // The second part is the payload, base64url encoded
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    
    if (!payload.exp) return false; // If no exp claim, assume not expired

    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
  } catch (error) {
    console.error('Error decoding token:', error);
    return true; // Assume expired/invalid on error
  }
}
