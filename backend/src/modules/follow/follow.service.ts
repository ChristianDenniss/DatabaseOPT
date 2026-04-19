import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { User } from "../user/user.entity.js";
import { UserFollow } from "./user-follow.entity.js";
import type { FollowListResult } from "./follow.schemas.js";

export class FollowService {
  private get repo(): Repository<UserFollow> {
    return AppDataSource.getRepository(UserFollow);
  }

  private get userRepo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async follow(followerId: string, followingId: string): Promise<{ created: boolean }> {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }
    const [a, b] = await Promise.all([
      this.userRepo.findOne({ where: { id: followerId } }),
      this.userRepo.findOne({ where: { id: followingId } }),
    ]);
    if (!a || !b) throw new Error("User not found");

    const existing = await this.repo.findOne({
      where: { followerId, followingId },
    });
    if (existing) return { created: false };

    await this.repo.insert({ followerId, followingId });
    return { created: true };
  }

  async unfollow(followerId: string, followingId: string): Promise<{ removed: boolean }> {
    const result = await this.repo.delete({ followerId, followingId });
    return { removed: (result.affected ?? 0) > 0 };
  }

  async listFollowing(
    userId: string,
    options: { limit: number; offset: number }
  ): Promise<FollowListResult> {
    const [rows, total] = await this.repo.findAndCount({
      where: { followerId: userId },
      order: { createdAt: "DESC" },
      take: options.limit,
      skip: options.offset,
    });
    return {
      userIds: rows.map((r) => r.followingId),
      total,
      limit: options.limit,
      offset: options.offset,
    };
  }

  async listFollowers(
    userId: string,
    options: { limit: number; offset: number }
  ): Promise<FollowListResult> {
    const [rows, total] = await this.repo.findAndCount({
      where: { followingId: userId },
      order: { createdAt: "DESC" },
      take: options.limit,
      skip: options.offset,
    });
    return {
      userIds: rows.map((r) => r.followerId),
      total,
      limit: options.limit,
      offset: options.offset,
    };
  }
}

export const followService = new FollowService();
