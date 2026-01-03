import { readAll, writeAll, generateId } from "../utils/store";
import type { BorrowRequestEntry, BorrowerInfo, UserRole, Department, EquipmentItem } from "../models/types";
import { getItem, borrowItem } from "./itemsService";
import { notifyAdmins, sendPushNotification } from "./notificationService";

const COLLECTION = "borrow_requests";

export async function createBorrowRequest(payload: {
  itemId: string;
  borrower: BorrowerInfo;
  applicant: BorrowerInfo;
  expectedReturnDate: string;
  photo?: string;
  quantity?: number;
}): Promise<BorrowRequestEntry> {
  const item = await getItem(payload.itemId);
  const quantity = payload.quantity && payload.quantity > 0 ? Math.floor(payload.quantity) : 1;
  
  // Check available quantity (which includes pending requests deduction)
  if (item.availableQuantity < quantity) {
     throw Object.assign(new Error(`库存不足，当前可用: ${item.availableQuantity}`), { status: 400 });
  }

  // Check Approval Settings
  let requiresApproval = true;
  if (item.requiresApproval !== undefined) {
    requiresApproval = item.requiresApproval;
  } else {
    // Fallback to department setting
    const departments = await readAll<Department>("departments");
    const dept = departments.find(d => d.id === item.departmentId);
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

     // Return a fake "approved" entry for UI consistency
     const autoEntry: BorrowRequestEntry = {
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
        status: "approved",
        createdAt: new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        reviewer: { name: "System", phone: "" },
        remark: "自动免审批"
     };
     
     // Optionally log this request to history if needed, but borrowItem already adds to item history.
     // We might want to save this request to borrow_requests collection too for record keeping?
     // Yes, let's save it as approved.
     const list = await readAll<BorrowRequestEntry>(COLLECTION);
     list.push(autoEntry);
     await writeAll<BorrowRequestEntry>(COLLECTION, list);
     
     return autoEntry;
  }

  const list = await readAll<BorrowRequestEntry>(COLLECTION);

  const entry: BorrowRequestEntry = {
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
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  list.push(entry);
  await writeAll<BorrowRequestEntry>(COLLECTION, list);

  // Notify Admins
  notifyAdmins(
      "新物资借用申请", 
      `${payload.applicant.name} 申请借用 ${item.name} x${quantity}`,
      { type: "borrow_request", requestId: entry.id }
  ).catch(console.error);

  return entry;
}

export async function listMyBorrowRequests(ctx: {
  userId: string;
  userContact?: string;
}): Promise<BorrowRequestEntry[]> {
  const list = await readAll<BorrowRequestEntry>(COLLECTION);
  const filtered = list.filter((r) => {
    if (r.applicant?.id && r.applicant.id === ctx.userId) return true;
    if (r.borrower?.id && r.borrower.id === ctx.userId) return true;
    if (ctx.userContact && r.borrower?.phone === ctx.userContact) return true;
    return false;
  });

  // Populate latest item details
  const items = await readAll<import("../models/types").EquipmentItem>("items");
  const populated = filtered.map(req => {
    const item = items.find(i => i.id === req.itemId);
    if (item) {
      return {
        ...req,
        itemName: item.name,
        itemImage: item.image
      };
    }
    return req;
  });

  populated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return populated;
}

export async function listReviewBorrowRequests(ctx: {
  userRole: UserRole;
  departmentId?: string;
  status?: "pending" | "approved" | "rejected";
}): Promise<BorrowRequestEntry[]> {
  const list = await readAll<BorrowRequestEntry>(COLLECTION);
  const status = ctx.status || "pending";
  let filtered = list.filter((r) => r.status === status);

  // Populate latest item details (name, image)
  // This fixes the "Unknown Item" issue if the item was renamed or details were missing
  const items = await readAll<import("../models/types").EquipmentItem>("items");
  filtered = filtered.map(req => {
    const item = items.find(i => i.id === req.itemId);
    if (item) {
      return {
        ...req,
        itemName: item.name,
        itemImage: item.image
      };
    }
    return req;
  });

  if (ctx.userRole === "超级管理员") {
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filtered;
  }

  if (ctx.userRole !== "管理员" && ctx.userRole !== "高级用户") {
    return [];
  }

  if (!ctx.departmentId) return [];

  filtered = filtered.filter((r) => r.itemDepartmentId === ctx.departmentId);
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}

export async function approveBorrowRequest(payload: {
  requestId: string;
  reviewer: BorrowerInfo;
  reviewerRole: UserRole;
  reviewerDepartmentId?: string;
  remark?: string;
}): Promise<BorrowRequestEntry> {
  const list = await readAll<BorrowRequestEntry>(COLLECTION);
  const idx = list.findIndex((r) => r.id === payload.requestId);
  if (idx === -1) throw Object.assign(new Error("Request not found"), { status: 404 });

  const req = list[idx];
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

  await borrowItem(req.itemId, {
    borrower: req.borrower,
    operator: payload.reviewer,
    expectedReturnDate: req.expectedReturnDate,
    photo: req.photo,
    quantity: req.quantity,
  });

  const updated: BorrowRequestEntry = {
    ...req,
    status: "approved",
    remark: payload.remark,
    reviewedAt: new Date().toISOString(),
    reviewer: payload.reviewer,
  };

  list[idx] = updated;
  await writeAll<BorrowRequestEntry>(COLLECTION, list);

  // Notify Applicant
  if (updated.applicant?.id) {
      sendPushNotification(
          [updated.applicant.id],
          "借用申请已批准",
          `您申请借用的 ${updated.itemName} 已被 ${payload.reviewer.name} 批准`,
          { type: "borrow_approved", requestId: updated.id }
      ).catch(console.error);
  }

  return updated;
}

export async function rejectBorrowRequest(payload: {
  requestId: string;
  reviewer: BorrowerInfo;
  reviewerRole: UserRole;
  reviewerDepartmentId?: string;
  remark?: string;
}): Promise<BorrowRequestEntry> {
  const list = await readAll<BorrowRequestEntry>(COLLECTION);
  const idx = list.findIndex((r) => r.id === payload.requestId);
  if (idx === -1) throw Object.assign(new Error("Request not found"), { status: 404 });

  const req = list[idx];
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

  const updated: BorrowRequestEntry = {
    ...req,
    status: "rejected",
    remark: payload.remark,
    reviewedAt: new Date().toISOString(),
    reviewer: payload.reviewer,
  };

  list[idx] = updated;
  await writeAll<BorrowRequestEntry>(COLLECTION, list);

  // Notify Applicant
  if (updated.applicant?.id) {
      sendPushNotification(
          [updated.applicant.id],
          "借用申请被拒绝",
          `您申请借用的 ${updated.itemName} 已被拒绝。原因：${payload.remark || '无'}`,
          { type: "borrow_rejected", requestId: updated.id }
      ).catch(console.error);
  }

  return updated;
}
