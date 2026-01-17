import { Entity, PrimaryColumn, Column, ManyToOne, Index } from "typeorm";
import { EquipmentItem } from "./EquipmentItem";

@Entity()
export class BorrowHistory {
    @PrimaryColumn()
    id: string = "";

    @Index()
    @Column()
    itemId: string = "";

    @Column("simple-json")
    borrower: { id?: string; name: string; phone: string } = { name: "", phone: "" };

    @Index()
    @Column()
    borrowDate: string = "";

    @Column()
    expectedReturnDate: string = "";

    @Index()
    @Column({ nullable: true })
    returnDate?: string;

    @Column()
    status: string = "";

    @Column({ type: "longtext", nullable: true })
    photo?: string;

    @Column({ type: "longtext", nullable: true })
    returnPhoto?: string;

    @Column({ nullable: true })
    forcedReturnBy?: string;

    @Column({ type: "text", nullable: true })
    remark?: string;

    @Column({ type: "text", nullable: true })
    note?: string;

    @Column("simple-json", { nullable: true })
    operator?: { id?: string; name: string; phone: string };

    @ManyToOne(() => EquipmentItem, (item: EquipmentItem) => item.borrowHistory)
    item!: EquipmentItem;
}
