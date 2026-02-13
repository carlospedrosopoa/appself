import { apiFetch, apiFetchAuth, clearAuthToken, setAuthToken } from "./http";

export type GestorUser = {
  id: string;
  nome: string;
  email: string;
  role: string;
  pointIdGestor?: string | null;
};

export async function gestorLogin(input: { email: string; senha: string }) {
  const res = await apiFetch<{
    token: string;
    user?: GestorUser;
    usuario?: GestorUser;
  }>(`/api/auth/login`, {
    method: "POST",
    json: { email: input.email, password: input.senha },
  });

  const user = (res.user || res.usuario) as GestorUser | undefined;
  if (!res.token || !user) {
    throw { status: 0, message: "Resposta de login inválida" };
  }

  setAuthToken(res.token);
  return { token: res.token, user };
}

export async function gestorMe() {
  return await apiFetchAuth<{ user: GestorUser }>(`/api/auth/me`, { method: "GET" });
}

export function gestorLogout() {
  clearAuthToken();
}

