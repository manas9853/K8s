/**
 * Root store.ts — kept for backward compatibility.
 * All new code should import from './store/' (the directory).
 * This file simply re-exports everything from there.
 */
export { store } from './store/store';
export type { RootState, AppDispatch } from './store/store';

// Made with Bob
