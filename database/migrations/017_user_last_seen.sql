-- Server-side idle timeout: the last time the user did something, refreshed at most once a minute.
-- A session idle for longer than the limit is rejected even though its token has not expired yet.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
