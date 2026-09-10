import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";

/**
 * 认证上下文：请求处理过程中可信的调用者身份。
 * 这些字段一律以数据库为准，不采用 JWT 载荷中的值，
 * 否则令牌一旦被伪造或用户权限变更后，鉴权判断就会读到攻击者/过期的数据。
 */
export interface AuthContext {
  id: string;
  name: string;
  contact: string;
  role: string;
  departmentId: string;
}

interface CacheEntry {
  context: AuthContext;
  expiresAt: number;
}

// 用户身份的短时缓存，避免每个请求都回查数据库
const userCache = new Map<string, CacheEntry>();

/** 使某个用户的身份缓存立即失效（改角色、改部门、封禁、删号后调用） */
export function invalidateAuthCache(userId: string) {
  userCache.delete(userId);
}

/** 清空全部身份缓存 */
export function clearAuthCache() {
  userCache.clear();
}

async function loadAuthContext(userId: string): Promise<AuthContext | null> {
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.context;
  }

  const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });

  // 用户已被删除，或状态不是 active（封禁/待审批），立即失效
  if (!user || (user.status && user.status !== "active")) {
    userCache.delete(userId);
    return null;
  }

  const context: AuthContext = {
    id: user.id,
    name: user.name,
    contact: user.contact,
    role: user.role,
    departmentId: user.departmentId,
  };

  userCache.set(userId, { context, expiresAt: now + env.AUTH_USER_CACHE_TTL_MS });
  return context;
}

export async function authGuard(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"];
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = header.slice(7);

  let payload: any;
  try {
    // 固定签名算法，防止将来换用非对称密钥时出现算法混淆
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = typeof payload?.id === "string" ? payload.id : "";
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    // 令牌只用来确定"你声称是谁"，真正的角色与部门以数据库为准
    const context = await loadAuthContext(userId);
    if (!context) {
      return res.status(401).json({ message: "账号不存在或已被禁用，请重新登录" });
    }

    (req as any).user = context;
    next();
  } catch (err) {
    next(err);
  }
}
