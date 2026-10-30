const TOKEN_KEY = 'hesabyar_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (!res.ok) {
    let errMsg = 'خطایی در برقراری ارتباط با سرور رخ داد.';
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }

  return res.json();
}

/**
 * Downloads a file safely inside iframes with authentication header
 */
export async function downloadFile(path: string, defaultFilename?: string): Promise<void> {
  const token = getAuthToken();
  const tokenParam = token ? `token=${encodeURIComponent(token)}` : '';
  const separator = path.includes('?') ? '&' : '?';
  const rawPath = path.startsWith('/api') ? path.slice(4) : path;
  const urlWithToken = `/api${rawPath}${tokenParam ? `${separator}${tokenParam}` : ''}`;

  try {
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(urlWithToken, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    if (!res.ok) {
      let errMsg = 'دریافت فایل با خطا مواجه شد.';
      try {
        const json = await res.json();
        if (json.error) errMsg = json.error;
      } catch {}
      throw new Error(errMsg);
    }

    let filename = defaultFilename || 'file';
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1] || filenameMatch[2]);
      }
    }

    const blob = await res.blob();

    // Convert to Data URL (base64) so it cannot be revoked before saving
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 5000);
  } catch (err: any) {
    console.warn('Data URL download failed, falling back to direct link:', err);
    const link = document.createElement('a');
    link.href = urlWithToken;
    link.download = defaultFilename || 'file';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 5000);
  }
}
