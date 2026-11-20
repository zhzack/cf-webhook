export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  JWT_SECRET?: string;
  AUTH_URL?: string;
  ROOT_DOMAIN?: string;
}

export interface UserSession {
  id: string;
  username: string;
  nickname?: string;
  role?: string;
  status?: string;
  allowedApps?: string[];
}

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  nickname?: string;
  created_at: number;
}

export interface Bin {
  id: string;
  user_id?: string | null;
  name?: string;
  description?: string | null;
  response_status: number;
  response_content_type: string;
  response_body: string;
  feishu_auto_challenge: number; // 1: true, 0: false
  share_token?: string | null;
  is_public: number; // 0: private, 1: token public
  created_at: number;
  updated_at: number;
  // 附加计算属性
  role?: 'owner' | 'editor' | 'viewer';
  owner_name?: string;
  request_count?: number;
}

export interface BinMember {
  bin_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: number;
  username?: string;
  nickname?: string;
}

export interface WebhookRecord {
  id: string;
  bin_id: string;
  method: string;
  url: string;
  path: string;
  headers: string; // JSON
  query_params: string; // JSON
  body: string | null;
  ip: string | null;
  user_agent: string | null;
  content_type: string | null;
  created_at: number;
}

export interface OutboundRequestPayload {
  url: string;
  method: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  auth?: {
    type: 'none' | 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
}

export interface OutboundResponseData {
  success: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}
