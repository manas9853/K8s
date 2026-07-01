/**
 * Redux Store — root configuration
 * Re-exports everything so consumers import from 'store/' not 'store/index'
 */
export { store } from './store';
export type { RootState, AppDispatch } from './store';
export { useAppDispatch, useAppSelector } from './hooks';
export type { ClusterInfo } from './clusterSlice';
export {
  setClusters,
  setActiveClusterId,
  fetchStart,
  fetchError,
  removeCluster,
  clearLastDeleted,
} from './clusterSlice';

// Made with Bob
