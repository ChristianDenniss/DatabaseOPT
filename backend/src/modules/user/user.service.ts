import type { Repository } from "typeorm";
import { AppDataSource } from "../../data-source.js";
import { User } from "./user.entity.js";
import type { UserPublic } from "./user.schemas.js";

function toPublic(u: User): UserPublic {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export class UserService {
  private get repo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async findById(id: string): Promise<UserPublic | null> {
    const u = await this.repo.findOne({ where: { id } });
    return u ? toPublic(u) : null;
  }

  async list(options: { limit: number; offset: number }): Promise<UserPublic[]> {
    const rows = await this.repo.find({
      order: { id: "ASC" },
      take: options.limit,
      skip: options.offset,
    });
    return rows.map(toPublic);
  }
}

export const userService = new UserService();
