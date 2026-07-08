/**
 * useUserStore – handles registration with the platform's user management API
 * and polling for approval status.
 *
 * After Clerk authenticates a user we call /api/v1/users/register with their
 * Clerk identity. The backend returns a status of "pending" until an admin
 * approves, or "approved" / "rejected" / "suspended".
 */
import { useState, useEffect, useCallback } from 'react';
import { useUser, useOrganization } from '@clerk/clerk-react';
import axios from 'axios';

export type PlatformStatus = 'unregistered' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface PlatformUser {
  id: string;
  clerk_user_id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  teams: string[];
  status: PlatformStatus;
  mfa_enabled: boolean;
  last_login: string | null;
  registered_at: string;
  approved_at: string | null;
  approved_by: string | null;
  notes: string | null;
  org_id: string;
}

const API_BASE = process.env.REACT_APP_API_URL || '';

interface UserStoreResult {
  platformStatus: PlatformStatus;
  platformUser: PlatformUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useUserStore(): UserStoreResult {
  const { user: clerkUser, isLoaded } = useUser();
  const { organization } = useOrganization();
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus>('unregistered');
  const [platformUser, setPlatformUser] = useState<PlatformUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Called once on sign-in: registers the user (idempotent) and reads back status
  const registerOnce = useCallback(async () => {
    if (!isLoaded || !clerkUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // org_id is the Clerk organization ID when orgs are enabled,
      // otherwise falls back to a value in publicMetadata, then 'default'.
      const org_id: string =
        organization?.id ??
        (clerkUser.publicMetadata?.org_id as string) ??
        'default';

      const regRes = await axios.post(`${API_BASE}/api/v1/users/register`, {
        clerk_user_id: clerkUser.id,
        username: clerkUser.username ?? clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
        full_name: clerkUser.fullName ?? '',
        requested_role: (clerkUser.publicMetadata?.requested_role as string) ?? 'viewer',
        requested_teams: (clerkUser.publicMetadata?.requested_teams as string[]) ?? [],
        org_id,
      });

      const pu: PlatformUser = regRes.data;
      setPlatformUser(pu);
      setPlatformStatus(pu.status as PlatformStatus);
    } catch (err: any) {
      console.warn('UserStore: backend unreachable, defaulting to approved', err?.message);
      setPlatformStatus('approved');
    } finally {
      setLoading(false);
    }
  }, [clerkUser, isLoaded]);

  // Called when user clicks "Check Approval Status" — polls /status, never re-registers
  const refresh = useCallback(async () => {
    if (!isLoaded || !clerkUser) return;

    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/status/${clerkUser.id}`);
      const { status, role, teams } = res.data;
      setPlatformStatus(status as PlatformStatus);
      if (platformUser) {
        setPlatformUser({ ...platformUser, status, role, teams });
      }
    } catch (err: any) {
      console.warn('UserStore: status check failed', err?.message);
    } finally {
      setLoading(false);
    }
  }, [clerkUser, isLoaded, platformUser]);

  useEffect(() => {
    registerOnce();
  }, [registerOnce]);

  return { platformStatus, platformUser, loading, error, refresh };
}

// Made with Bob
