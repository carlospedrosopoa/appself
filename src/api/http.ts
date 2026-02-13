export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY as string | undefined;
const AUTH_TOKEN_STORAGE_KEY = "appself.gestorToken";

function joinUrl(base: string, path: string) {
  if (!base) return path;
  const baseTrim = base.endsWith("/") ? base.slice(0, -1) : base;
  const pathTrim = path.startsWith("/") ? path : `/${path}`;
  return `${baseTrim}${pathTrim}`;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  if (!API_BASE_URL) {
    throw { status: 0, message: "VITE_API_BASE_URL não configurado" } satisfies ApiError;
  }

  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (KIOSK_KEY) {
    headers.set("x-kiosk-key", KIOSK_KEY);
  }

  let body: BodyInit | undefined = init?.body as any;
  if (init && "json" in init) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json ?? null);
  }

  const res = await fetch(joinUrl(API_BASE_URL, path), {
    ...init,
    headers,
    body,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "mensagem" in (payload as any) && String((payload as any).mensagem)) ||
      (payload && typeof payload === "object" && "message" in (payload as any) && String((payload as any).message)) ||
      `Erro HTTP ${res.status}`;
    throw { status: res.status, message, details: payload } satisfies ApiError;
  }

  return payload as T;
}

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
  }
}

export function clearAuthToken() {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
  }
}

export async function apiFetchAuth<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const token = getAuthToken();
  if (!token) {
    throw { status: 401, message: "Não autenticado" } satisfies ApiError;
  }
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  return await apiFetch<T>(path, { ...init, headers });
}
