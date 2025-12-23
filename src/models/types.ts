export type UserRole = "超级管理员" | "管理员" | "高级用户" | "普通用户";

export interface Department {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface BorrowerInfo {
  id?: string;
  name: string;
  phone: string;
}

export type BorrowStatus =
  | "借用中"
  | "逾期未归还"
  | "已归还"
  | "逾期归还";

export interface BorrowHistoryEntry {
  id: string;
  itemId: string;
  borrower: BorrowerInfo;
  borrowDate: string;
  expectedReturnDate: string;
  returnDate?: string;
  status: BorrowStatus;
  photo?: string; // Borrow proof photo
  returnPhoto?: string; // Return proof photo
  forcedReturnBy?: string; // 管理员强制归还者
  operator?: BorrowerInfo; // Operator who performed the borrow action
}

export interface EquipmentItem {
  id: string;
  name: string;
  categoryId: string;
  departmentId: string;
  totalQuantity: number;
  availableQuantity: number;
  image?: string; // Main image path
  imageFull?: string; // Full image path
  photos?: string[]; // 可选图片
  borrowHistory: BorrowHistoryEntry[];
}

export interface User {
  id: string;
  name: string;
  contact: string;
  departmentId: string;
  departmentName: string;
  role: UserRole;
  status?: string;
  password: string; // 存储明文仅用于演示；生产需哈希
  invitationCode?: string;
}

export interface RegistrationRequest {
  id: string;
  name: string;
  contact: string;
  departmentName: string;
  invitationCode: string;
  invitedByUserId?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  password?: string;
}
