import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { Post } from "../post/post.entity.js";
import { User } from "../user/user.entity.js";
import { PostLike } from "./post-like.entity.js";
import type { PostLikeSummary } from "./likes.schemas.js";

export class LikesService {
  private get likeRepo(): Repository<PostLike> {
    return AppDataSource.getRepository(PostLike);
  }

  private get postRepo(): Repository<Post> {
    return AppDataSource.getRepository(Post);
  }

  private get userRepo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async summaryForPost(postId: string, recentLimit = 50): Promise<PostLikeSummary | null> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) return null;

    const count = await this.likeRepo.count({ where: { postId } });
    const rows = await this.likeRepo.find({
      where: { postId },
      order: { createdAt: "DESC" },
      take: recentLimit,
      select: { userId: true, postId: true, createdAt: true },
    });
    return {
      postId,
      count,
      userIds: rows.map((r) => r.userId),
    };
  }

  async likePost(userId: string, postId: string): Promise<{ created: boolean }> {
    const [user, post] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.postRepo.findOne({ where: { id: postId } }),
    ]);
    if (!user) throw new Error("User not found");
    if (!post) throw new Error("Post not found");

    const existing = await this.likeRepo.findOne({
      where: { userId, postId },
    });
    if (existing) return { created: false };

    await this.likeRepo.insert({ userId, postId });
    return { created: true };
  }

  async unlikePost(userId: string, postId: string): Promise<{ removed: boolean }> {
    const result = await this.likeRepo.delete({ userId, postId });
    return { removed: (result.affected ?? 0) > 0 };
  }
}

export const likesService = new LikesService();
