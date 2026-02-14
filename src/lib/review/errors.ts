export class ReviewError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

export class NotFoundError extends ReviewError {
    constructor(message: string) {
        super(message, 404);
    }
}

export class ConflictError extends ReviewError {
    constructor(message: string) {
        super(message, 409);
    }
}

export class ForbiddenError extends ReviewError {
    constructor(message: string) {
        super(message, 403);
    }
}

export class ChecklistValidationError extends ReviewError {
    constructor(message: string) {
        super(message, 400);
    }
}
