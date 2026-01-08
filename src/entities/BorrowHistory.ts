import { Entity, PrimaryColumn, Column, ManyToOne } from "typeorm";
import { EquipmentItem } from "./EquipmentItem";

@Entity()
export class BorrowHistory {
    @PrimaryColumn()
    id: string = "";

    @Column()
    itemId: string = "";

    @Column("simple-json")
    borrower: { id?: string; name: string; phone: string } = { name: "", phone: "" };

    @Column()
    borrowDate: string = "";

    @Column()
    expectedReturnDate: string = "";

    @Column({ nullable: true })
    returnDate?: string;

    @Column()
    status: string = "";

    @Column({ nullable: true })
    photo?: string;

    @Column({ nullable: true })
    returnPhoto?: string;

    @Column({ nullable: true })
    forcedReturnBy?: string;

    @Column("simple-json", { nullable: true })
    operator?: { id?: string; name: string; phone: string };

    @ManyToOne(() => EquipmentItem, (item: EquipmentItem) => item.borrowHistory)
    item!: EquipmentItem;
}
