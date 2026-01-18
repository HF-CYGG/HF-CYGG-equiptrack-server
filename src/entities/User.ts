import { Entity, PrimaryColumn, Column, Index } from "typeorm";
import type { UserRole } from "../models/types";

@Entity()
export class User {
    // 用户唯一标识 ID (通常是 UUID 或时间戳生成)
    @PrimaryColumn()
    id: string = "";

    // 用户姓名
    @Column()
    name: string = "";

    // 联系方式 (手机号或邮箱)，已建立索引以加快查询
    @Index()
    @Column()
    contact: string = "";

    // 所属部门 ID，已建立索引
    @Index()
    @Column()
    departmentId: string = "";

    // 部门名称 (冗余字段，减少关联查询)
    @Column()
    departmentName: string = "";

    // 用户角色 (超级管理员 | 管理员 | 高级用户 | 普通用户)
    @Column()
    role: UserRole = "普通用户";

    // 账号状态 (active | banned | pending)
    @Column({ nullable: true })
    status?: string;

    // 密码 (经过哈希处理)
    @Column()
    password: string = "";

    // 邀请码 (用于注册时验证部门/角色)
    @Column({ nullable: true })
    invitationCode?: string;

    // 头像 URL
    @Column({ nullable: true })
    avatarUrl?: string;

    // 封禁原因 (仅当 status 为 banned 时有值)
    @Column({ nullable: true })
    banReason?: string;
}
