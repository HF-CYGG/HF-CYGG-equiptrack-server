import { Router } from "express";
import { login, signup } from "../services/authService";
import { listDepartments, addDepartment, updateDepartment, deleteDepartment, updateDepartmentStructure } from "../services/departmentsService";
import { listCategories, addCategory, deleteCategory } from "../services/categoriesService";
import { listItems, getItem, addItem, updateItem, deleteItem, borrowItem, returnItem, filterItems } from "../services/itemsService";
import { listUsers, getUser, addUser, updateUser, deleteUser, filterUsers } from "../services/usersService";
import { listApprovals, approveRequest, rejectRequest } from "../services/approvalsService";
import { createBorrowRequest, listMyBorrowRequests, listReviewBorrowRequests, approveBorrowRequest, rejectBorrowRequest } from "../services/borrowRequestsService";
import type { UserRole, BorrowRequestEntry } from "../models/types";
import { readAll } from "../utils/store";
import { authGuard } from "../middlewares/auth";
import { upload } from "../middlewares/upload";
import { registerDeviceToken } from "../services/notificationService";
import type { AppVersion } from "../models/types";
import { promises as fs } from "fs";
import path from "path";
import rateLimit from "express-rate-limit";

export const api = Router();

// Rate limiter for login to prevent brute-force attacks
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 5, // Limit each IP to 5 requests per windowMs
	message: { message: "尝试登录次数过多，请15分钟后再试" },
	standardHeaders: true,
	legacyHeaders: false,
});

// System / App Version
api.get("/system/android-version", async (_req, res, next) => {
  try {
    // Use __dirname to reliably locate app_version.json relative to the compiled file location
    // dist/routes/api.js -> ../../app_version.json
    const versionPath = path.resolve(__dirname, "../../app_version.json");
    let versions: AppVersion[] = [];
    try {
        const data = await fs.readFile(versionPath, "utf8");
        versions = JSON.parse(data);
    } catch (e) {
        // Fallback or empty if file not found
        console.error("Failed to read app_version.json", e);
    }
    
    const latest = versions[0];
    if (latest) {
      // Auto-fill download URL if missing, using GitHub Release with CDN
      if (!latest.downloadUrl) {
        const tagName = latest.versionName.startsWith("v") ? latest.versionName : `v${latest.versionName}`;
        // Standard APK name from build
        const originalUrl = `https://github.com/YeMiao_cats/EquipTrack/releases/download/${tagName}/app-release.apk`;
        // Use Domestic Mirror for acceleration
        latest.downloadUrl = `https://mirror.ghproxy.com/${originalUrl}`;
      }
      res.json(latest);
    } else {
      // Default / Initial state
      res.json({
        versionCode: 1,
        versionName: "1.0.0",
        updateContent: "Initial Release",
        downloadUrl: "",
        forceUpdate: false,
        releaseDate: new Date().toISOString()
      });
    }
  } catch (err) {
    next(err);
  }
});

// Auth
api.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { contact, password } = req.body || {};
    const { user, token } = await login(contact, password);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

