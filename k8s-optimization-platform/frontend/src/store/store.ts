/**
 * Redux Store — configureStore
 * Moved from src/store.ts into src/store/ so the cluster slice can live alongside it.
 * The original src/store.ts is kept for backward-compat (re-exports from here).
 */
import { configureStore } from '@reduxjs/toolkit';
import clusterReducer from './clusterSlice';

export const store = configureStore({
  reducer: {
    cluster: clusterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Made with Bob
