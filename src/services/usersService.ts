import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";
import type { UserRole } from "../models/types";
import { Like } from "typeorm";

export async function listUsers(query?: string): Promise<User[]> {
  const userRepo = AppDataSource.getRepository(User);
  if (query) {
      return userRepo.find({
          where: [
              { name: Like(`%${query}%`) },
              { contact: Like(`%${query}%`) }
          ]
      });
  }
  return userRepo.find();
}

export async function getUser(id: string): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ id });
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  return user;
}

export async function addUser(input: Omit<User, "id">): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);
  // Check duplicate
  const existing = await userRepo.findOneBy({ contact: input.contact });
  if (existing) throw Object.assign(new Error("Contact already exists"), { status: 400 });

  const user = userRepo.create({
      ...input,
      id: generateId("user")
  });
  await userRepo.save(user);
  return user;
}

export async function updateUser(id: string, input: Partial<User>): Promise<User> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ id });
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  
  userRepo.merge(user, input);
  await userRepo.save(user);
  return user;
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const result = await userRepo.delete(id);
  if (result.affected === 0) throw Object.assign(new Error("User not found"), { status: 404 });
  return { message: "User deleted" };
}

export async function filterUsers(
    users: User[],
    opts: { role?: UserRole; departmentId?: string }
): Promise<User[]> {
    // This function filters in memory, useful if listUsers returned all
    // But better to filter in DB if possible.
    // However, to keep signature compatible if used elsewhere
    let res = users;
    if (opts.role) {
        res = res.filter(u => u.role === opts.role);
    }
    if (opts.departmentId) {
        res = res.filter(u => u.departmentId === opts.departmentId);
    }
    return res;
}