api.post("/signup", async (req, res, next) => {
  try {
    const result = await signup(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Public Data
api.put("/departments/structure", authGuard, async (req, res, next) => {
  try {
    // Only admins can update structure
    const user = (req as any).user;
    if (user.role !== "超级管理员" && user.role !== "管理员") {
      throw Object.assign(new Error("无权操作"), { status: 403 });
    }
    const updates = req.body; // Array of { id, parentId, order }
    if (!Array.isArray(updates)) {
      throw Object.assign(new Error("Invalid input format"), { status: 400 });
    }
    res.json(await updateDepartmentStructure(updates));
  } catch (err) {
    next(err);
  }
});

api.get("/departments", async (_req, res, next) => {
  try {
    res.json(await listDepartments());
  } catch (err) {
    next(err);
  }
});

// File Upload
api.post("/upload", upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) {
       res.status(400).json({ message: "No file uploaded" });
       return;
    }
    
    // Determine relative path based on the actual destination
    // This handles the dynamic subfolder logic from the upload middleware
    const type = req.query.type || req.body.type;
    let subfolder = "others";
    let urlPrefix = "/uploads";

    if (type === "item_thumb") subfolder = "items/thumbs";
    else if (type === "item_full") subfolder = "items/full";
    else if (type === "item") subfolder = "items";
    else if (type === "return") subfolder = "returns";
    else if (type === "borrow") subfolder = "borrows";
    else if (type === "avatar") {
      urlPrefix = "/avatars";
      subfolder = ""; // avatars are served directly from /avatars/filename
    }
    
    const fileUrl = subfolder 
      ? `${urlPrefix}/${subfolder}/${req.file.filename}` 
      : `${urlPrefix}/${req.file.filename}`;
      
    res.json({ url: fileUrl });
  } catch (err) {
    next(err);
  }
});

// Protect all routes below with JWT auth
api.use(authGuard);

// Notifications
api.post("/notifications/register", async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    if (!token) {
      res.status(400).json({ message: "Token is required" });
      return;
    }
    // req.user is populated by authGuard
    await registerDeviceToken((req as any).user!.id, token, platform || 'android');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Helper for role check
const requireAdmin = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员") return next();
  res.status(403).json({ message: "Forbidden: Admins only" });
};

// Role hierarchy definition (Lower value = Higher privilege)
const ROLE_RANK: Record<UserRole, number> = {
  "超级管理员": 0,
  "管理员": 1,
  "高级用户": 2,
  "普通用户": 3
};

const getRoleRank = (role: UserRole): number => ROLE_RANK[role] ?? 999;

// Helper to check strict hierarchy permission
// Current user can only manage target users with STRICTLY LOWER rank (Higher rank value)
const canManageTargetRole = (currentRole: UserRole, targetRole: UserRole): boolean => {
  return getRoleRank(currentRole) < getRoleRank(targetRole);
};

// Helper for self or admin check
const requireAdminOrSelf = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  const currentUserId = req.user?.id;
  const targetUserId = req.params.id;

  if (role === "超级管理员" || role === "管理员") return next();
  if (currentUserId === targetUserId) return next();
  
  res.status(403).json({ message: "Forbidden: Admins or Self only" });
};

// Helper for item management check (Admins + Advanced Users)
const requireItemManagePermission = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员" || role === "高级用户") return next();
  res.status(403).json({ message: "Forbidden: Insufficient permissions" });
};

// Departments (Protected actions)
api.put("/departments/structure", requireAdmin, async (req, res, next) => {
  try {
    res.json(await updateDepartmentStructure(req.body));
  } catch (err) {
    next(err);
  }
});

api.post("/departments", requireAdmin, async (req, res, next) => {
  try {
    res.json(await addDepartment(req.body));
  } catch (err) {
    next(err);
  }
});

