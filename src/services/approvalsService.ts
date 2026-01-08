import { AppDataSource } from "../data-source";
import { RegistrationRequest } from "../entities/RegistrationRequest";
import { User } from "../entities/User";
import { generateId } from "../utils/store";
import type { UserRole } from "../models/types";
import { notifyAdmins } from "./notificationService";
import { Department } from "../entities/Department";

export async function listApprovals(ctx: { userRole: UserRole; departmentId?: string; status?: "pending" | "approved" | "rejected" }): Promise<RegistrationRequest[]> {
  const repo = AppDataSource.getRepository(RegistrationRequest);
  const status = ctx.status || "pending";

  if (ctx.userRole === "超级管理员") {
    return repo.find({ where: { status } });
  }

  if (!ctx.departmentId) return [];

  const deptRepo = AppDataSource.getRepository(Department);
  const dept = await deptRepo.findOneBy({ id: ctx.departmentId });
  
  if (!dept) return [];

  return repo.find({
      where: {
          status,
          departmentName: dept.name
      }
  });
}

export async function approveRequest(id: string): Promise<RegistrationRequest> {
  const regRepo = AppDataSource.getRepository(RegistrationRequest);
  const userRepo = AppDataSource.getRepository(User);
  const deptRepo = AppDataSource.getRepository(Department);
  
  return AppDataSource.transaction(async manager => {
      const req = await manager.findOne(RegistrationRequest, { where: { id } });
      if (!req) throw Object.assign(new Error("Request not found"), { status: 404 });
      
      if (req.status !== "pending") throw Object.assign(new Error("Request already processed"), { status: 400 });

      const dept = await manager.findOne(Department, { where: { name: req.departmentName } });
      if (!dept) throw Object.assign(new Error(`Department "${req.departmentName}" not found`), { status: 400 });

      const newUser = manager.create(User, {
          id: generateId("user"),
          name: req.name,
          contact: req.contact,
          departmentId: dept.id,
          departmentName: dept.name,
          role: "普通用户",
          status: "active",
          password: req.passwordHash || "123456",
          invitationCode: req.invitationCode
      });
      await manager.save(newUser);

      req.status = "approved";
      await manager.save(req);

      return req;
  });
}

export async function rejectRequest(id: string): Promise<RegistrationRequest> {
  const regRepo = AppDataSource.getRepository(RegistrationRequest);
  const req = await regRepo.findOneBy({ id });
  if (!req) throw Object.assign(new Error("Request not found"), { status: 404 });
  if (req.status !== "pending") throw Object.assign(new Error("Request already processed"), { status: 400 });

  req.status = "rejected";
  await regRepo.save(req);
  return req;
}
