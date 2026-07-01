/**
 * useActiveCluster
 * ────────────────
 * Convenience hook for page components that need to:
 *  1. Know which cluster is selected
 *  2. Append the right query param to API calls
 *  3. Re-fetch when the selection changes
 *
 * Usage:
 *
 *   const { activeClusterId, clusterParam } = useActiveCluster();
 *
 *   useEffect(() => {
 *     fetch(`/api/v1/pods${clusterParam}`)
 *       .then(r => r.json())
 *       .then(setData);
 *   }, [clusterParam]);   // <-- re-runs on cluster switch or delete
 */
import { useCluster } from '../contexts/ClusterContext';

interface ActiveClusterHookResult {
  /**
   * Current active cluster ID.
   * 'all' = aggregate view across every cluster.
   */
  activeClusterId: string;
  /**
   * Ready-to-append URL query string.
   * '' when showing all clusters.
   * '?cluster_id=<id>' when a specific cluster is selected.
   */
  clusterParam: string;
  /**
   * True while cluster list is loading.
   * Pages can show a skeleton/spinner during initial load.
   */
  loading: boolean;
  /**
   * Human-readable name of the active cluster (or 'All Clusters').
   * Useful for page titles and breadcrumbs.
   */
  activeClusterName: string;
}

export function useActiveCluster(): ActiveClusterHookResult {
  const { activeClusterId, clusterParam, loading, clusters } = useCluster();

  const activeClusterName =
    activeClusterId === 'all'
      ? 'All Clusters'
      : clusters.find((c) => c.id === activeClusterId)?.name ??
        activeClusterId;

  return { activeClusterId, clusterParam, loading, activeClusterName };
}

// Made with Bob
