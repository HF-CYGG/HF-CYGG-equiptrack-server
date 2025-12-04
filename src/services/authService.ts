import { readAll, writeAll, generateId } from "../utils/store";
import type { User, RegistrationRequest } from "../models/types";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export async function login(contact: string, password: string): Promise<{ user: Omit<User, "password">; token: string }> {
  const users = await readAll<User>("users");
  const found = users.find((u) => u.contact === contact && u.password === password);
  
  if (found) {
    // Check if user is banned
    if (found.status === 'BANNED' || found.status === 'banned') {
      throw Object.assign(new Error("账号已被封禁，请联系管理员"), { status: 403 });
    }
    const { password: _pw, ...safe } = found;
    const token = jwt.sign({ user: safe }, env.JWT_SECRET, { expiresIn: "7d" });
    return { user: safe, token };
  }

  // If not found in users, check pending registrations
  const pending = await readAll<RegistrationRequest>("registration_requests");
  const pendingRequest = pending.find(r => r.contact === contact && r.status === 'pending');
  
  if (pendingRequest) {
    // If password matches (optional check, but good for security/consistency)
    if (pendingRequest.password && pendingRequest.password === password) {
       throw Object.assign(new Error("账号正在审核中，请耐心等待"), { status: 403 });
    }
    // Even if password doesn't match, if the contact is pending, we might want to hint it, 
    // but to prevent enumeration, usually we be vague. 
    // However, for this internal-like app, being helpful is better.
    throw Object.assign(new Error("账号正在审核中，请耐心等待"), { status: 403 });
  }

  throw Object.assign(new Error("账号或密码错误"), { status: 401 });
}

export async function signup(input: {
  name: string;
  contact: string;
  departmentName: string;
  password: string;
  invitationCode: string;
}): Promise<{ message: string }> {
  const users = await readAll<User>("users");
  const pending = await readAll<RegistrationRequest>("registration_requests");

  // 验证邀请码：属于超级管理员/管理员/高级用户中的任意一位
  const inviter = users.find(
    (u) => u.invitationCode === input.invitationCode && ["超级管理员", "管理员", "高级用户"].includes(u.role)
  );
  if (!inviter) throw Object.assign(new Error("无效的邀请码"), { status: 400 });

  // Check for duplicate contact
  if (users.some((u) => u.contact === input.contact) || pending.some((r) => r.contact === input.contact)) {
    throw Object.assign(new Error("该联系方式已被注册或已在申请中，请更换手机号"), { status: 400 });
  }

  // Check for duplicate name
  if (users.some((u) => u.name === input.name) || pending.some((r) => r.name === input.name)) {
    throw Object.assign(new Error("该用户名已被使用或已在申请中，请更换用户名"), { status: 400 });
  }

  const req: RegistrationRequest = {
    id: generateId("reg"),
    name: input.name,
    contact: input.contact,
    departmentName: input.departmentName,
    invitationCode: input.invitationCode,
    invitedByUserId: inviter.id,
    status: "pending",
    createdAt: new Date().toISOString(),
    password: input.password,
  };
  pending.push(req);
  await writeAll<RegistrationRequest>("registration_requests", pending);
  return { message: "注册申请已提交，等待管理员批准。" };
}


