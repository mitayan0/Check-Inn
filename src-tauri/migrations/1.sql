CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT DEFAULT 'working',
  tasks TEXT, -- JSON array
  breaks TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
