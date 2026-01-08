import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity()
export class DeviceToken {
    @PrimaryColumn()
    token: string = "";

    @Column()
    userId: string = "";

    @Column()
    platform: string = "";

    @Column()
    updatedAt: string = "";
}
