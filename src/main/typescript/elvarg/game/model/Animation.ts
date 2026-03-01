enum Priority {
    LOW
}

export class Animation {
    public static DEFAULT_RESET_ANIMATION: Animation;
    public id: number;
    public delay: number;
    public priority: Priority;

    constructor(id: number) {
        this.id = id;
        this.delay = 0;
        this.priority = Priority.LOW;
    }

    getId(): number {
        return this.id;
    }

    getDelay(): number {
        return this.delay;
    }

    getPriority() {
        return this.priority;
    }
}

// initialize static after enum exists
Animation.DEFAULT_RESET_ANIMATION = new Animation(65535);
