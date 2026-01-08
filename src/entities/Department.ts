import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class Department {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Column({ nullable: true })
    parentId?: string;

    @Column({ default: true })
    requiresApproval: boolean = true;

    @Column({ default: 0 })
    order: number = 0;
}
