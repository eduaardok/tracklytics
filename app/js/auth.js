import { pbLogin, pbRegister, pbGetUser } from './api.js';

export function getSession() {
  const raw = localStorage.getItem('pb_user');
  return raw ? JSON.parse(raw) : null;
}

export function getCurrentUser() {
  return getSession();
}

export function getToken() {
  return localStorage.getItem('pb_token');
}

export function isLoggedIn() {
  return !!getToken();
}

export function getRole() {
  const user = getSession();
  return user?.role || 'user';
}

export function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/autenticacion/login.html';
    return false;
  }
  return true;
}

export function requireRole(...roles) {
  if (!requireAuth()) return false;
  const role = getRole();
  if (!roles.includes(role)) {
    window.location.href = '/catalogo/home.html';
    return false;
  }
  return true;
}

export function hasAnalyticsAccess() {
  const user = getCurrentUser();
  if (!user) return false;
  return user.role === 'admin' || user.role === 'analyst';
}

export function logout() {
  localStorage.removeItem('pb_token');
  localStorage.removeItem('pb_user');
  window.location.href = '/autenticacion/login.html';
}

export async function login(email, password) {
  const data = await pbLogin(email, password);
  localStorage.setItem('pb_token', data.token);
  // Second call guarantees the full record including custom fields like 'role',
  // which auth-with-password may omit when they are empty.
  const fullRecord = await pbGetUser(data.record.id, data.token);
  localStorage.setItem('pb_user', JSON.stringify(fullRecord));
  return fullRecord;
}

export async function register(email, password, name, role) {
  await pbRegister(email, password, name, role);
  return login(email, password);
}

// Redirect root to home or login
export function handleRoot() {
  if (isLoggedIn()) {
    window.location.href = '/catalogo/home.html';
  } else {
    window.location.href = '/autenticacion/login.html';
  }
}