api.put("/departments/:id", requireAdmin, async (req, res, next) => {
  try {
    res.json(await updateDepartment(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

api.delete("/departments/:id", requireAdmin, async (req, res, next) => {
  try {
    res.json(await deleteDepartment(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Categories
api.get("/categories", async (_req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (err) {
    next(err);
  }
});

api.post("/categories", requireAdmin, async (req, res, next) => {
  try {
    res.json(await addCategory(req.body));
  } catch (err) {
    next(err);
  }
});

api.delete("/categories/:id", requireAdmin, async (req, res, next) => {
  try {
    res.json(await deleteCategory(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Items
api.get("/items", async (req, res, next) => {
  try {
    const items = await listItems();
    const borrowRequests = await readAll<BorrowRequestEntry>("borrow_requests");
    const pendingMap = new Map<string, number>();
    for (const r of borrowRequests) {
      if (r.status !== "pending") continue;
      const current = pendingMap.get(r.itemId) ?? 0;
      pendingMap.set(r.itemId, current + (r.quantity || 1));
    }
    const itemsWithPending = items.map((item) => {
      const pending = pendingMap.get(item.id) ?? 0;
      const adjustedAvailable = item.availableQuantity - pending;
      return {
        ...item,
        availableQuantity: adjustedAvailable > 0 ? adjustedAvailable : 0,
        pendingApprovalQuantity: pending,
      };
    });
    const ctx = (req as any).user as { role: UserRole; departmentId?: string };
    const userRole = ctx?.role as UserRole;
    
    let departmentId = ctx?.departmentId;
    // Allow filtering by department for ALL users (Cross-department feature)
    if (req.query.departmentId) {
      departmentId = req.query.departmentId as string;
    } else if (req.query.showAll === "true" || userRole === "超级管理员") {
        // Explicitly show all or if super admin requests without specific ID
        departmentId = undefined;
    }
    // If no query param and not explicitly showing all, default to user's department (current behavior preserved for initial load if needed)
    // However, user wants "All users can cross-department". 
    // So we should probably default to undefined (All) if the client logic handles the filtering?
    // Or let the client decide. 
    // Let's stick to: Use query param if present. If not, default to user's department (unless Super Admin).
    // BUT, if the user selects "All Departments" in the UI, we need a way to say "No Filter".
    // The client can send a specific flag or just rely on the filter logic.
    // Let's allow overriding.
    
    if (req.query.departmentId) {
        departmentId = req.query.departmentId as string;
    }
    // If the client sends departmentId="", it means "All" (if we treat empty string as no filter)
    // But typically ID is non-empty.
    
    // Refined Logic:
    // 1. If departmentId query param is provided, use it.
    // 2. If not provided, use user's department (legacy/default).
    // 3. BUT if user wants to see ALL, they might not send departmentId.
    // We need a way to distinguish "Default to my dept" vs "Show me everything".
    // Let's assume if the client is updated, it will send departmentId for specific view.
    // If it wants all, maybe it sends a special value or we add a "scope=global" param?
    // Simplest: If `departmentId` query param is present, use it. 
    // If `departmentId` is NOT present, default to user's department (for safety/compatibility).
    // To view ALL, the client should send `departmentId=all` or similar?
    // Or just: "If user selects 'All', client sends no departmentId, BUT we need to bypass the default."
    
    // Let's change line 139 to undefined initially if we want to support global view by default?
    // No, safer to default to ctx.departmentId.
    // If client wants "All", it can send `departmentId=all` and we handle it? 
    // Or just allow `departmentId` param to override.
    
    if (req.query.departmentId) {
        departmentId = req.query.departmentId as string;
        if (departmentId === "all") departmentId = undefined;
    }

    const allAvailable = req.query.allAvailable === "true";
    const filtered = filterItems(itemsWithPending, { userRole, departmentId, allAvailable });
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

api.get("/items/:id", async (req, res, next) => {
  try {
    res.json(await getItem(req.params.id));
  } catch (err) {
    next(err);
  }
});

api.post("/items", requireItemManagePermission, async (req, res, next) => {
  try {
    res.json(await addItem(req.body));
  } catch (err) {
    next(err);
  }
});

api.put("/items/:id", requireItemManagePermission, async (req, res, next) => {
  try {
    res.json(await updateItem(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

api.delete("/items/:id", requireItemManagePermission, async (req, res, next) => {
  try {
    res.json(await deleteItem(req.params.id));
  } catch (err) {
    next(err);
  }
});

api.post("/items/:id/borrow", async (req, res, next) => {
  try {
    const user = (req as any).user;
    // For ordinary users, force the borrower info to be themselves
    let borrower = req.body.borrower;
    if (user.role === "普通用户") {
       borrower = {
         id: user.id,
         name: user.name,
         phone: user.contact
       };
    } else {
       // For admins/advanced, ensure ID is present if possible, or trust payload
       // Better to inject ID if names match? Let's just attach the ID if missing.
       if (borrower && !borrower.id && borrower.name === user.name) {
          borrower.id = user.id;
       }
    }
    
    res.json(
      await borrowItem(req.params.id, {
        borrower: borrower,
        operator: {
          id: user.id,
          name: user.name,
          phone: user.contact
        },
        expectedReturnDate: req.body.expectedReturnDate,
        photo: req.body.photo,
        quantity: req.body.quantity,
      })
    );
  } catch (err) {
    next(err);
  }
});

api.post("/borrow-requests", async (req, res, next) => {
  try {
    const user = (req as any).user as { id: string; name: string; contact: string; role: UserRole; departmentId?: string };
    const itemId = req.body?.itemId as string | undefined;
    if (!itemId) {
      res.status(400).json({ message: "itemId is required" });
      return;
    }

    if (user.role !== "超级管理员" && !req.body?.photo) {
      res.status(400).json({ message: "Photo is required" });
      return;
    }

    let borrower = req.body.borrower;
    if (user.role === "普通用户") {
      borrower = {
        id: user.id,
        name: user.name,
        phone: user.contact,
      };
    }

    const created = await createBorrowRequest({
      itemId,
      borrower,
      applicant: {
        id: user.id,
        name: user.name,
        phone: user.contact,
      },
      expectedReturnDate: req.body.expectedReturnDate,
      photo: req.body.photo,
      quantity: req.body.quantity,
      note: req.body.note,
    });
    res.json(created);
  } catch (err) {
    next(err);
  }
});

api.get("/borrow-requests/mine", async (req, res, next) => {
  try {
    const user = (req as any).user as { id: string; contact?: string };
    res.json(await listMyBorrowRequests({ userId: user.id, userContact: user.contact }));
  } catch (err) {
    next(err);
  }
});

api.get("/borrow-requests/review", async (req, res, next) => {
  try {
    const user = (req as any).user as { role: UserRole; departmentId?: string };
    const status = req.query.status as any;
    res.json(
      await listReviewBorrowRequests({
        userRole: user.role,
        departmentId: user.departmentId,
        status,
      })
    );
  } catch (err) {
    next(err);
  }
});

api.post("/borrow-requests/:id/approve", async (req, res, next) => {
  try {
    const user = (req as any).user as { id: string; name: string; contact: string; role: UserRole; departmentId?: string };
    res.json(
      await approveBorrowRequest({
        requestId: req.params.id,
        reviewer: { id: user.id, name: user.name, phone: user.contact },
        reviewerRole: user.role,
        reviewerDepartmentId: user.departmentId,
        remark: req.body?.remark,
      })
    );
  } catch (err) {
    next(err);
  }
});

api.post("/borrow-requests/:id/reject", async (req, res, next) => {
  try {
    const user = (req as any).user as { id: string; name: string; contact: string; role: UserRole; departmentId?: string };
    res.json(
      await rejectBorrowRequest({
        requestId: req.params.id,
        reviewer: { id: user.id, name: user.name, phone: user.contact },
        reviewerRole: user.role,
        reviewerDepartmentId: user.departmentId,
        remark: req.body?.remark,
      })
    );
  } catch (err) {
    next(err);
  }
});

api.post("/items/:itemId/return/:historyEntryId", async (req, res, next) => {
  try {
    res.json(
      await returnItem(req.params.itemId, req.params.historyEntryId, {
        photo: req.body.photo,
        isForced: req.body.isForced,
        adminName: req.body.adminName,
      })
    );
  } catch (err) {
    next(err);
  }
});

// Users
api.get("/users", async (req, res, next) => {
  try {
    const users = await listUsers();
    const ctx = (req as any).user as { role: UserRole; departmentId?: string };
    const userRole = ctx?.role as UserRole;
    
    let departmentId = ctx?.departmentId;
    // Super Admin can filter by department via query param
    if (userRole === "超级管理员" && req.query.departmentId) {
      departmentId = req.query.departmentId as string;
    } else if (userRole === "超级管理员" && !req.query.departmentId) {
      departmentId = undefined;
    }

    const filtered = filterUsers(users, { userRole, departmentId });
    // 不返回密码
    res.json(filtered.map(({ password, ...u }) => u));
  } catch (err) {
    next(err);
  }
});

api.get("/users/:id", async (req, res, next) => {
  try {
    const { password, ...u } = await getUser(req.params.id);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.post("/users", requireAdmin, async (req, res, next) => {
  try {
    const currentUserRole = (req as any).user.role as UserRole;
    const newUserRole = req.body.role as UserRole;

    // Security Check: Cannot create user with role >= current user
    if (!canManageTargetRole(currentUserRole, newUserRole)) {
       res.status(403).json({ message: "权限不足：无法创建同级或更高级别的用户角色" });
       return;
    }

    const { password, ...u } = await addUser(req.body);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.put("/users/:id", requireAdminOrSelf, async (req, res, next) => {
  try {
    const currentUser = (req as any).user;
    const currentUserRole = currentUser.role as UserRole;
    const currentUserId = currentUser.id;
    const targetUserId = req.params.id;
    const isSelf = currentUserId === targetUserId;

    const targetUser = await getUser(req.params.id);
    
    // Security Check 1: Hierarchy enforcement (for managing others)
    if (!isSelf) {
        // Cannot edit user with role >= current user
        if (!canManageTargetRole(currentUserRole, targetUser.role)) {
            res.status(403).json({ message: "权限不足：无法编辑同级或更高级别的用户" });
            return;
        }

        // If changing role, cannot promote to role >= current user
        if (req.body.role && !canManageTargetRole(currentUserRole, req.body.role as UserRole)) {
            res.status(403).json({ message: "权限不足：无法将用户提升至同级或更高级别" });
            return;
        }
    } else {
        // Security Check 2: Self-management restrictions (for non-Super Admins)
        if (currentUserRole !== "超级管理员") {
             // Cannot change own role
             if (req.body.role && req.body.role !== targetUser.role) {
                 res.status(403).json({ message: "权限不足：无法修改自己的角色" });
                 return;
             }
             // Cannot change own status
             if (req.body.status && req.body.status !== targetUser.status) {
                 res.status(403).json({ message: "权限不足：无法修改自己的状态" });
                 return;
             }
        }
    }

    // Security Check 3: Invitation Code (Global rule: Only Super Admin can change)
    if (currentUserRole !== "超级管理员") {
        if (req.body.invitationCode !== undefined && req.body.invitationCode !== targetUser.invitationCode) {
             res.status(403).json({ message: "权限不足：仅超级管理员可修改邀请码" });
             return;
        }
    }

    const { password, ...u } = await updateUser(req.params.id, req.body);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.delete("/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const currentUserRole = (req as any).user.role as UserRole;
    const targetUser = await getUser(req.params.id);

    // Security Check: Cannot delete user with role >= current user
    if (!canManageTargetRole(currentUserRole, targetUser.role)) {
        res.status(403).json({ message: "权限不足：无法删除同级或更高级别的用户" });
        return;
    }

    res.json(await deleteUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

// Approvals
api.get("/approvals", async (req, res, next) => {
  try {
    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string };
    const list = await listApprovals({ userId: ctx?.id, userRole: ctx?.role, departmentId: ctx?.departmentId });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

api.post("/approvals/:id", async (req, res, next) => {
  try {
    await approveRequest(req.params.id);
    res.json({ message: "Approved" });
  } catch (err) {
    next(err);
  }
});

api.delete("/approvals/:id", async (req, res, next) => {
  try {
    await rejectRequest(req.params.id);
    res.json({ message: "Rejected" });
  } catch (err) {
    next(err);
  }
});

// History
api.get("/history", async (req, res, next) => {
  try {
    const items = await listItems();
    const allHistory: any[] = [];
    for (const item of items) {
      if (item.borrowHistory && item.borrowHistory.length > 0) {
        allHistory.push(
          ...item.borrowHistory.map((h) => ({
            ...h,
            itemId: item.id,
            itemName: item.name,
            itemCategory: item.categoryId,
            itemImage: item.photos?.[0],
            departmentId: item.departmentId,
            // Flatten borrower info for Android compatibility
            borrowerName: h.borrower?.name || "未知借用人",
            borrowerContact: h.borrower?.phone || "",
            // Provide operator info
            operatorUserId: h.operator?.id || "",
            operatorName: h.operator?.name || "系统记录",
            operatorContact: h.operator?.phone || ""
          }))
        );
      }
    }

    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string; contact?: string };
    const userId = ctx?.id;
    const userRole = ctx?.role;
    const userDeptId = ctx?.departmentId;
    const userContact = ctx?.contact;
    const filterDeptId = req.query.departmentId as string | undefined;

    let filtered = allHistory;
    
    if (userRole === "超级管理员") {
        // Super Admin sees all, or filters by requested department
        if (filterDeptId) {
            filtered = allHistory.filter(h => h.departmentId === filterDeptId);
        }
    } else if (userRole === "管理员" || userRole === "高级用户") {
        // Admin and Advanced User see their own department's history
        if (userDeptId) {
            filtered = allHistory.filter(h => h.departmentId === userDeptId);
        } else {
            filtered = [];
        }
    } else {
        // Normal User (or others) see ONLY their own records
        if (userId) {
             filtered = allHistory.filter((h) => {
                 if (h.borrower?.id === userId) return true;
                 if (userContact && h.borrower?.phone === userContact) return true;
                 return false;
             });
        } else {
             filtered = []; 
        }
    }

    filtered.sort((a, b) => {
        const timeA = new Date(a.borrowDate).getTime();
        const timeB = new Date(b.borrowDate).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });

    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

export default api;
