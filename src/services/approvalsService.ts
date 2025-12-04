import { readAll, writeAll } from "../utils/store";
import type { RegistrationRequest, User, Department } from "../models/types";
import { addUser } from "./usersService";

export async function listApprovals(filter: {
  userId?: string;
  userRole: "超级管理员" | "管理员" | "高级用户" | "普通用户";
  departmentId?: string;
}): Promise<RegistrationRequest[]> {
  console.log("[Approvals] Listing for:", filter);
  try {
    const requests = await readAll<RegistrationRequest>("registration_requests");
    console.log("[Approvals] Total requests:", requests.length);
    
    // Only show pending requests
    let filtered = requests.filter(r => r.status === 'pending');

    if (filter.userRole === "超级管理员") {
      // Super Admin sees all requests
      return filtered;
    } else if (["管理员", "高级用户"].includes(filter.userRole)) {
      // Administrators and Advanced Users only see requests initiated with their invitation code
      const users = await readAll<User>("users");
      const self = users.find((u) => u.id === filter.userId);
      
      if (!self) {
        console.log("[Approvals] User not found:", filter.userId);
        return [];
      }
      
      filtered = requests.filter(
        (r) => r.invitedByUserId === self.id || (self.invitationCode && r.invitationCode === self.invitationCode)
      );
    } else {
      // Regular users see nothing
      return [];
    }
    
    return filtered;
  } catch (err) {
    console.error("[Approvals] Error in listApprovals:", err);
    throw err;
  }
}

export async function approveRequest(requestId: string): Promise<void> {
  const requests = await readAll<RegistrationRequest>("registration_requests");
  const reqIndex = requests.findIndex((r) => r.id === requestId);
  if (reqIndex === -1) throw Object.assign(new Error("Request not found"), { status: 404 });
  const req = requests[reqIndex];

  if (req.status !== "pending") {
    throw Object.assign(new Error("Request already processed"), { status: 400 });
  }

  // Resolve department
  const depts = await readAll<Department>("departments");
  const dept = depts.find((d) => d.name === req.departmentName);
  if (!dept) throw Object.assign(new Error(`Department '${req.departmentName}' not found`), { status: 400 });

  // Create User
  await addUser({
    name: req.name,
    contact: req.contact,
    departmentId: dept.id,
    departmentName: req.departmentName,
    role: "普通用户", // Default role
    password: req.password || "123456", // Fallback
    invitationCode: req.invitationCode,
  });

  // Update request status - CHANGED: Delete request after approval to keep data clean
  requests.splice(reqIndex, 1);
  await writeAll<RegistrationRequest>("registration_requests", requests);
}

export async function rejectRequest(requestId: string): Promise<void> {
  const requests = await readAll<RegistrationRequest>("registration_requests");
  const reqIndex = requests.findIndex((r) => r.id === requestId);
  if (reqIndex === -1) throw Object.assign(new Error("Request not found"), { status: 404 });

  const req = requests[reqIndex];
  if (req.status !== "pending") {
     throw Object.assign(new Error("Request already processed"), { status: 400 });
  }
  
  req.status = "rejected";
  requests[reqIndex] = req;
  await writeAll<RegistrationRequest>("registration_requests", requests);
}