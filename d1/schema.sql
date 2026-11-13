-- Webhook Inspector D1 Schema

CREATE TABLE IF NOT EXISTS bins (
  id TEXT PRIMARY KEY,
  name TEXT,
  response_status INTEGER DEFAULT 200,
  response_content_type TEXT DEFAULT 'application/json',
  response_body TEXT DEFAULT '{"status":"ok"}',
  feishu_auto_challenge INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  bin_id TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT,
  headers TEXT NOT NULL,
  query_params TEXT NOT NULL,
  body TEXT,
  ip TEXT,
  user_agent TEXT,
  content_type TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_bin_created ON requests (bin_id, created_at DESC);

