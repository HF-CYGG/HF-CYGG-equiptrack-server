import { Router } from "express";
import { login, signup } from "../services/authService";
import { listDepartments, addDepartment, updateDepartment, deleteDepartment } from "../services/departmentsService";
import { listCategories, addCategory, deleteCategory } from "../services/categoriesService";
import { listItems, getItem, addItem, updateItem, deleteItem, borrowItem, returnItem, filterItems } from "../services/itemsService";
import { listUsers, getUser, addUser, updateUser, deleteUser, filterUsers } from "../services/usersService";
import { listApprovals, approveRequest, rejectRequest } from "../services/approvalsService";
import type { UserRole } from "../models/types";
import { authGuard } from "../middlewares/auth";
import { upload } from "../middlewares/upload";

export const api = Router();

// Auth
api.post("/login", async (req, res, next) => {
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
    if (type === "item") subfolder = "items";
    else if (type === "return" || type === "borrow") subfolder = "returns";
    
    const fileUrl = `/uploads/${subfolder}/${req.file.filename}`;
    res.json({ url: fileUrl });
  } catch (err) {
    next(err);
  }
});

// Protect all routes below with JWT auth
api.use(authGuard);

// Helper for role check
const requireAdmin = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员") return next();
  res.status(403).json({ message: "Forbidden: Admins only" });
};

// Helper for item management check (Admins + Advanced Users)
const requireItemManagePermission = (req: any, res: any, next: any) => {
  const role = req.user?.role as UserRole;
  if (role === "超级管理员" || role === "管理员" || role === "高级用户") return next();
  res.status(403).json({ message: "Forbidden: Insufficient permissions" });
};

// Departments (Protected actions)
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
        expectedReturnDate: req.body.expectedReturnDate,
        photo: req.body.photo,
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
    const { password, ...u } = await addUser(req.body);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.put("/users/:id", requireAdmin, async (req, res, next) => {
  try {
    const { password, ...u } = await updateUser(req.params.id, req.body);
    res.json(u);
  } catch (err) {
    next(err);
  }
});

api.delete("/users/:id", requireAdmin, async (req, res, next) => {
  try {
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
            // Provide default operator info (since server doesn't store it yet)
            operatorUserId: "",
            operatorName: "系统记录",
            operatorContact: ""
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

    filtered.sort((a, b) => new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime());

    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

export default api;