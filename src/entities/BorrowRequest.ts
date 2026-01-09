import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class BorrowRequest {
    @PrimaryColumn()
    id: string = "";

    @Column()
    itemId: string = "";

    @Column()
    itemDepartmentId: string = "";

    @Column({ nullable: true })
    itemName?: string;

    @Column({ nullable: true })
    itemImage?: string;

    @Column("simple-json")
    borrower: { id?: string; name: string; phone: string } = { name: "", phone: "" };

    @Column("simple-json")
    applicant: { id?: string; name: string; phone: string } = { name: "", phone: "" };

    @Column()
    expectedReturnDate: string = "";

    @Column({ type: "longtext", nullable: true })
    photo?: string;

    @Column()
    quantity: number = 0;

    @Column()
    status: string = "";

    @Column({ nullable: true })
    remark?: string;

    @Column({ nullable: true })
    note?: string;

    @Column()
    createdAt: string = "";

    @Column({ nullable: true })
    reviewedAt?: string;

    @Column("simple-json", { nullable: true })
    reviewer?: { id?: string; name: string; phone: string };

    @Column({ nullable: true })
    borrowDate?: string;
}
