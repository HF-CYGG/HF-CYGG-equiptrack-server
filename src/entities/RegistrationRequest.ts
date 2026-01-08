import { Entity, PrimaryColumn, Column } from "typeorm";

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

    @Column()
    passwordHash: string = "";
}
