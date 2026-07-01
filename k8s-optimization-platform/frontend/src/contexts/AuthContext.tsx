import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { useUserStore } from '../hooks/useUserStore';

interface User {
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  // Role comes from the platform registry (backend approval), not Clerk metadata
  const { platformUser } = useUserStore();

  const user: User | null = clerkUser
    ? {
        username: clerkUser.username ?? clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
        full_name: clerkUser.fullName ?? '',
        role: platformUser?.role ?? (clerkUser.publicMetadata?.role as string) ?? 'viewer',
      }
    : null;

  const token = null;

  const logout = () => {
    signOut();
  };

  const value: AuthContextType = {
    user,
    token,
    loading: !isLoaded,
    logout,
    isAuthenticated: !!isSignedIn && !!clerkUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Re-export Clerk's getToken helper so any API layer can pull a JWT
export { useAuth as useClerkToken };

// Made with Bob
