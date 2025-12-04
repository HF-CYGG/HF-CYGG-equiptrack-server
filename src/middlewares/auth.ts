import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { User } from "../models/types";

export function authGuard(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["authorization"];
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;
    (req as any).user = payload.user as Omit<User, "password">;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}