import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { RegistrationRequest } from "../entities/RegistrationRequest";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { notifyAdmins } from "./notificationService";

export async function login(contact: string, pass: string): Promise<{ user: User; token: string }> {
  const userRepo = AppDataSource.getRepository(User);
  const user = await userRepo.findOneBy({ contact });

  if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
  if (user.password !== pass) {
    throw Object.assign(new Error("密码错误"), { status: 401 });
  }
  
  if (user.status === "disabled") {
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
  password?: string;
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

  const requestId = generateId("reg");
  const request = regRepo.create({
    id: requestId,
    name: payload.name,
    contact: payload.contact,
    departmentName: payload.departmentName,
    invitationCode: payload.invitationCode,
    invitedByUserId: payload.invitedByUserId,
    status: "pending",
    passwordHash: payload.password || "123456" // Should hash in production
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
