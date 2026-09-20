CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id TEXT NOT NULL UNIQUE,
  start_ts INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  submit_ts INTEGER,
  status TEXT NOT NULL CHECK(status IN ('in_progress', 'submitted', 'auto_submitted'))
);

CREATE TABLE IF NOT EXISTS answers (
  attempt_id INTEGER NOT NULL REFERENCES attempts(id),
  question_id TEXT NOT NULL,
  selected_option TEXT,
  answered_ts INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, question_id)
);

-- Leitner-box spaced-repetition state for the flashcards feature, one row
-- per corpus question_id (e.g. "Q131"), created on first answer.
CREATE TABLE IF NOT EXISTS flashcard_progress (
  question_id TEXT PRIMARY KEY,
  box INTEGER NOT NULL DEFAULT 1,
  due_ts INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  last_result TEXT,
  last_seen_ts INTEGER
);
