import { Entity, PrimaryColumn, Column, OneToMany } from "typeorm";
import { BorrowHistory } from "./BorrowHistory";

@Entity()
export class EquipmentItem {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Column()
    categoryId: string = "";

    @Column()
    departmentId: string = "";

    @Column()
    quantity: number = 0;

    @Column()
    availableQuantity: number = 0;

    @Column({ nullable: true })
    pendingApprovalQuantity?: number;

    @Column({ nullable: true })
    image?: string;

    @Column({ nullable: true })
    imageFull?: string;

    @Column("simple-array", { nullable: true })
    photos?: string[];

    @Column({ nullable: true })
    requiresApproval?: boolean;

    @OneToMany(() => BorrowHistory, (history) => history.item, { cascade: true, eager: true })
    borrowHistory!: BorrowHistory[];
}
