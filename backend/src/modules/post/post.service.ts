import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { Post } from "./post.entity.js";
import type { PostPublic } from "./post.schemas.js";

function toPublic(p: Post): PostPublic {
  return {
    id: p.id,
    authorId: p.authorId,
    body: p.body,
    repostOfPostId: p.repostOfPostId,
    visibility: p.visibility,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export class PostService {
  private get repo(): Repository<Post> {
    return AppDataSource.getRepository(Post);
  }

  async findById(id: string): Promise<PostPublic | null> {
    const p = await this.repo.findOne({ where: { id } });
    return p ? toPublic(p) : null;
  }

  async listByAuthor(
    authorId: string,
    options: { limit: number; offset: number }
  ): Promise<PostPublic[]> {
    const rows = await this.repo.find({
      where: { authorId },
      order: { createdAt: "DESC" },
      take: options.limit,
      skip: options.offset,
    });
    return rows.map(toPublic);
  }

  async listRecent(options: { limit: number; offset: number }): Promise<PostPublic[]> {
    const rows = await this.repo.find({
      order: { createdAt: "DESC" },
      take: options.limit,
      skip: options.offset,
    });
    return rows.map(toPublic);
  }
}

export const postService = new PostService();
