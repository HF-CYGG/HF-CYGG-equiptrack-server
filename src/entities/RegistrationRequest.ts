import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class RegistrationRequest {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Column()
    contact: string = "";

    @Column()
    departmentName: string = "";

    @Column()
    invitationCode: string = "";

    @Column({ nullable: true })
    invitedByUserId?: string;

    @Column()
    status: string = "";

    @CreateDateColumn()
    createdAt: Date = new Date();

    @Column()
    passwordHash: string = "";
}
