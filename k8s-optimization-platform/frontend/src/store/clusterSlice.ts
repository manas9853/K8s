/**
 * Cluster Redux Slice
 * Manages the list of all registered clusters and the currently active (selected) cluster.
 * This is the single source of truth for cluster identity across the entire platform.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ClusterInfo {
  id: string;
  name: string;
  environment: 'production' | 'staging' | 'qa' | 'development' | string;
  region: string;
  provider: string;
  version: string;
  status: 'healthy' | 'warning' | 'critical' | string;
  nodes: number;
  pods: number;
  namespaces: number;
  cpu_capacity: string;
  memory_capacity: string;
  cpu_usage: string;
  memory_usage: string;
  health_score: number;
  monthly_cost: number;
  potential_savings: number;
  last_updated: string;
}

interface ClusterState {
  /** All clusters known to the platform */
  clusters: ClusterInfo[];
  /**
   * The currently selected cluster ID.
   * 'all' means aggregate view across all clusters.
   */
  activeClusterId: string;
  /** Set to true while the cluster list is being fetched */
  loading: boolean;
  /** Non-null if the last fetch failed */
  error: string | null;
  /** ID of the most recently deleted cluster (used to notify other components) */
  lastDeletedId: string | null;
}

const ACTIVE_CLUSTER_KEY = 'k8s_active_cluster_id';

function persistActiveCluster(id: string) {
  try {
    localStorage.setItem(ACTIVE_CLUSTER_KEY, id);
  } catch {
    // localStorage not available — no-op
  }
}

function loadPersistedActiveCluster(): string {
  try {
    return localStorage.getItem(ACTIVE_CLUSTER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

const initialState: ClusterState = {
  clusters: [],
  activeClusterId: loadPersistedActiveCluster(),
  loading: false,
  error: null,
  lastDeletedId: null,
};

const clusterSlice = createSlice({
  name: 'cluster',
  initialState,
  reducers: {
    /** Replace the full cluster list (called after a successful API fetch) */
    setClusters(state, action: PayloadAction<ClusterInfo[]>) {
      state.clusters = action.payload;
      state.loading = false;
      state.error = null;

      // If the previously active cluster no longer exists, reset to 'all'
      const stillExists = action.payload.some(
        (c) => c.id === state.activeClusterId
      );
      if (!stillExists && state.activeClusterId !== 'all') {
        state.activeClusterId = 'all';
        persistActiveCluster('all');
      }
    },

    /** Set the active (selected) cluster. 'all' = aggregate view. */
    setActiveClusterId(state, action: PayloadAction<string>) {
      state.activeClusterId = action.payload;
      persistActiveCluster(action.payload);
    },

    /** Mark fetch in-flight */
    fetchStart(state) {
      state.loading = true;
      state.error = null;
    },

    /** Mark fetch failed */
    fetchError(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },

    /**
     * Remove a cluster from the list after a successful DELETE.
     * Automatically resets activeClusterId if the deleted cluster was active.
     */
    removeCluster(state, action: PayloadAction<string>) {
      const deletedId = action.payload;
      state.clusters = state.clusters.filter((c) => c.id !== deletedId);
      state.lastDeletedId = deletedId;

      if (state.activeClusterId === deletedId) {
        // Switch to the first remaining cluster, or 'all' if none left
        const next = state.clusters[0]?.id ?? 'all';
        state.activeClusterId = next;
        persistActiveCluster(next);
      }
    },

    /** Clear the lastDeletedId notification once consumed */
    clearLastDeleted(state) {
      state.lastDeletedId = null;
    },
  },
});

export const {
  setClusters,
  setActiveClusterId,
  fetchStart,
  fetchError,
  removeCluster,
  clearLastDeleted,
} = clusterSlice.actions;

export default clusterSlice.reducer;

// Made with Bob
