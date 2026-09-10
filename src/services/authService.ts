import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { RegistrationRequest } from "../entities/RegistrationRequest";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { notifyAdmins } from "./notificationService";
import crypto from "crypto";

export function isHashedPassword(value: string): boolean {
  return typeof value === "string" && value.startsWith("scrypt$");
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(stored: string, provided: string): boolean {
  if (!isHashedPassword(stored)) {
    return stored === provided;
  }
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const saltHex = parts[1];
  const hashHex = parts[2];
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(provided, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function hashPasswordIfNeeded(value: string): string {
  return isHashedPassword(value) ? value : hashPassword(value);
}

export async function login(contact: string, pass: string): Promise<{ user: User; token: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ contact });

  // 用户不存在与密码错误必须返回同样的结果，否则可以枚举出有效账号
  // （contact 同时是登录名）。对不存在的用户也跑一次同样开销的哈希，
  // 消除响应时间上的差异。
  const invalidCredentials = () =>
    Object.assign(new Error("账号或密码错误"), { status: 401 });

  if (!user) {
    hashPassword(pass);
    throw invalidCredentials();
  }
  if (!verifyPassword(user.password, pass)) {
    throw invalidCredentials();
  }
  if (!isHashedPassword(user.password)) {
    user.password = hashPassword(pass);
    await userRepo.save(user);
  }
  
  if (user.status && user.status !== "active") {
      throw Object.assign(new Error("账户已被禁用"), { status: 403 });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, departmentId: user.departmentId },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return { user, token };
}

export async function signup(payload: {
  name: string;
  contact: string;
  departmentName: string; // User inputs department name manually? Or selects ID? 
  // In original code, it seems they input department name string for registration request.
  invitationCode: string;
  invitedByUserId?: string;
  password: string;
}): Promise<{ message: string; requestId: string }> {
  // Check if user exists
  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOneBy({ contact: payload.contact });
  if (existing) throw Object.assign(new Error("该联系方式已被注册"), { status: 400 });

  // Check if pending request exists
  const regRepo = AppDataSource.getRepository(RegistrationRequest);
  const existingReq = await regRepo.findOneBy({ contact: payload.contact, status: "pending" });
  if (existingReq) {
      throw Object.assign(new Error("您的注册申请正在审核中，请勿重复提交"), { status: 400 });
  }

  // 校验邀请码。此前它只是被原样存进注册申请，全代码库没有任何一处比对，
  // 于是任何人填任意字符串都能提交申请；而 invitedByUserId 同样来自未认证的
  // 请求体，「高级用户」正是靠这个字段获得审批权，等于可以自行制造下属账号。
  const inviter = await userRepo.findOneBy({ invitationCode: payload.invitationCode });
  if (!inviter) {
    throw Object.assign(new Error("邀请码无效"), { status: 400 });
  }

  const inviterCanInvite =
    inviter.role === "超级管理员" || inviter.role === "管理员" || inviter.role === "高级用户";
  if (!inviterCanInvite || (inviter.status && inviter.status !== "active")) {
    throw Object.assign(new Error("邀请码无效"), { status: 400 });
  }

  // 除超级管理员外，邀请码只能用于邀请人自己所在的部门
  if (inviter.role !== "超级管理员") {
    const inviterDept = await AppDataSource.getRepository(Department).findOneBy({
      id: inviter.departmentId,
    });
    if (!inviterDept || inviterDept.name !== payload.departmentName) {
      throw Object.assign(new Error("邀请码与所选部门不匹配"), { status: 400 });
    }
  }


  const requestId = generateId("reg");
  const request = regRepo.create({
    id: requestId,
    name: payload.name,
    contact: payload.contact,
    departmentName: payload.departmentName,
    invitationCode: payload.invitationCode,
    // 邀请人由邀请码反查得出，不采用请求体里自称的 invitedByUserId
    invitedByUserId: inviter.id,
    status: "pending",
    passwordHash: hashPasswordIfNeeded(payload.password)
  });

  await regRepo.save(request);

  // Notify admins
  // Try to find target department ID if possible to route notification?
  // Since we only have departmentName, we might check if it matches an existing department.
  const deptRepo = AppDataSource.getRepository(Department);
  const dept = await deptRepo.findOneBy({ name: payload.departmentName });
  
  notifyAdmins(
      "新用户注册申请", 
      `${payload.name} 申请加入 ${payload.departmentName}`,
      { type: "registration_request", requestId },
      dept?.id // If dept found, notify only its admins (if logic allows)
  ).catch(console.error);

  return { message: "注册申请已提交，请等待管理员审核", requestId };
}
