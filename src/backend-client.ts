export type BackendSession = {
  authenticated: boolean;
  actor: { id: string; username: string; displayName: string } | null;
  csrfToken: string | null;
  capabilities: { recovery?: boolean; signIn: boolean; feedback: boolean; turnstileSiteKey: string | null };
};

export type BackendNotification = {
  id: string; kind: string; resourceId: string; createdAt: number; readAt: number | null; message: string;
};

export class BackendError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
    this.name = 'BackendError';
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, { ...options, credentials: 'same-origin', signal: controller.signal });
    const data = await response.json();
    if (!response.ok) {
      const error = typeof data.error === 'object' && data.error ? data.error : data;
      throw new BackendError(typeof error.message === 'string' ? error.message : 'Please try again.',
        response.status, error.retryable === true);
    }
    return data as T;
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError('We could not confirm the connection. Keep this page open and try again; your draft is still here.', 0, true);
  } finally {
    window.clearTimeout(timeout);
  }
}

export const getBackendSession = () => api<BackendSession>('/api/session');
export const getBackendNotifications = () => api<{ notifications: BackendNotification[] }>('/api/notifications');

export function sendBackendFeedback(input: { category: string; body: string; turnstileToken: string },
  csrfToken: string, key: string) {
  return api<{ id: string; status: string }>('/api/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'Idempotency-Key': key },
    body: JSON.stringify(input),
  });
}

export function uploadBackendPicture(reportId: string, file: File, csrfToken: string, key: string) {
  return api<{ media: { id: string; status: string }; duplicate: boolean }>(`/api/feedback/${encodeURIComponent(reportId)}/pictures`, {
    method: 'POST', headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrfToken, 'Idempotency-Key': key }, body: file,
  });
}
