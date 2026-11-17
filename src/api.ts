export async function fetchApi<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // 若本地存有通过 URL 回传的 sso_token，附加至 Authorization 标头以防第三方 Cookie 策略阻断
  if (typeof window !== 'undefined' && !headers.has('Authorization')) {
    const ssoToken = sessionStorage.getItem('sso_token');
    if (ssoToken) {
      headers.set('Authorization', `Bearer ${ssoToken}`);
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw new Error(data?.error || `网络请求错误 (${res.status})`);
  }

  return data as T;
}
