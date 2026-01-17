import { Entity, PrimaryColumn, Column, Index } from "typeorm";
import type { UserRole } from "../models/types";

@Entity()
export class User {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Index()
    @Column()
    contact: string = "";

    @Index()
    @Column()
    departmentId: string = "";

    @Column()
    departmentName: string = "";

    @Column()
    role: UserRole = "普通用户";

    @Column({ nullable: true })
    status?: string;

    @Column()
    password: string = "";

    @Column({ nullable: true })
    invitationCode?: string;

    @Column({ nullable: true })
    avatarUrl?: string;

    @Column({ nullable: true })
    banReason?: string;
}
