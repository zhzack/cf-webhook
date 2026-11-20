-- Migration for remote D1 bins and bin_members
ALTER TABLE bins ADD COLUMN description TEXT;
ALTER TABLE bins ADD COLUMN share_token TEXT;
ALTER TABLE bins ADD COLUMN is_public INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bins_user ON bins (user_id);
CREATE INDEX IF NOT EXISTS idx_bins_share_token ON bins (share_token);

CREATE TABLE IF NOT EXISTS bin_members (
  bin_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (bin_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bin_members_user ON bin_members (user_id);
CREATE INDEX IF NOT EXISTS idx_bin_members_bin ON bin_members (bin_id);
