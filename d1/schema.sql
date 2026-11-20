-- Webhook Inspector D1 Schema

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  nickname TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- 频道表 (Bins)
CREATE TABLE IF NOT EXISTS bins (
  id TEXT PRIMARY KEY,
  user_id TEXT, -- 拥有者ID (可为空表示匿名创建)
  name TEXT,
  description TEXT,
  response_status INTEGER DEFAULT 200,
  response_content_type TEXT DEFAULT 'application/json',
  response_body TEXT DEFAULT '{"status":"ok"}',
  feishu_auto_challenge INTEGER DEFAULT 1,
  share_token TEXT, -- 协作分享口令/只读Token
  is_public INTEGER DEFAULT 0, -- 0: 私有 (需成员授权), 1: 凭Token公开只读
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bins_user ON bins (user_id);
CREATE INDEX IF NOT EXISTS idx_bins_share_token ON bins (share_token);

-- 频道协作成员表 (Bin Members)
CREATE TABLE IF NOT EXISTS bin_members (
  bin_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner (所有者), editor (协作者), viewer (查看者)
  created_at INTEGER NOT NULL,
  PRIMARY KEY (bin_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bin_members_user ON bin_members (user_id);
CREATE INDEX IF NOT EXISTS idx_bin_members_bin ON bin_members (bin_id);

-- 请求历史表 (Requests)
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
