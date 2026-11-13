export interface Bin {
  id: string;
  name?: string;
  response_status: number;
  response_content_type: string;
  response_body: string;
  feishu_auto_challenge: number;
  created_at: number;
  updated_at: number;
}

export interface WebhookRecord {
  id: string;
  bin_id: string;
  method: string;
  url: string;
  path: string;
  headers: string; // JSON string
  query_params: string; // JSON string
  body: string | null;
  ip: string | null;
  user_agent: string | null;
  content_type: string | null;
  created_at: number;
}

