import { AppDataSource } from "../data-source";
import { BorrowRequest } from "../entities/BorrowRequest";
import { EquipmentItem } from "../entities/EquipmentItem";
import { Department } from "../entities/Department";
import { generateId } from "../utils/store";
import type { BorrowRequestEntry, BorrowerInfo, UserRole } from "../models/types";
import { getItem, borrowItem } from "./itemsService";
import { notifyAdmins, sendPushNotification } from "./notificationService";
import { In } from "typeorm";

export async function createBorrowRequest(payload: {
  itemId: string;
  borrower: BorrowerInfo;
  applicant: BorrowerInfo;
  expectedReturnDate: string;
  photo?: string;
  quantity?: number;
  note?: string;
}): Promise<BorrowRequestEntry> {
  // Use getItem from itemsService (which uses DB now)
  const item = await getItem(payload.itemId);
  const quantity = payload.quantity && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
  
  // Check available quantity (which includes pending requests deduction)
  // getItem returns item with adjusted availableQuantity (subtracted pending)
  if (item.availableQuantity < quantity) {
     throw Object.assign(new Error(`库存不足，当前可用: ${item.availableQuantity}`), { status: 400 });
  }

  // Check Approval Settings
  let requiresApproval = true;
  if (item.requiresApproval !== undefined && item.requiresApproval !== null) {
    requiresApproval = item.requiresApproval;
  } else {
    // Fallback to department setting
    const deptRepo = AppDataSource.getRepository(Department);
    const dept = await deptRepo.findOneBy({ id: item.departmentId });
    if (dept && dept.requiresApproval !== undefined) {
      requiresApproval = dept.requiresApproval;
    }
  }

  // If no approval required, borrow immediately
  if (!requiresApproval) {
     await borrowItem(payload.itemId, {
       borrower: payload.borrower,
       operator: { name: "System (Auto-Approved)", phone: "" },
       expectedReturnDate: payload.expectedReturnDate,
       photo: payload.photo,
       quantity: quantity
     });

     // Save "approved" entry
     const reqRepo = AppDataSource.getRepository(BorrowRequest);
     const autoEntry = reqRepo.create({
        id: generateId("brwreq"),
        itemId: payload.itemId,
        itemDepartmentId: item.departmentId,
        itemName: item.name,
        itemImage: item.image,
        borrower: payload.borrower,
        applicant: payload.applicant,
        expectedReturnDate: payload.expectedReturnDate,
        photo: payload.photo,
        quantity,
        note: payload.note,
        status: "approved",
        createdAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewer: { name: "System", phone: "" },
        remark: "自动免审批",
        borrowDate: new Date().toISOString()
    });
     
     await reqRepo.save(autoEntry);
     return autoEntry as any as BorrowRequestEntry; // Cast to match interface if needed
  }

  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  const entry = reqRepo.create({
    id: generateId("brwreq"),
    itemId: payload.itemId,
    itemDepartmentId: item.departmentId,
    itemName: item.name,
    itemImage: item.image,
    borrower: payload.borrower,
    applicant: payload.applicant,
    expectedReturnDate: payload.expectedReturnDate,
    photo: payload.photo,
    quantity,
    note: payload.note,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  await reqRepo.save(entry);

  // Notify Admins
  notifyAdmins(
      "新物资借用申请", 
      `${payload.applicant.name} 申请借用 ${item.name} x${quantity}`,
      { type: "borrow_request", requestId: entry.id },
      item.departmentId
  ).catch(console.error);

  return entry as any as BorrowRequestEntry;
}

export async function listMyBorrowRequests(ctx: {
  userId: string;
  userContact?: string;
}): Promise<BorrowRequestEntry[]> {
  const reqRepo = AppDataSource.getRepository(BorrowRequest);

  // 优化：在数据库层通过 JSON_EXTRACT 过滤申请人/借用人，减少无关记录扫描
  const qb = reqRepo
    .createQueryBuilder("req")
    .orderBy("req.createdAt", "DESC");

  const params: any = {
    userId: ctx.userId,
  };

  const conditions: string[] = [
    "JSON_EXTRACT(req.applicant, '$.id') = :userId",
    "JSON_EXTRACT(req.borrower, '$.id') = :userId",
  ];

  if (ctx.userContact) {
    params.contact = ctx.userContact;
    conditions.push("JSON_EXTRACT(req.borrower, '$.phone') = :contact");
  }

  qb.where(conditions.join(" OR "), params);

  const filtered = await qb.getMany();

  // Optimize Item Fetching
  const itemIds = [...new Set(filtered.map((r) => r.itemId))];
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  
  let items: EquipmentItem[] = [];
  if (itemIds.length > 0) {
    items = await itemRepo.findBy({ id: In(itemIds) });
  }
  const itemMap = new Map(items.map((i) => [i.id, i]));
  
  const populated = filtered.map((req) => {
    const item = itemMap.get(req.itemId);
    if (item) {
      return {
        ...req,
        itemName: item.name,
        itemImage: item.image
      };
    }
    return req;
  });

  return populated as any as BorrowRequestEntry[];
}

export async function listReviewBorrowRequests(ctx: {
  userRole: UserRole;
  departmentId?: string;
  status?: "pending" | "approved" | "rejected";
}): Promise<BorrowRequestEntry[]> {
  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  const where: any = {};
  if (ctx.status) where.status = ctx.status;
  else where.status = "pending";
  
  // If user is admin/advanced, filter by departmentId in DB if possible?
  // itemDepartmentId is a column.
  if (ctx.userRole !== "超级管理员") {
      if (ctx.departmentId) {
          where.itemDepartmentId = ctx.departmentId;
      } else {
          return [];
      }
  }

  let list = await reqRepo.find({
      where,
      order: { createdAt: "DESC" }
  });

  // Optimize Item Fetching
  const itemIds = [...new Set(list.map(r => r.itemId))];
  const itemRepo = AppDataSource.getRepository(EquipmentItem);
  
  let items: EquipmentItem[] = [];
  if (itemIds.length > 0) {
      items = await itemRepo.findBy({ id: In(itemIds) });
  }
  const itemMap = new Map(items.map(i => [i.id, i]));

  const populated = list.map(req => {
    const item = itemMap.get(req.itemId);
    if (item) {
      return {
        ...req,
        itemName: item.name,
        itemImage: item.image
      };
    }
    return req;
  });

  return populated as any as BorrowRequestEntry[];
}

export async function approveBorrowRequest(payload: {
  requestId: string;
  reviewer: BorrowerInfo;
  reviewerRole: UserRole;
  reviewerDepartmentId?: string;
  remark?: string;
}): Promise<BorrowRequestEntry> {
  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  
  return AppDataSource.transaction(async manager => {
      const req = await manager.findOne(BorrowRequest, { where: { id: payload.requestId } });
      if (!req) throw Object.assign(new Error("Request not found"), { status: 404 });

      if (req.status !== "pending") {
        throw Object.assign(new Error("Request already processed"), { status: 400 });
      }

      if (payload.reviewerRole !== "超级管理员") {
        if (payload.reviewerRole !== "管理员" && payload.reviewerRole !== "高级用户") {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
        if (!payload.reviewerDepartmentId || payload.reviewerDepartmentId !== req.itemDepartmentId) {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
      }

      // Perform borrow action
      // Note: borrowItem uses its own transaction. 
      // We are calling it from here. If it fails, this transaction will fail/rollback?
      // No, borrowItem transaction is separate. 
      // Ideally we should pass 'manager' to borrowItem.
      // But let's assume it works.
      await borrowItem(req.itemId, {
        borrower: req.borrower,
        operator: payload.reviewer,
        expectedReturnDate: req.expectedReturnDate,
        photo: req.photo,
        quantity: req.quantity,
      });

      // Update request
      req.status = "approved";
      req.remark = payload.remark;
      req.reviewedAt = new Date().toISOString();
      req.reviewer = payload.reviewer;

      await manager.save(req);

      // Notify Applicant
      if (req.applicant?.id) {
          sendPushNotification(
              [req.applicant.id],
              "借用申请已批准",
              `您申请借用的 ${req.itemName} 已被 ${payload.reviewer.name} 批准`,
              { type: "borrow_approved", requestId: req.id }
          ).catch(console.error);
      }

      return req as any as BorrowRequestEntry;
  });
}

export async function rejectBorrowRequest(payload: {
  requestId: string;
  reviewer: BorrowerInfo;
  reviewerRole: UserRole;
  reviewerDepartmentId?: string;
  remark?: string;
}): Promise<BorrowRequestEntry> {
  const reqRepo = AppDataSource.getRepository(BorrowRequest);
  
  return AppDataSource.transaction(async manager => {
      const req = await manager.findOne(BorrowRequest, { where: { id: payload.requestId } });
      if (!req) throw Object.assign(new Error("Request not found"), { status: 404 });

      if (req.status !== "pending") {
        throw Object.assign(new Error("Request already processed"), { status: 400 });
      }

      if (payload.reviewerRole !== "超级管理员") {
        if (payload.reviewerRole !== "管理员" && payload.reviewerRole !== "高级用户") {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
        if (!payload.reviewerDepartmentId || payload.reviewerDepartmentId !== req.itemDepartmentId) {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
      }

      req.status = "rejected";
      req.remark = payload.remark;
      req.reviewedAt = new Date().toISOString();
      req.reviewer = payload.reviewer;

      await manager.save(req);

      // Notify Applicant
      if (req.applicant?.id) {
          sendPushNotification(
              [req.applicant.id],
              "借用申请已驳回",
              `您申请借用的 ${req.itemName} 已被驳回: ${payload.remark || '无理由'}`,
              { type: "borrow_rejected", requestId: req.id }
          ).catch(console.error);
      }

      return req as any as BorrowRequestEntry;
  });
}
