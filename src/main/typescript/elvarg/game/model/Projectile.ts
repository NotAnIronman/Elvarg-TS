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
        let resolvedDelay = this.delay;
        let resolvedSpeed = this.speed;

        // Most combat spells use Java ProjectileBuilder defaults:
        // start=43, end=31, delay=51, duration=-5, span=10.
        // Older TS spell ports still pass (delay=0, speed=20), which makes
        // spell travel/desync look off versus Java. Normalize only this legacy
        // magic shape and keep all custom/ranged projectiles untouched.
        if (
            this.delay === 0 &&
            this.speed === 20 &&
            this.startHeight === 43 &&
            this.endHeight === 31
        ) {
            const distance = this.start.getDistance(this.end);
            resolvedDelay = 51;
            resolvedSpeed = resolvedDelay - 5 + distance * 10;
        }

        let recipients = 0;
        let scannedNetworkPlayers = 0;
        let skippedArea = 0;
        let skippedView = 0;
        World.forEachNetworkPlayer((player) => {
            scannedNetworkPlayers++;
            if (player.getPrivateArea() != this.privateArea) {
                skippedArea++;
                return;
            }
            if (!this.start.isViewableFrom(player.getLocation())) {
                skippedView++;
                return;
            }
            recipients++;
            player.getPacketSender().sendProjectile(this.start, this.end, 0, resolvedSpeed, this.projectileId, this.startHeight, this.endHeight, this.lockon, resolvedDelay);
        });
        if (process.env.PROJECTILE_DEBUG === "1") {
            console.log(
                `[projectile.send] id=${this.projectileId} recipients=${recipients} scanned=${scannedNetworkPlayers} skippedArea=${skippedArea} skippedView=${skippedView} start=(${this.start.getX()},${this.start.getY()},${this.start.getZ?.() ?? 0}) end=(${this.end.getX()},${this.end.getY()},${this.end.getZ?.() ?? 0})`
            );
        }
    }
}
