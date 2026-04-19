# Database data model (PostgreSQL)

Source of truth: [`backend/docker/postgres-init/01-schema.sql`](../backend/docker/postgres-init/01-schema.sql).

## Enums

| Name | Values |
|------|--------|
| `post_visibility` | `public`, `followers`, `private` |
| `notification_type` | `follow`, `like_post`, `comment`, `mention`, `repost` |

---

## Entity–relationship diagram

```mermaid
erDiagram
  users {
    bigint id PK
    varchar username UK
    varchar email UK
    varchar display_name
    text bio
    varchar avatar_url
    timestamp created_at
    timestamp updated_at
  }

  user_follows {
    bigint follower_id FK
    bigint following_id FK
    timestamp created_at
  }

  posts {
    bigint id PK
    bigint author_id FK
    text body
    bigint repost_of_post_id FK
    post_visibility visibility
    timestamp created_at
    timestamp updated_at
  }

  comments {
    bigint id PK
    bigint post_id FK
    bigint author_id FK
    bigint parent_comment_id FK
    text body
    timestamp created_at
  }

  post_likes {
    bigint user_id FK
    bigint post_id FK
    timestamp created_at
  }

  comment_likes {
    bigint user_id FK
    bigint comment_id FK
    timestamp created_at
  }

  hashtags {
    bigint id PK
    varchar tag UK
    timestamp created_at
  }

  post_hashtags {
    bigint post_id FK
    bigint hashtag_id FK
    timestamp created_at
  }

  user_saved_posts {
    bigint user_id FK
    bigint post_id FK
    timestamp created_at
  }

  conversations {
    bigint id PK
    timestamp created_at
  }

  conversation_members {
    bigint conversation_id FK
    bigint user_id FK
    timestamp joined_at
  }

  messages {
    bigint id PK
    bigint conversation_id FK
    bigint sender_id FK
    text body
    timestamp created_at
  }

  notifications {
    bigint id PK
    bigint user_id FK
    bigint actor_id FK
    notification_type type
    bigint post_id FK
    bigint comment_id FK
    timestamp read_at
    timestamp created_at
  }

  users ||--o{ posts : "authors"
  posts ||--o| posts : "repost_of"

  users ||--o{ user_follows : "follower"
  users ||--o{ user_follows : "following"

  posts ||--o{ comments : "on_post"
  users ||--o{ comments : "author"
  comments ||--o| comments : "parent_thread"

  users ||--o{ post_likes : "liked_by"
  posts ||--o{ post_likes : "likes"

  users ||--o{ comment_likes : "liked_by"
  comments ||--o{ comment_likes : "likes"

  hashtags ||--o{ post_hashtags : "tagged"
  posts ||--o{ post_hashtags : "tags"

  users ||--o{ user_saved_posts : "saved_by"
  posts ||--o{ user_saved_posts : "saved"

  conversations ||--o{ conversation_members : "has_member"
  users ||--o{ conversation_members : "member_of"

  conversations ||--o{ messages : "contains"
  users ||--o{ messages : "sender"

  users ||--o{ notifications : "recipient"
  users ||--o{ notifications : "actor"
  posts ||--o{ notifications : "ref_post"
  comments ||--o{ notifications : "ref_comment"
```

### Notes

- **`user_follows`**: composite PK `(follower_id, following_id)`; check `follower_id <> following_id`.
- **`post_likes`**, **`comment_likes`**, **`post_hashtags`**, **`user_saved_posts`**, **`conversation_members`**: composite primary keys on the FK columns shown.
- **`notifications`**: `post_id` and `comment_id` are nullable (e.g. `follow` may omit post/comment).
- **`posts.updated_at` / `users.updated_at`**: maintained by triggers (`trigger_set_updated_at`).
