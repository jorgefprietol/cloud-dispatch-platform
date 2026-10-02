import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
export type Order = { id:string; customer:string; destination:string; priority:'standard'|'express'; amount:number; status:'queued'|'dispatched'; createdAt:string; trackingCode:string|null; reportKey:string|null };
export type Dashboard = { total:number; queued:number; dispatched:number; volume:number };
type Config = { authMode:string; authority:string; clientId:string; redirectUri:string };
let manager: UserManager | undefined;
let demo = false;
export async function initializeAuth() {
  const response = await fetch('/config.json');
  if (!response.ok) throw new Error('No se pudo cargar la configuración.');
  const config:Config = await response.json(); demo = config.authMode === 'demo';
  if (!demo) {
    if (!config.authority || !config.clientId || !config.redirectUri) throw new Error('La autenticación no está configurada.');
    manager = new UserManager({ authority:config.authority, client_id:config.clientId, redirect_uri:config.redirectUri, response_type:'code', scope:'openid email profile', userStore:new WebStorageStateStore({store:sessionStorage}), automaticSilentRenew:false });
    if (location.pathname === '/auth/callback') { await manager.signinRedirectCallback(); history.replaceState({}, '', '/'); }
  }
  return signedIn();
}
export async function signedIn() { if (demo) return true; const user = await manager?.getUser(); return !!user && !user.expired; }
export async function login() { await manager?.signinRedirect(); }
export async function logout() { await manager?.removeUser(); location.reload(); }
export function isDemo() { return demo; }
async function headers() {
  const user = await manager?.getUser();
  if (!demo && (!user || user.expired)) throw new Error('La sesión expiró. Inicia sesión de nuevo.');
  return { 'Content-Type':'application/json', ...(user?.id_token ? {Authorization:`Bearer ${user.id_token}`} : {}) };
}
export async function api<T>(path:string, init:RequestInit = {}):Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers:{...await headers(), ...init.headers} });
  if (!response.ok) { const problem = await response.json().catch(() => ({})); throw new Error(problem.detail || (response.status === 401 ? 'La sesión expiró.' : `La operación falló (${response.status}).`)); }
  return response.json();
}
export async function downloadReport(order:Order) {
  const response = await fetch(`/api/orders/${order.id}/report`, {headers:await headers()});
  if (!response.ok) throw new Error('El reporte no está disponible.');
  const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `dispatch-${order.id}.json`; a.click(); URL.revokeObjectURL(url);
}
