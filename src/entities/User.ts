import { Entity, PrimaryColumn, Column } from "typeorm";
import type { UserRole } from "../models/types";

@Entity()
export class User {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Column()
    contact: string = "";

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
}
