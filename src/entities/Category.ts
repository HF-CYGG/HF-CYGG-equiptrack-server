import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class Category {
    @PrimaryColumn()
    id: string = "";

    @Column()
    name: string = "";

    @Column()
    color: string = "";
}
