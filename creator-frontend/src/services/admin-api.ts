export interface AdminModel {
  id: string
  endpoint: string
  nameCn: string
  nameEn: string
  category: string
  taskType: string
  outputType: string
  inputTypes: string[]
  params: Record<string, unknown>[]
  className: string
  status: 'draft' | 'published' | 'disabled'
  visible: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminModelsResponse {
  success: boolean
  data: AdminModel[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export interface AdminStats {
  total: number
  published: number
  disabled: number
  draft: number
}

const BASE = '/api/admin';

function token(): string {
  return localStorage.getItem('admin_token') || '';
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token()}`,
  };
}

export async function login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.json();
}

export function isAuthenticated(): boolean {
  return !!token();
}

export function logout(): void {
  localStorage.removeItem('admin_token');
}

export async function fetchModels(params?: {
  page?: number
  limit?: number
  search?: string
  category?: string
  status?: string
}): Promise<AdminModelsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.search) searchParams.set('search', params.search);
  if (params?.category && params.category !== 'all') searchParams.set('category', params.category);
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status);

  const url = `${BASE}/models?${searchParams.toString()}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) throw new Error('获取模型列表失败');
  return res.json();
}

export async function fetchModel(id: string): Promise<{ success: boolean; data: AdminModel }> {
  const res = await fetch(`${BASE}/models/${id}`, { headers: authHeaders() });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) throw new Error('获取模型失败');
  return res.json();
}

export async function createModel(data: Partial<AdminModel>): Promise<{ success: boolean; data: AdminModel }> {
  const res = await fetch(`${BASE}/models`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '创建失败' }));
    throw new Error(err.error || '创建失败');
  }
  return res.json();
}

export async function updateModel(id: string, data: Partial<AdminModel>): Promise<{ success: boolean; data: AdminModel }> {
  const res = await fetch(`${BASE}/models/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '更新失败' }));
    throw new Error(err.error || '更新失败');
  }
  return res.json();
}

export async function deleteModel(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/models/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '删除失败' }));
    throw new Error(err.error || '删除失败');
  }
  return res.json();
}

export async function batchOperation(ids: string[], action: 'publish' | 'disable'): Promise<{ success: boolean; affected: number }> {
  const res = await fetch(`${BASE}/models/batch`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ ids, action }),
  });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '批量操作失败' }));
    throw new Error(err.error || '批量操作失败');
  }
  return res.json();
}

export async function fetchCategories(): Promise<{ success: boolean; data: string[] }> {
  const res = await fetch(`${BASE}/models/categories`, { headers: authHeaders() });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) throw new Error('获取分类失败');
  return res.json();
}

export async function fetchStats(): Promise<{ success: boolean; data: AdminStats }> {
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders() });
  if (res.status === 401) { logout(); throw new Error('未授权'); }
  if (!res.ok) throw new Error('获取统计失败');
  return res.json();
}
