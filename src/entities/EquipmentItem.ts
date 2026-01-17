import { Entity, PrimaryColumn, Column, OneToMany, Index } from "typeorm";
import { BorrowHistory } from "./BorrowHistory";

@Entity()
export class EquipmentItem {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Index()
    @Column()
    categoryId: string = "";

    @Index()
    @Column()
    departmentId: string = "";

    @Column()
    quantity: number = 0;

    @Column()
    availableQuantity: number = 0;

    @Column({ type: "text", nullable: true })
    description?: string;

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

    @OneToMany(() => BorrowHistory, (history) => history.item, { cascade: true })
    borrowHistory!: BorrowHistory[];
}
