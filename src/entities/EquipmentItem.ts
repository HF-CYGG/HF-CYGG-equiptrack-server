import { Entity, PrimaryColumn, Column, OneToMany, Index } from "typeorm";
import { BorrowHistory } from "./BorrowHistory";

@Entity()
export class EquipmentItem {
    // 物资唯一 ID
    @PrimaryColumn()
    id: string = "";

    // 物资名称
    @Column()
    name: string = "";

    // 所属分类 ID
    @Index()
    @Column()
    categoryId: string = "";

    // 所属部门 ID
    @Index()
    @Column()
    departmentId: string = "";

    // 总数量
    @Column()
    quantity: number = 0;

    // 当前可用数量 (总数量 - 已借出 - 维修中)
    @Column()
    availableQuantity: number = 0;

    // 物资描述
    @Column({ type: "text", nullable: true })
    description?: string;

    // 待审批的借用数量 (冻结库存)
    @Column({ nullable: true })
    pendingApprovalQuantity?: number;

    // 缩略图 URL
    @Column({ nullable: true })
    image?: string;

    // 高清大图 URL
    @Column({ nullable: true })
    imageFull?: string;

    // 更多照片 (数组存储)
    @Column("simple-array", { nullable: true })
    photos?: string[];

    // 是否需要管理员审批才能借用
    @Column({ nullable: true })
    requiresApproval?: boolean;

    // 借还历史记录关联 (一对多)
    @OneToMany(() => BorrowHistory, (history) => history.item, { cascade: true })
    borrowHistory!: BorrowHistory[];
}
