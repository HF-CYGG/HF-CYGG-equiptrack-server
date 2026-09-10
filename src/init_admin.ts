import crypto from "crypto";
import { AppDataSource } from "./data-source";
import { User } from "./entities/User";
import { Department } from "./entities/Department";
import { hashPassword } from "./services/authService";
import { generateId } from "./utils/store";

/**
 * 初始超级管理员。
 *
 * 空库里一个用户都没有，而注册接口要求邀请码必须属于某位在职管理者，
 * 于是「第一个账号」无法通过接口自助创建。这里提供两个入口：
 *
 * - 环境变量（createInitialAdminIfMissing）：服务启动时执行，
 *   只在用户表为空时创建，适合自动化部署；
 * - 命令行（create_admin.ts）：手工执行一次。
 *
 * 两者都不会动已有账号。
 */

export interface AdminSeed {
  contact: string;
  password: string;
  name?: string;
  departmentName?: string;
  invitationCode?: string;
}

export interface CreatedAdmin {
  contact: string;
  name: string;
  departmentName: string;
  invitationCode: string;
}

/** 密码下限，与创建管理员这件事的敏感度相称 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * 创建一个超级管理员，按需创建其所属部门。
 * 是否应该创建由调用方判断；contact 已被占用时抛错。
 */
export async function createAdmin(seed: AdminSeed): Promise<CreatedAdmin> {
  const userRepo = AppDataSource.getRepository(User);
  const deptRepo = AppDataSource.getRepository(Department);

  const contact = seed.contact.trim();
  if (!contact) throw new Error("联系方式不能为空");
  if (!seed.password || seed.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
  }

  const existing = await userRepo.findOneBy({ contact });
  if (existing) {
    throw new Error(`联系方式 ${contact} 已被占用（当前角色：${existing.role}）`);
  }

  const departmentName = seed.departmentName?.trim() || "总部";
  let department = await deptRepo.findOneBy({ name: departmentName });
  if (!department) {
    department = deptRepo.create({
      id: generateId("dept"),
      name: departmentName,
      requiresApproval: true,
      order: 0,
    });
    await deptRepo.save(department);
  }

  const name = seed.name?.trim() || "超级管理员";
  const invitationCode =
    seed.invitationCode?.trim() || crypto.randomBytes(4).toString("hex").toUpperCase();

  const admin = userRepo.create({
    id: generateId("user"),
    name,
    contact,
    departmentId: department.id,
    departmentName: department.name,
    role: "超级管理员",
    status: "active",
    password: hashPassword(seed.password),
    invitationCode,
  });
  await userRepo.save(admin);

  return { contact, name, departmentName: department.name, invitationCode };
}

/**
 * 启动时按环境变量创建初始管理员。返回是否实际创建。
 *
 * 触发条件缺一不可：
 * 1. 配置了 INITIAL_ADMIN_CONTACT 与 INITIAL_ADMIN_PASSWORD；
 * 2. 用户表为空。
 *
 * 第 2 条决定了它不会在每次重启时重置已有管理员的密码 ——
 * 那会让「改了密码又被 .env 覆盖回去」成为一个隐蔽的后门。
 */
export async function createInitialAdminIfMissing(): Promise<boolean> {
  const contact = process.env.INITIAL_ADMIN_CONTACT?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!contact || !password) return false;

  const userCount = await AppDataSource.getRepository(User).count();
  if (userCount > 0) {
    // 已经有账号了，环境变量一律忽略
    return false;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.warn(
      `[初始管理员] INITIAL_ADMIN_PASSWORD 少于 ${MIN_PASSWORD_LENGTH} 位，已跳过创建。`
    );
    return false;
  }

  try {
    const created = await createAdmin({
      contact,
      password,
      name: process.env.INITIAL_ADMIN_NAME,
      departmentName: process.env.INITIAL_ADMIN_DEPARTMENT,
      invitationCode: process.env.INITIAL_ADMIN_INVITATION_CODE,
    });

    // 注意：不打印密码
    console.log(
      `[初始管理员] 已创建 ${created.contact}（${created.name} / ${created.departmentName}），邀请码 ${created.invitationCode}`
    );
    console.log(
      "[初始管理员] 建议登录后立即改密，并从 .env 中删除 INITIAL_ADMIN_PASSWORD。"
    );
    return true;
  } catch (err) {
    console.error("[初始管理员] 创建失败：", err instanceof Error ? err.message : err);
    return false;
  }
}
