import { Location } from "./Location";
import { World } from '../World';
import { Mobile } from "../entity/impl/Mobile";
import { PrivateArea } from "./areas/impl/PrivateArea";

export class Projectile {
    private start: Location;
    private end: Location;
    private speed: number;
    private projectileId: number;
    private startHeight: number;
    private endHeight: number;
    private lockon: Mobile;
    private delay: number;
    private privateArea: PrivateArea;

    constructor(start: Location, end: Location, lockon: Mobile, projectileId: number, delay: number, speed: number,
        startHeight: number, endHeight: number, privateArea: PrivateArea) {
        this.start = start;
        this.lockon = lockon;
        this.end = end;
        this.projectileId = projectileId;
        this.delay = delay;
        this.speed = speed;
        this.startHeight = startHeight;
        this.endHeight = endHeight;
        this.privateArea = privateArea;
        }

        static createProjectile(source: Mobile, victim: Mobile, projectileId: number, delay: number, speed: number,
                            startHeight: number, endHeight: number) {
        return new Projectile(
            source.getLocation(),
            victim.getLocation(),
            victim,
            projectileId,
            delay,
            speed,
            startHeight,
            endHeight,
            source.getPrivateArea()
        );
    }


    public sendProjectile(): void {
        let recipients = 0;
        let skippedNull = 0;
        let skippedArea = 0;
        let skippedView = 0;
        for (let player of World.getPlayers()) {
            if (player == null) {
                skippedNull++;
                continue;
            }
            if (player.getPrivateArea() != this.privateArea) {
                skippedArea++;
                continue;
            }
            if (!this.start.isViewableFrom(player.getLocation())) {
                skippedView++;
                continue;
            }
            recipients++;
            player.getPacketSender().sendProjectile(this.start, this.end, 0, this.speed, this.projectileId, this.startHeight, this.endHeight, this.lockon, this.delay);
        }
        if (process.env.PROJECTILE_DEBUG === "1") {
            console.log(
                `[projectile.send] id=${this.projectileId} recipients=${recipients} skippedNull=${skippedNull} skippedArea=${skippedArea} skippedView=${skippedView} start=(${this.start.getX()},${this.start.getY()},${this.start.getZ?.() ?? 0}) end=(${this.end.getX()},${this.end.getY()},${this.end.getZ?.() ?? 0})`
            );
        }
    }
}
