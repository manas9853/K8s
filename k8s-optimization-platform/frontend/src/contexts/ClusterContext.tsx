/**
 * ClusterContext
 * ─────────────
 * Single source of truth for:
 *  • The list of all clusters known to this platform
 *  • The "active" cluster (the one the user is currently scoped to)
 *  • Cascade-delete: removing a cluster purges it from the backend AND
 *    resets the active selection so every subscribed page re-fetches
 *    automatically.
 *
 * Usage in any page / component:
 *
 *   const { activeClusterId, clusterParam } = useCluster();
 *   useEffect(() => { fetch(`/api/v1/pods${clusterParam}`) }, [clusterParam]);
 *
 * clusterParam is either '' (all clusters) or '?cluster_id=<id>'.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useUser } from '@clerk/clerk-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setClusters,
  setActiveClusterId,
  fetchStart,
  fetchError,
  removeCluster as removeClusterAction,
  clearLastDeleted,
} from '../store/clusterSlice';
import type { ClusterInfo } from '../store/clusterSlice';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeleteResult {
  success: boolean;
  removedCount?: number;
  error?: string;
}

interface ClusterContextType {
  /** All clusters currently registered in the platform */
  clusters: ClusterInfo[];
  /**
   * The ID of the currently selected cluster.
   * 'all' means "aggregate view – show data from every cluster".
   */
  activeClusterId: string;
  /**
   * URL query param string to append to every API call.
   * '' when activeClusterId === 'all'
   * '?cluster_id=<id>' otherwise
   */
  clusterParam: string;
  /** True while the cluster list is being fetched from the backend */
  loading: boolean;
  /** Non-null when the last fetch failed */
  error: string | null;
  /**
   * Change the active cluster.
   * All pages that include clusterParam in their useEffect deps will
   * automatically re-fetch when this changes.
   */
  selectCluster: (id: string) => void;
  /**
   * Delete a cluster from the backend AND from local state.
   * After this resolves, clusters[] is updated and if the deleted cluster
   * was active, activeClusterId is reset — triggering re-renders everywhere.
   */
  deleteCluster: (id: string) => Promise<DeleteResult>;
  /**
   * Force a refresh of the cluster list.
   * Call this after any action that may have changed cluster state
   * (e.g. auto-fix, rollback, onboarding a new cluster).
   */
  refreshClusters: () => Promise<void>;
}

// ─── Context & hook ───────────────────────────────────────────────────────────

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

export function useCluster(): ClusterContextType {
  const ctx = useContext(ClusterContext);
  if (!ctx) {
    throw new Error('useCluster must be used inside <ClusterProvider>');
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

const API_BASE = process.env.REACT_APP_API_URL || '';
/** How often (ms) to auto-refresh cluster list for real-time updates */
const POLL_INTERVAL_MS = 30_000;

export const ClusterProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const dispatch = useAppDispatch();
  const { user: clerkUser } = useUser();
  const { clusters, activeClusterId, loading, error } = useAppSelector(
    (s) => s.cluster
  );

  // Track mount so we don't call setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Fetch cluster list ───────────────────────────────────────────────────

  const fetchClusters = useCallback(async () => {
    dispatch(fetchStart());
    try {
      const headers: Record<string, string> = {};
      if (clerkUser?.id) {
        headers['X-Clerk-User-Id'] = clerkUser.id;
      }
      // Use the agent-receiver endpoint — this is the authoritative cluster
      // registry. The legacy /api/clusters endpoint returns an empty list.
      const res = await fetch(`${API_BASE}/api/agents/clusters`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // Response shape: { total_clusters: N, clusters: [ { cluster_name, environment,
      //   cloud_provider, region, version, status, ... } ] }
      const rawList: any[] = body.clusters ?? (Array.isArray(body) ? body : []);
      const data: ClusterInfo[] = rawList.map((c) => ({
        id: c.cluster_name,
        name: c.cluster_name,
        environment: c.environment ?? 'production',
        region: c.region ?? '',
        provider: c.cloud_provider ?? '',
        version: c.version ?? '',
        status: c.status === 'active' ? 'healthy' : c.status ?? 'healthy',
        nodes: c.nodes ?? 0,
        pods: c.pods ?? 0,
        namespaces: c.namespaces ?? 0,
        cpu_capacity: c.cpu_capacity ?? '',
        memory_capacity: c.memory_capacity ?? '',
        cpu_usage: c.cpu_usage ?? '',
        memory_usage: c.memory_usage ?? '',
        health_score: c.health_score ?? 0,
        monthly_cost: c.monthly_cost ?? 0,
        potential_savings: c.potential_savings ?? 0,
        last_updated: c.last_seen ?? c.registered_at ?? '',
      }));
      dispatch(setClusters(data));
    } catch (err: any) {
      dispatch(fetchError(err?.message ?? 'Failed to load clusters'));
      // Fallback: keep existing clusters list intact – don't wipe the UI
    }
  }, [dispatch, clerkUser?.id]);

  // Initial fetch on mount
  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  // Auto-refresh every 30 s so real-time changes (agent data, new nodes) appear
  useEffect(() => {
    const timer = setInterval(fetchClusters, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchClusters]);

  // ── Select cluster ───────────────────────────────────────────────────────

  const selectCluster = useCallback(
    (id: string) => {
      dispatch(setActiveClusterId(id));
    },
    [dispatch]
  );

  // ── Delete cluster (cascade) ──────────────────────────────────────────────

  const deleteCluster = useCallback(
    async (id: string): Promise<DeleteResult> => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/clusters/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return {
            success: false,
            error: body?.detail ?? `Delete failed (HTTP ${res.status})`,
          };
        }

        const body = await res.json().catch(() => ({}));

        // Remove from Redux state — this automatically:
        //  1. Filters clusters[] to exclude the deleted ID
        //  2. Resets activeClusterId if it pointed to the deleted cluster
        //  3. Triggers re-renders in every component that reads from useCluster()
        dispatch(removeClusterAction(id));

        return { success: true, removedCount: body?.resources_removed ?? 0 };
      } catch (err: any) {
        return { success: false, error: err?.message ?? 'Network error' };
      }
    },
    [dispatch]
  );

  // ── Public refresh ───────────────────────────────────────────────────────

  const refreshClusters = useCallback(async () => {
    await fetchClusters();
  }, [fetchClusters]);

  // ── Derived clusterParam ─────────────────────────────────────────────────

  const clusterParam =
    activeClusterId && activeClusterId !== 'all'
      ? `?cluster_id=${encodeURIComponent(activeClusterId)}`
      : '';

  // ── Context value ────────────────────────────────────────────────────────

  const value: ClusterContextType = {
    clusters,
    activeClusterId,
    clusterParam,
    loading,
    error,
    selectCluster,
    deleteCluster,
    refreshClusters,
  };

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
};

// ─── Convenience re-export ────────────────────────────────────────────────────
export type { ClusterInfo, ClusterContextType };

// Made with Bob
