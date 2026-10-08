import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiErrorBody {
  message?: string;
  errors?: unknown;
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof AxiosError) {
    if (!err.response) return 'Cannot reach the server. Is the backend running?';
    return (err.response.data as ApiErrorBody | undefined)?.message ?? fallback;
  }
  return err instanceof Error ? err.message : fallback;
}
