import { AppDataSource } from "../data-source";
import { BorrowHistory } from "../entities/BorrowHistory";
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

const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });

const requireString = (value: any, field: string, opts?: { min?: number; max?: number }) => {
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 256;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const v = value.trim();
  if (v.length < min) throw badRequest(`${field} is required`);
  if (v.length > max) throw badRequest(`${field} is too long`);
  return v;
};

const optionalString = (value: any, field: string, opts?: { max?: number }) => {
  if (value === undefined || value === null) return undefined;
  const max = opts?.max ?? 256;
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const v = value.trim();
  if (!v) return undefined;
  if (v.length > max) throw badRequest(`${field} is too long`);
  return v;
};

const requireEnum = <T extends readonly string[]>(value: any, field: string, allowed: T): T[number] => {
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  if (!allowed.includes(value as any)) throw badRequest(`${field} is invalid`);
  return value as any;
};

// 登录频率限制：防止暴力破解
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15分钟时间窗口
	max: 5, // 每个IP限制5次请求
	message: { message: "尝试登录次数过多，请15分钟后再试" },
	standardHeaders: true,
	legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: "注册申请过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `${req.ip}:${(req.body?.contact ?? "").toString().trim()}`,
});

// 系统/应用版本信息接口
api.get("/system/android-version", async (_req, res, next) => {
  try {
    // 使用 __dirname 可靠地定位 app_version.json (相对于编译后的文件位置)
    // dist/routes/api.js -> ../../app_version.json
    const versionPath = path.resolve(__dirname, "../../app_version.json");
    let versions: AppVersion[] = [];
    try {
        const data = await fs.readFile(versionPath, "utf8");
        versions = JSON.parse(data);
    } catch (e) {
        // 如果文件未找到，则回退或为空
        console.error("Failed to read app_version.json", e);
    }
    
    const latest = versions[0];
    if (latest) {
      // 如果缺少下载链接，自动填充为 GitHub Release 的 CDN 链接
      if (!latest.downloadUrl) {
        const tagName = latest.versionName.startsWith("v") ? latest.versionName : `v${latest.versionName}`;
        // 标准构建的 APK 名称
        const originalUrl = `https://github.com/YeMiao_cats/EquipTrack/releases/download/${tagName}/app-release.apk`;
        // 使用国内镜像加速下载
        latest.downloadUrl = `https://mirror.ghproxy.com/${originalUrl}`;
      }
      res.json(latest);
    } else {
      // 默认/初始状态
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

// 认证相关接口
api.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const contact = requireString(body.contact, "contact", { max: 64 });
    const password = requireString(body.password, "password", { min: 1, max: 128 });
    const { user, token } = await login(contact, password);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

api.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const payload = {
      name: requireString(body.name, "name", { max: 64 }),
      contact: requireString(body.contact, "contact", { max: 64 }),
      departmentName: requireString(body.departmentName, "departmentName", { max: 64 }),
      invitationCode: requireString(body.invitationCode, "invitationCode", { max: 64 }),
      invitedByUserId: optionalString(body.invitedByUserId, "invitedByUserId", { max: 64 }),
      password: optionalString(body.password, "password", { max: 128 }),
    };
    const result = await signup(payload);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 公共数据接口
api.put("/departments/structure", authGuard, async (req, res, next) => {
  try {
    // 仅管理员可更新部门结构
    const user = (req as any).user;
    if (user.role !== "超级管理员" && user.role !== "管理员") {
      throw Object.assign(new Error("无权操作"), { status: 403 });
    }
    const updates = req.body; // 数组结构: { id, parentId, order }
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

// 以下所有路由均受 JWT 认证保护
api.use(authGuard);

const tokenRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { message: "操作过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `${req.ip}:${req.user?.id ?? ""}`,
});

// 通知注册接口
api.post("/notifications/register", tokenRegisterLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const token = requireString(body.token, "token", { max: 4096 });
    const platform = body.platform
      ? requireEnum(body.platform, "platform", ["android", "ios"] as const)
      : "android";
    // req.user 由 authGuard 中间件填充
    await registerDeviceToken((req as any).user!.id, token, platform);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { message: "上传过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `${req.ip}:${req.user?.id ?? ""}`,
});

// 文件上传接口（必须登录）
api.post("/upload", uploadLimiter, upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const type = (req.query.type || (req.body as any)?.type) as string;
    let subfolder = "items";
    let urlPrefix = "/uploads";

    if (type === "item_thumb") subfolder = "items/thumbs";
    else if (type === "item_full") subfolder = "items/full";
    else if (type === "item") subfolder = "items";
    else if (type === "return") subfolder = "returns";
    else if (type === "borrow") subfolder = "borrows";
    else if (type === "avatar") {
      urlPrefix = "/avatars";
      subfolder = "";
    }

    const fileUrl = subfolder
      ? `${urlPrefix}/${subfolder}/${req.file.filename}`
      : `${urlPrefix}/${req.file.filename}`;

    res.json({ url: fileUrl });
  } catch (err) {
    next(err);
  }
});

// 角色检查辅助函数
const requireAdmin = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员") return next();
  res.status(403).json({ message: "Forbidden: Admins only" });
};

// 角色层级定义 (值越小 = 权限越高)
const ROLE_RANK: Record<UserRole, number> = {
  "超级管理员": 0,
  "管理员": 1,
  "高级用户": 2,
  "普通用户": 3
};

const getRoleRank = (role: UserRole): number => ROLE_RANK[role] ?? 999;

// 严格层级权限检查辅助函数
// 当前用户只能管理级别严格低于自己(rank值更大)的目标用户
const canManageTargetRole = (currentRole: UserRole, targetRole: UserRole): boolean => {
  return getRoleRank(currentRole) < getRoleRank(targetRole);
};

// 仅限管理员或本人操作的检查辅助函数
const requireAdminOrSelf = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  const currentUserId = req.user?.id;
  const targetUserId = req.params.id;

  if (role === "超级管理员" || role === "管理员") return next();
  if (currentUserId === targetUserId) return next();
  
  res.status(403).json({ message: "Forbidden: Admins or Self only" });
};

// 物资管理权限检查辅助函数 (管理员 + 高级用户)
const requireItemManagePermission = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员" || role === "高级用户") return next();
  res.status(403).json({ message: "Forbidden: Insufficient permissions" });
};

// 部门管理接口 (受保护)
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

// 分类管理接口
api.get("/categories", async (_req, res, next) => {
  try {
    res.json(await listCategories());
  } catch (err) {
    next(err);
  }
});

api.post("/categories", requireAdmin, async (req, res, next) => {
  try {
    res.json(await addCategory(req.body.name, req.body.color));
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

// 物资管理接口
api.get("/items", async (req, res, next) => {
  try {
    // listItems 现在会处理待审批数量计算并返回视图模型
    const items = await listItems();
    
    const ctx = (req as any).user as { role: UserRole; departmentId?: string };
    const userRole = ctx?.role as UserRole;
    
    let departmentId = ctx?.departmentId;
    
    if (req.query.departmentId) {
        departmentId = req.query.departmentId as string;
        if (departmentId === "all") departmentId = undefined;
    } else if (req.query.showAll === "true" || userRole === "超级管理员") {
        departmentId = undefined;
    }

    const allAvailable = req.query.allAvailable === "true";
    const filtered = filterItems(items, { userRole, departmentId, allAvailable });
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
    const { name, categoryId, quantity, departmentId } = req.body;
    if (!name || !categoryId || quantity === undefined || !departmentId) {
       res.status(400).json({ message: "缺少必填字段 (name, categoryId, quantity, departmentId)" });
       return;
    }
    if (typeof quantity !== 'number' || quantity < 0) {
       res.status(400).json({ message: "quantity 必须为非负数字" });
       return;
    }
    res.json(await addItem(req.body));
  } catch (err) {
    next(err);
  }
});

api.put("/items/:id", requireItemManagePermission, async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 0)) {
       res.status(400).json({ message: "quantity 必须为非负数字" });
       return;
    }
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
    // 对于普通用户，强制借用人信息为本人
    let borrower = req.body.borrower;
    if (user.role === "普通用户") {
       borrower = {
         id: user.id,
         name: user.name,
         phone: user.contact
       };
    } else {
       // 对于管理员/高级用户，如果可能则确保 ID 存在，或信任 payload
       // 最好是在姓名匹配时注入 ID。这里简单处理：如果缺少 ID 则尝试附加。
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

// 用户管理接口
api.get("/users", async (req, res, next) => {
  try {
    const users = await listUsers();
    const ctx = (req as any).user as { role: UserRole; departmentId?: string };
    const userRole = ctx?.role as UserRole;

    let departmentId = ctx?.departmentId;
    // 超级管理员可以通过查询参数过滤部门
    if (userRole === "超级管理员" && req.query.departmentId) {
      departmentId = req.query.departmentId as string;
    } else if (userRole === "超级管理员" && !req.query.departmentId) {
      departmentId = undefined;
    }

    const filterOpts: { role?: UserRole; departmentId?: string } = {};

    if (userRole === "超级管理员") {
      // 超级管理员：默认查看全局；如带 departmentId，则只看指定部门
      if (departmentId) {
        filterOpts.departmentId = departmentId;
      }
    } else if (userRole === "管理员") {
      // 管理员：查看本部门所有角色
      if (departmentId) {
        filterOpts.departmentId = departmentId;
      }
    } else {
      // 其他角色（理论上不会访问用户管理），双重保险：只能看到与自己同角色、同部门的数据
      filterOpts.role = userRole;
      if (departmentId) {
        filterOpts.departmentId = departmentId;
      }
    }

    const filtered = await filterUsers(users, filterOpts);
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
    const body = req.body || {};
    const newUserRole = requireEnum(body.role, "role", ["超级管理员", "管理员", "高级用户", "普通用户"] as const) as UserRole;

    // 安全检查：无法创建角色等级 >= 当前用户的用户
    if (!canManageTargetRole(currentUserRole, newUserRole)) {
       res.status(403).json({ message: "权限不足：无法创建同级或更高级别的用户角色" });
       return;
    }

    const payload = {
      name: requireString(body.name, "name", { max: 64 }),
      contact: requireString(body.contact, "contact", { max: 64 }),
      departmentId: requireString(body.departmentId, "departmentId", { max: 64 }),
      departmentName: requireString(body.departmentName, "departmentName", { max: 64 }),
      role: newUserRole,
      status: optionalString(body.status, "status", { max: 32 }),
      password: requireString(body.password, "password", { min: 1, max: 128 }),
      invitationCode: optionalString(body.invitationCode, "invitationCode", { max: 64 }),
      avatarUrl: optionalString(body.avatarUrl, "avatarUrl", { max: 512 }),
      banReason: optionalString(body.banReason, "banReason", { max: 256 }),
    };

    const { password, ...u } = await addUser(payload as any);
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

    const body = req.body || {};
    const updates: any = {};
    if (body.name !== undefined) updates.name = requireString(body.name, "name", { max: 64 });
    if (body.contact !== undefined) updates.contact = requireString(body.contact, "contact", { max: 64 });
    if (body.departmentId !== undefined) updates.departmentId = requireString(body.departmentId, "departmentId", { max: 64 });
    if (body.departmentName !== undefined) updates.departmentName = requireString(body.departmentName, "departmentName", { max: 64 });
    if (body.role !== undefined) updates.role = requireEnum(body.role, "role", ["超级管理员", "管理员", "高级用户", "普通用户"] as const);
    if (body.status !== undefined) updates.status = requireString(body.status, "status", { max: 32 });
    if (body.password !== undefined) updates.password = requireString(body.password, "password", { min: 1, max: 128 });
    if (body.invitationCode !== undefined) updates.invitationCode = requireString(body.invitationCode, "invitationCode", { max: 64 });
    if (body.avatarUrl !== undefined) updates.avatarUrl = requireString(body.avatarUrl, "avatarUrl", { max: 512 });
    if (body.banReason !== undefined) updates.banReason = requireString(body.banReason, "banReason", { max: 256 });

    const targetUser = await getUser(req.params.id);
    
    // 安全检查 1: 层级强制 (针对管理他人)
    if (!isSelf) {
        // 无法编辑角色等级 >= 当前用户的用户
        if (!canManageTargetRole(currentUserRole, targetUser.role)) {
            res.status(403).json({ message: "权限不足：无法编辑同级或更高级别的用户" });
            return;
        }

        // 如果修改角色，无法提升至 >= 当前用户的等级
        if (updates.role && !canManageTargetRole(currentUserRole, updates.role as UserRole)) {
            res.status(403).json({ message: "权限不足：无法将用户提升至同级或更高级别" });
            return;
        }
    } else {
        // 安全检查 2: 自我管理限制 (针对非超级管理员)
        if (currentUserRole !== "超级管理员") {
             // 无法修改自己的角色
             if (updates.role && updates.role !== targetUser.role) {
                 res.status(403).json({ message: "权限不足：无法修改自己的角色" });
                 return;
             }
             // 无法修改自己的状态
             if (updates.status && updates.status !== targetUser.status) {
                 res.status(403).json({ message: "权限不足：无法修改自己的状态" });
                 return;
             }
        }
    }

    // 安全检查 3: 邀请码 (全局规则：仅超级管理员可修改)
    if (currentUserRole !== "超级管理员") {
        if (updates.invitationCode !== undefined && updates.invitationCode !== targetUser.invitationCode) {
             res.status(403).json({ message: "权限不足：仅超级管理员可修改邀请码" });
             return;
        }
    }

    const { password, ...u } = await updateUser(req.params.id, updates);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.delete("/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const currentUserRole = (req as any).user.role as UserRole;
    const targetUser = await getUser(req.params.id);

    // 安全检查：无法删除角色等级 >= 当前用户的用户
    if (!canManageTargetRole(currentUserRole, targetUser.role)) {
        res.status(403).json({ message: "权限不足：无法删除同级或更高级别的用户" });
        return;
    }

    res.json(await deleteUser(req.params.id));
  } catch (err) {
    next(err);
  }
});

const approvalsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: { message: "操作过于频繁，请稍后再试" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `${req.ip}:${req.user?.id ?? ""}`,
});

// 注册审批接口
api.get("/approvals", async (req, res, next) => {
  try {
    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string };
    const list = await listApprovals({ userId: ctx.id, userRole: ctx.role, departmentId: ctx.departmentId });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

api.post("/approvals/:id", approvalsLimiter, async (req, res, next) => {
  try {
    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string };
    const id = requireString(req.params.id, "id", { max: 64 });
    await approveRequest(id, { userId: ctx.id, userRole: ctx.role, departmentId: ctx.departmentId });
    res.json({ message: "Approved" });
  } catch (err) {
    next(err);
  }
});

api.delete("/approvals/:id", approvalsLimiter, async (req, res, next) => {
  try {
    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string };
    const id = requireString(req.params.id, "id", { max: 64 });
    await rejectRequest(id, { userId: ctx.id, userRole: ctx.role, departmentId: ctx.departmentId });
    res.json({ message: "Rejected" });
  } catch (err) {
    next(err);
  }
});

// 借还历史记录接口
api.get("/history", async (req, res, next) => {
  try {
    const ctx = (req as any).user as { id: string; role: UserRole; departmentId?: string; contact?: string };
    const historyRepo = AppDataSource.getRepository(BorrowHistory);
    
    // 优化：直接查询 BorrowHistory 表，而不是遍历所有物资
    let query = historyRepo.createQueryBuilder("history")
        .leftJoinAndSelect("history.item", "item")
        .orderBy("history.borrowDate", "DESC");

    const userId = ctx?.id;
    const userRole = ctx?.role;
    const userContact = ctx?.contact || "";
    const filterDeptId = req.query.departmentId as string | undefined;

    if (userRole === "超级管理员") {
        if (filterDeptId) {
            query.where("item.departmentId = :deptId", { deptId: filterDeptId });
        }
    } else if (userRole === "管理员" || userRole === "高级用户") {
        if (ctx.departmentId) {
            query.where("item.departmentId = :deptId", { deptId: ctx.departmentId });
        } else {
            return res.json([]);
        }
    } else {
        // 普通用户：通过 JSON 字段过滤
        // 注意：使用原生 SQL 提取 JSON
        if (userId) {
             query.where(
                "(JSON_EXTRACT(history.borrower, '$.id') = :userId OR JSON_EXTRACT(history.borrower, '$.phone') = :contact)",
                { userId, contact: userContact }
            );
        } else {
             return res.json([]);
        }
    }

    const histories = await query.getMany();

    const response = histories.map(h => ({
        ...h,
        itemId: h.item?.id,
        itemName: h.item?.name,
        itemCategory: h.item?.categoryId,
        itemImage: h.item?.photos?.[0] || h.item?.image,
        departmentId: h.item?.departmentId,
        borrowerName: h.borrower?.name || "未知借用人",
        borrowerContact: (h.borrower as any)?.phone || (h.borrower as any)?.contact || "",
        operatorUserId: h.operator?.id || "",
        operatorName:
          typeof h.operator?.name === "string" && /auto-?approved/i.test(h.operator.name)
            ? "自动审批"
            : h.operator?.name || "系统记录",
        operatorContact:
          typeof h.operator?.name === "string" && /auto-?approved/i.test(h.operator.name)
            ? ""
            : (h.operator as any)?.phone || (h.operator as any)?.contact || ""
    }));

    res.json(response);
  } catch (err) {
    next(err);
  }
});

export default api;
