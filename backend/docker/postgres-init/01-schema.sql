-- Social-style schema for benchmarking (PostgreSQL 16+)
SET client_encoding = 'UTF8';

CREATE TYPE post_visibility AS ENUM ('public', 'followers', 'private');
CREATE TYPE notification_type AS ENUM ('follow', 'like_post', 'comment', 'mention', 'repost');

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  bio TEXT,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(bio, ''))) STORED,
  avatar_url VARCHAR(512),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_users_username ON users (username);
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE INDEX idx_users_created_at ON users (created_at);
CREATE INDEX idx_users_search_vector ON users USING gin (search_vector);

CREATE TABLE user_follows (
  follower_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  following_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT chk_follows_not_self CHECK (follower_id <> following_id)
);

CREATE INDEX idx_follows_following ON user_follows (following_id);

CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED,
  repost_of_post_id BIGINT REFERENCES posts (id) ON DELETE SET NULL,
  visibility post_visibility NOT NULL DEFAULT 'public',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_author_created ON posts (author_id, created_at DESC);
CREATE INDEX idx_posts_created_at ON posts (created_at);
CREATE INDEX idx_posts_repost ON posts (repost_of_post_id);
CREATE INDEX idx_posts_search_vector ON posts USING gin (search_vector);

CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_comment_id BIGINT REFERENCES comments (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comments_post_created ON comments (post_id, created_at);
CREATE INDEX idx_comments_search_vector ON comments USING gin (search_vector);
CREATE INDEX idx_comments_author ON comments (author_id);
CREATE INDEX idx_comments_parent ON comments (parent_comment_id);

CREATE TABLE post_likes (
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_post_likes_post ON post_likes (post_id);

CREATE TABLE comment_likes (
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  comment_id BIGINT NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX idx_comment_likes_comment ON comment_likes (comment_id);

CREATE TABLE hashtags (
  id BIGSERIAL PRIMARY KEY,
  tag VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_hashtags_tag ON hashtags (tag);

CREATE TABLE post_hashtags (
  post_id BIGINT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  hashtag_id BIGINT NOT NULL REFERENCES hashtags (id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, hashtag_id)
);

CREATE INDEX idx_post_hashtags_hashtag ON post_hashtags (hashtag_id);

CREATE TABLE user_saved_posts (
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX idx_saved_post ON user_saved_posts (post_id);

CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversation_members (
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX idx_cm_user ON conversation_members (user_id);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conv_created ON messages (conversation_id, created_at);
CREATE INDEX idx_messages_sender ON messages (sender_id);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  actor_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  post_id BIGINT REFERENCES posts (id) ON DELETE CASCADE,
  comment_id BIGINT REFERENCES comments (id) ON DELETE CASCADE,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notif_user_unread ON notifications (user_id, read_at, created_at);
CREATE INDEX idx_notif_actor ON notifications (actor_id);

-- Bench / index-type showcase (see migration 1740800000000-BenchIndexTypes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_posts_body_trgm ON posts USING gin (body gin_trgm_ops);
CREATE INDEX idx_comments_body_trgm ON comments USING gin (body gin_trgm_ops);
CREATE INDEX idx_users_bio_trgm ON users USING gin (bio gin_trgm_ops);

CREATE INDEX idx_posts_search_vector_gist ON posts USING gist (search_vector);
CREATE INDEX idx_comments_search_vector_gist ON comments USING gist (search_vector);
CREATE INDEX idx_users_search_vector_gist ON users USING gist (search_vector);

CREATE INDEX idx_posts_id_hash ON posts USING hash (id);
CREATE INDEX idx_users_id_hash ON users USING hash (id);

CREATE INDEX idx_posts_public_created_at ON posts (created_at DESC) WHERE visibility = 'public'::post_visibility;

CREATE INDEX idx_posts_author_covering ON posts (author_id) INCLUDE (body, visibility, created_at);

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER tr_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
