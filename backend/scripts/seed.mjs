/**
 * Generates reproducible social-graph data for benchmarking.
 * Env: PG_* same as backend; SEED_USERS, SEED_POSTS, etc.
 */
import dotenv from "dotenv";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const cfg = {
  host: process.env.PG_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_PORT ?? 5432),
  user: process.env.PG_USER ?? "bench",
  password: process.env.PG_PASSWORD ?? "benchdev",
  database: process.env.PG_DATABASE ?? "socialbench",
};

const N = {
  users: Number(process.env.SEED_USERS ?? 1200),
  posts: Number(process.env.SEED_POSTS ?? 8000),
  comments: Number(process.env.SEED_COMMENTS ?? 45000),
  postLikes: Number(process.env.SEED_POST_LIKES ?? 150000),
  follows: Number(process.env.SEED_FOLLOWS ?? 15000),
  hashtags: Number(process.env.SEED_HASHTAGS ?? 180),
  postHashtagLinks: Number(process.env.SEED_POST_HASHTAG_LINKS ?? 12000),
  savedPosts: Number(process.env.SEED_SAVED_POSTS ?? 4000),
  conversations: Number(process.env.SEED_CONVERSATIONS ?? 800),
  messages: Number(process.env.SEED_MESSAGES ?? 6000),
  notifications: Number(process.env.SEED_NOTIFICATIONS ?? 8000),
};

const TAGS = [
  "dev",
  "sql",
  "postgres",
  "database",
  "backend",
  "frontend",
  "learning",
  "bench",
  "index",
  "explain",
  "performance",
  "coding",
  "opensource",
  "portfolio",
  "news",
  "sports",
  "music",
  "travel",
  "food",
  "life",
  "tech",
];

const WORDS = [
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "just",
  "like",
  "really",
  "great",
  "post",
  "thread",
  "update",
  "build",
  "ship",
  "learn",
  "grow",
  "share",
  "connect",
  "follow",
];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function sentence(rng, minW, maxW) {
  const n = minW + Math.floor(rng() * (maxW - minW + 1));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(rng, WORDS));
  const s = parts.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function paragraph(rng) {
  const n = 2 + Math.floor(rng() * 4);
  const out = [];
  for (let i = 0; i < n; i++) out.push(sentence(rng, 6, 14));
  return out.join(" ");
}

async function batchInsert(client, table, columns, rows, chunk = 400) {
  if (!rows.length) return;
  const cols = columns.join(", ");
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const valueGroups = [];
    const params = [];
    let idx = 1;
    for (const row of slice) {
      const placeholders = row.map((cell) => {
        params.push(cell);
        return `$${idx++}`;
      });
      valueGroups.push(`(${placeholders.join(", ")})`);
    }
    const sql = `INSERT INTO ${table} (${cols}) VALUES ${valueGroups.join(", ")}`;
    await client.query(sql, params);
  }
}

