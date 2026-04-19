import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { Post } from "../post/post.entity.js";
import { User } from "../user/user.entity.js";
import { Comment } from "./comment.entity.js";
import type { CommentPublic, CreateCommentInput } from "./comment.schemas.js";

function toPublic(c: Comment): CommentPublic {
  return {
    id: c.id,
    postId: c.postId,
    authorId: c.authorId,
    parentCommentId: c.parentCommentId,
    body: c.body,
    createdAt: c.createdAt,
  };
}

export class CommentService {
  private get repo(): Repository<Comment> {
    return AppDataSource.getRepository(Comment);
  }

  private get postRepo(): Repository<Post> {
    return AppDataSource.getRepository(Post);
  }

  private get userRepo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async findById(id: string): Promise<CommentPublic | null> {
    const c = await this.repo.findOne({ where: { id } });
    return c ? toPublic(c) : null;
  }

  async listByPost(
    postId: string,
    options: { limit: number; offset: number }
  ): Promise<CommentPublic[]> {
    const rows = await this.repo.find({
      where: { postId },
      order: { createdAt: "ASC" },
      take: options.limit,
      skip: options.offset,
    });
    return rows.map(toPublic);
  }

  async create(input: CreateCommentInput): Promise<CommentPublic> {
    const body = input.body?.trim();
    if (!body) throw new Error("Comment body is required");

    const [post, author] = await Promise.all([
      this.postRepo.findOne({ where: { id: input.postId } }),
      this.userRepo.findOne({ where: { id: input.authorId } }),
    ]);
    if (!post) throw new Error("Post not found");
    if (!author) throw new Error("User not found");

    let parentCommentId: string | null = input.parentCommentId ?? null;
    if (parentCommentId) {
      const parent = await this.repo.findOne({ where: { id: parentCommentId } });
      if (!parent) throw new Error("Parent comment not found");
      if (parent.postId !== input.postId) {
        throw new Error("Parent comment belongs to a different post");
      }
    }

    const row = this.repo.create({
      postId: input.postId,
      authorId: input.authorId,
      body,
      parentCommentId,
    });
    const saved = await this.repo.save(row);
    return toPublic(saved);
  }
}

export const commentService = new CommentService();
