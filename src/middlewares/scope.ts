import type { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../data-source";
import { EquipmentItem } from "../entities/EquipmentItem";
import { BorrowHistory } from "../entities/BorrowHistory";
import { User } from "../entities/User";
import type { UserRole } from "../models/types";

/**
 * 部门作用域校验。
 *
 * 此前的守卫只检查角色（例如「高级用户」即可管理物资），不检查目标资源
 * 属于哪个部门，于是任意部门的管理者都能跨部门改删别人的资产和用户。
 * 客户端虽然有一套部门作用域的权限矩阵，但那只影响界面显隐，挡不住直接调用接口。
 * 这里把「目标资源必须属于调用者所在部门」统一补在服务端，超级管理员豁免。
 */

export interface Actor {
  id: string;
  name: string;
  contact: string;
  role: UserRole;
  departmentId: string;
}

function getActor(req: Request): Actor {
  return (req as any).user as Actor;
}

export function isSuperAdmin(role: UserRole | string | undefined): boolean {
  return role === "超级管理员";
}

/** 调用者能否操作归属于 departmentId 的资源 */
export function canOperateDepartment(actor: Actor, departmentId?: string | null): boolean {
  if (isSuperAdmin(actor?.role)) return true;
  if (!departmentId || !actor?.departmentId) return false;
  return actor.departmentId === departmentId;
}

const forbidden = (res: Response, message: string) => res.status(403).json({ message });

/** PUT / DELETE /items/:id —— 目标物资必须属于调用者部门 */
export async function requireItemScope(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = getActor(req);
    if (isSuperAdmin(actor?.role)) return next();

    const item = await AppDataSource.getRepository(EquipmentItem).findOneBy({ id: req.params.id });
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (!canOperateDepartment(actor, item.departmentId)) {
      return forbidden(res, "无权操作其他部门的物资");
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** POST /items —— 只能在本部门下创建物资 */
export function requireItemCreateScope(req: Request, res: Response, next: NextFunction) {
  const actor = getActor(req);
  if (isSuperAdmin(actor?.role)) return next();

  if (!canOperateDepartment(actor, req.body?.departmentId)) {
    return forbidden(res, "只能在本部门下创建物资");
  }
  next();
}

/**
 * PUT / DELETE /users/:id —— 目标用户必须与调用者同部门。
 * 操作自己时放行，由路由内的可改字段白名单来限制能改什么。
 */
export async function requireUserScope(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = getActor(req);
    if (isSuperAdmin(actor?.role)) return next();
    if (actor?.id === req.params.id) return next();

    const target = await AppDataSource.getRepository(User).findOneBy({ id: req.params.id });
    if (!target) return res.status(404).json({ message: "User not found" });

    if (!canOperateDepartment(actor, target.departmentId)) {
      return forbidden(res, "无权管理其他部门的用户");
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** POST /users —— 只能在本部门下创建用户 */
export function requireUserCreateScope(req: Request, res: Response, next: NextFunction) {
  const actor = getActor(req);
  if (isSuperAdmin(actor?.role)) return next();

  if (!canOperateDepartment(actor, req.body?.departmentId)) {
    return forbidden(res, "只能在本部门下创建用户");
  }
  next();
}

/**
 * POST /items/:itemId/return/:historyEntryId
 * 允许：借用人本人归还，或该物资所属部门的管理者代为归还。
 */
export async function requireReturnScope(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = getActor(req);
    if (isSuperAdmin(actor?.role)) return next();

    const entry = await AppDataSource.getRepository(BorrowHistory).findOneBy({
      id: req.params.historyEntryId,
      itemId: req.params.itemId,
    });
    if (!entry) return res.status(404).json({ message: "Borrow history not found" });

    // 借用人本人
    const borrower = entry.borrower as { id?: string; phone?: string } | undefined;
    const isBorrower =
      !!borrower &&
      ((!!borrower.id && borrower.id === actor.id) ||
        (!!borrower.phone && !!actor.contact && borrower.phone === actor.contact));
    if (isBorrower) return next();

    // 本部门的管理者代为归还
    const canManage = actor?.role === "管理员" || actor?.role === "高级用户";
    if (canManage) {
      const item = await AppDataSource.getRepository(EquipmentItem).findOneBy({ id: req.params.itemId });
      if (item && canOperateDepartment(actor, item.departmentId)) return next();
    }

    return forbidden(res, "只能归还本人借用的物资，或由本部门管理者代为归还");
  } catch (err) {
    next(err);
  }
}
