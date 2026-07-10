import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';

export interface DiscoveryStatus {
  connected: boolean;
  provider: string | null;
  lastSync: string | null;
  accuracy: 'invoice' | 'estimated';
  loading: boolean;
}

/**
 * useCloudDiscovery — checks if a cluster has Phase 2 billing connected.
 * Used by all 7 FinOps cost pages to show/hide the CostAccuracyBanner.
 * Auto-refetches every 5 minutes.
 */
export const useCloudDiscovery = (clusterName: string | null): DiscoveryStatus => {
  const [status, setStatus] = useState<DiscoveryStatus>({
    connected: false,
    provider: null,
    lastSync: null,
    accuracy: 'estimated',
    loading: true,
  });

  const fetch_ = useCallback(async () => {
    if (!clusterName || clusterName === 'all') {
      setStatus(s => ({ ...s, loading: false }));
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/v1/discovery/status?cluster=${clusterName}`);
      if (!res.ok) { setStatus(s => ({ ...s, loading: false })); return; }
      const d = await res.json();
      setStatus({
        connected: d.connected === true,
        provider:  d.provider ?? null,
        lastSync:  d.last_sync_at ?? null,
        accuracy:  d.accuracy === 'invoice' ? 'invoice' : 'estimated',
        loading:   false,
      });
    } catch {
      setStatus(s => ({ ...s, loading: false }));
    }
  }, [clusterName]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetch_]);

  return status;
};

// Made with Bob
