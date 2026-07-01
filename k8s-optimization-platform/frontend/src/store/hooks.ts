/**
 * Typed Redux hooks
 * Use these everywhere instead of the plain useDispatch / useSelector
 * so TypeScript knows the full RootState shape.
 */
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Made with Bob