async function main() {
  const seed = Number(process.env.SEED_RANDOM ?? 20260419);
  const rng = mulberry32(seed);
  console.log("Connecting…", cfg.host, cfg.database);
  const pool = new pg.Pool(cfg);
  const client = await pool.connect();

  try {
    console.log("Truncating tables…");
    await client.query(`
      TRUNCATE TABLE
        notifications,
        messages,
        conversation_members,
        conversations,
        user_saved_posts,
        post_hashtags,
        comment_likes,
        post_likes,
        comments,
        posts,
        hashtags,
        user_follows,
        users
      RESTART IDENTITY CASCADE;
    `);

    console.log(`Users ${N.users}…`);
    const users = [];
    for (let i = 1; i <= N.users; i++) {
      const u = `user_${i}`;
      users.push([
        u,
        `${u}@example.test`,
        `User ${i}`,
        rng() > 0.4 ? paragraph(rng).slice(0, 240) : null,
        null,
      ]);
    }
    await batchInsert(client, "users", ["username", "email", "display_name", "bio", "avatar_url"], users);

    console.log(`Follows ${N.follows}…`);
    const follows = new Set();
    while (follows.size < N.follows) {
      const a = 1 + Math.floor(rng() * N.users);
      const b = 1 + Math.floor(rng() * N.users);
      if (a === b) continue;
      follows.add(`${a},${b}`);
    }
    const followRows = [...follows].map((k) => k.split(",").map(Number));
    await batchInsert(client, "user_follows", ["follower_id", "following_id"], followRows);

    console.log(`Posts ${N.posts}…`);
    const posts = [];
    for (let i = 0; i < N.posts; i++) {
      const author = 1 + Math.floor(rng() * N.users);
      const body = paragraph(rng);
      const vis = rng() < 0.88 ? "public" : rng() < 0.7 ? "followers" : "private";
      posts.push([author, body, null, vis]);
    }
    await batchInsert(
      client,
      "posts",
      ["author_id", "body", "repost_of_post_id", "visibility"],
      posts
    );

    const {
      rows: [{ pc }],
    } = await client.query(`SELECT COUNT(*)::int AS pc FROM posts`);
    const postCount = Number(pc);

    console.log(`Comments ${N.comments}…`);
    const comments = [];
    for (let i = 0; i < N.comments; i++) {
      const postId = 1 + Math.floor(rng() * postCount);
      const author = 1 + Math.floor(rng() * N.users);
      const body = sentence(rng, 4, 12);
      comments.push([postId, author, null, body]);
    }
    await batchInsert(
      client,
      "comments",
      ["post_id", "author_id", "parent_comment_id", "body"],
      comments
    );

    const {
      rows: [{ cc }],
    } = await client.query(`SELECT COUNT(*)::int AS cc FROM comments`);
    const commentCount = Number(cc);

    console.log(`Post likes ${N.postLikes}…`);
    const likes = new Set();
    let guard = 0;
    while (likes.size < N.postLikes && guard++ < N.postLikes * 25) {
      const uid = 1 + Math.floor(rng() * N.users);
      const pid = 1 + Math.floor(rng() * postCount);
      likes.add(`${uid},${pid}`);
    }
    const likeRows = [...likes].map((k) => k.split(",").map(Number));
    await batchInsert(client, "post_likes", ["user_id", "post_id"], likeRows);

    console.log(`Hashtags ${N.hashtags}…`);
    const tagRows = [];
    const used = new Set();
    for (let i = 0; i < N.hashtags; i++) {
      const base = pick(rng, TAGS);
      const tag = `${base}_${i}`;
      if (used.has(tag)) continue;
      used.add(tag);
      tagRows.push([tag]);
    }
    await batchInsert(client, "hashtags", ["tag"], tagRows);

    const {
      rows: [{ hc }],
    } = await client.query(`SELECT COUNT(*)::int AS hc FROM hashtags`);
    const hashtagCount = Number(hc);

    console.log(`Post ↔ hashtag links ${N.postHashtagLinks}…`);
    const ph = new Set();
    guard = 0;
    while (ph.size < N.postHashtagLinks && guard++ < N.postHashtagLinks * 25) {
      const pid = 1 + Math.floor(rng() * postCount);
      const hid = 1 + Math.floor(rng() * hashtagCount);
      ph.add(`${pid},${hid}`);
    }
    const phRows = [...ph].map((k) => k.split(",").map(Number));
    await batchInsert(client, "post_hashtags", ["post_id", "hashtag_id"], phRows);

    console.log(`Saved posts ${N.savedPosts}…`);
    const sv = new Set();
    guard = 0;
    while (sv.size < N.savedPosts && guard++ < N.savedPosts * 30) {
      const uid = 1 + Math.floor(rng() * N.users);
      const pid = 1 + Math.floor(rng() * postCount);
      sv.add(`${uid},${pid}`);
    }
    await batchInsert(
      client,
      "user_saved_posts",
      ["user_id", "post_id"],
      [...sv].map((k) => k.split(",").map(Number))
    );

    console.log(`DMs: conversations ${N.conversations}, messages ${N.messages}…`);
    const convMemberMap = new Map();
    for (let i = 0; i < N.conversations; i++) {
      const {
        rows: [row],
      } = await client.query(
        `INSERT INTO conversations DEFAULT VALUES RETURNING id`
      );
      const cid = Number(row.id);
      let a = 1 + Math.floor(rng() * N.users);
      let b = 1 + Math.floor(rng() * N.users);
      if (a === b) b = (a % N.users) + 1;
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($3, $4)`,
        [cid, a, cid, b]
      );
      convMemberMap.set(cid, [a, b]);
    }

    const convIds = [...convMemberMap.keys()];
    const msgRows = [];
    for (let i = 0; i < N.messages; i++) {
      const cid = convIds[Math.floor(rng() * convIds.length)];
      const members = convMemberMap.get(cid);
      const sender = members[Math.floor(rng() * members.length)];
      msgRows.push([cid, sender, sentence(rng, 3, 10)]);
    }
    await batchInsert(client, "messages", ["conversation_id", "sender_id", "body"], msgRows);

    console.log(`Notifications ${N.notifications}…`);
    const notifTypes = ["follow", "like_post", "comment", "mention", "repost"];
    const notifs = [];
    for (let i = 0; i < N.notifications; i++) {
      const userId = 1 + Math.floor(rng() * N.users);
      let actorId = 1 + Math.floor(rng() * N.users);
      if (userId === actorId) actorId = (actorId % N.users) + 1;
      const type = pick(rng, notifTypes);
      const postId = type === "follow" ? null : 1 + Math.floor(rng() * postCount);
      const commentId = type === "comment" ? 1 + Math.floor(rng() * commentCount) : null;
      const readAt = rng() < 0.35 ? new Date(Date.now() - Math.floor(rng() * 1e10)) : null;
      notifs.push([userId, actorId, type, postId, commentId, readAt]);
    }
    await batchInsert(
      client,
      "notifications",
      ["user_id", "actor_id", "type", "post_id", "comment_id", "read_at"],
      notifs
    );

    await client.query(
      `INSERT INTO hashtags (tag) VALUES ('dev'), ('sql'), ('postgres') ON CONFLICT (tag) DO NOTHING`
    );
    const {
      rows: [hidRow],
    } = await client.query(`SELECT id FROM hashtags WHERE tag = 'dev' LIMIT 1`);
    if (hidRow?.id) {
      await client.query(
        `INSERT INTO post_hashtags (post_id, hashtag_id)
         SELECT p.id, $1::bigint FROM posts p
         WHERE p.visibility = 'public'::post_visibility
         ORDER BY p.id
         LIMIT 800
         ON CONFLICT (post_id, hashtag_id) DO NOTHING`,
        [hidRow.id]
      );
    }

    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
