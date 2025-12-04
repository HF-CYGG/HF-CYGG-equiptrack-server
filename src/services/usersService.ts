import { readAll, writeAll, generateId } from "../utils/store";
import type { User, UserRole } from "../models/types";

const COLLECTION = "users";

export async function listUsers(): Promise<User[]> {
  return readAll<User>(COLLECTION);
}

export async function getUser(id: string): Promise<User> {
  const cleanId = id.trim();
  const list = await listUsers();
  const found = list.find((u) => u.id === cleanId);
  if (!found) throw Object.assign(new Error("User not found"), { status: 404 });
  return found;
}

export async function addUser(input: Omit<User, "id" | "status">): Promise<User> {
  const list = await listUsers();
  if (list.find((u) => u.contact === input.contact)) {
    throw Object.assign(new Error("该联系方式已被注册"), { status: 400 });
  }
  // Check invitation code uniqueness if provided
  if (input.invitationCode) {
    if (list.find((u) => u.invitationCode === input.invitationCode)) {
      throw Object.assign(new Error("邀请码已存在"), { status: 400 });
    }
  }
  const user: User = { ...input, id: generateId("user"), status: "active" };
  list.push(user);
  await writeAll<User>(COLLECTION, list);
  return user;
}

export async function updateUser(id: string, input: Partial<User>): Promise<User> {
  const cleanId = id.trim();
  const list = await listUsers();
  const idx = list.findIndex((u) => u.id === cleanId);
  if (idx === -1) throw Object.assign(new Error("User not found"), { status: 404 });

  // Check invitation code uniqueness if provided
  if (input.invitationCode) {
    const duplicate = list.find(u => u.invitationCode === input.invitationCode && u.id !== cleanId);
    if (duplicate) {
      throw Object.assign(new Error("邀请码已存在"), { status: 400 });
    }
  }

  // Check contact uniqueness if provided
  if (input.contact) {
    const duplicate = list.find(u => u.contact === input.contact && u.id !== cleanId);
    if (duplicate) {
      throw Object.assign(new Error("该联系方式已被注册"), { status: 400 });
    }
  }

  const merged = { ...list[idx], ...input, id: cleanId } as User;
  list[idx] = merged;
  await writeAll<User>(COLLECTION, list);
  return merged;
}

export async function deleteUser(id: string): Promise<User> {
  const cleanId = id.trim();
  console.log(`[usersService] Attempting to delete user with id: "${cleanId}" (original: "${id}")`);
  const list = await listUsers();
  console.log(`[usersService] Available user IDs: ${list.map(u => `"${u.id}"`).join(", ")}`);
  const idx = list.findIndex((u) => u.id === cleanId);
  
  if (idx === -1) {
    console.warn(`[usersService] User not found: "${cleanId}". Returning dummy user for idempotency.`);
    // Return a dummy user object to satisfy Android client's Response<User> expectation
    return {
      id: cleanId,
      name: "Deleted User",
      contact: "",
      departmentId: "",
      departmentName: "",
      role: "普通用户",
      password: "",
      status: "deleted"
    } as User;
  }

  const deletedUser = list[idx];
  list.splice(idx, 1);
  await writeAll<User>(COLLECTION, list);
  return deletedUser;
}

export function filterUsers(
  users: User[],
  opts: { userRole: UserRole; departmentId?: string }
): User[] {
  if (opts.userRole === "超级管理员") {
    return opts.departmentId ? users.filter((u) => u.departmentId === opts.departmentId) : users;
  }
  if (!opts.departmentId) {
    throw Object.assign(new Error("departmentId is required for this role"), { status: 400 });
  }
  return users.filter((u) => u.departmentId === opts.departmentId);
}