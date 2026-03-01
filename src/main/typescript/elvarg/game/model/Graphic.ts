import { GraphicHeight } from "./GraphicHeight";
import { Priority } from "./Priority";
export class Graphic {
    public id: number;
    public delay: number;
    public height: GraphicHeight;
    public priority: Priority;

    constructor(id: number);
    constructor(id: number, delay: number);
    constructor(id: number, height: GraphicHeight);
    constructor(id: number, delay: number, height: GraphicHeight);
    constructor(id: number, delayOrHeight?: number | GraphicHeight, heightArg?: GraphicHeight) {
        this.id = id;
        if (typeof heightArg === "number") {
            this.delay = typeof delayOrHeight === "number" ? delayOrHeight : 0;
            this.height = heightArg;
        } else if (typeof delayOrHeight === "number" && delayOrHeight in GraphicHeight) {
            this.delay = 0;
            this.height = delayOrHeight as GraphicHeight;
        } else if (typeof delayOrHeight === "number") {
            this.delay = delayOrHeight;
            this.height = GraphicHeight.LOW;
        } else {
            this.delay = 0;
            this.height = GraphicHeight.LOW;
        }
        this.priority = Priority.LOW;
    }

    public getId(): number {
        return this.id;
    }

    /**
* Gets the graphic's wait delay.
*
* @return delay.
*/
    public getDelay(): number {
        return this.delay;
    }

    /**
     * Gets the graphic's height level to be displayed in.
     *
     * @return The height level.
     */
    public getHeight(): GraphicHeight {
        return this.height;
    }

    /**
     * Gets the priority of this graphic.
     *
     * @return the priority.
     */
    public getPriority(): Priority {
        return this.priority;
    }
}
