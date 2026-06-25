import { Request, Response, NextFunction } from 'express';
import { inspect } from 'util';
import fs from 'fs';

export interface AppError extends Error {
    statusCode?: number;
    isOperational?: boolean;
}

export function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const statusCode = err.statusCode || 500;
    const message = err.isOperational ? err.message : 'Internal Server Error';

    // Log full error for debugging
    const errorPrefix = `[ERROR] ${new Date().toISOString()} - ${req.method} ${req.path}:`;
    const formattedError = inspect(err, { depth: null, colors: true });
    console.error(errorPrefix, formattedError);

    try {
        fs.appendFileSync('server_debug_error.log', `[FATAL] ${new Date().toISOString()} - ${req.method} ${req.path}: ${inspect(err, { depth: null, colors: false })}\n`);
    } catch (e) {
        console.error('Failed to write to debug log:', e);
    }

    res.status(statusCode).json({
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
}

export function createError(message: string, statusCode: number): AppError {
    const error = new Error(message) as AppError;
    error.statusCode = statusCode;
    error.isOperational = true;
    return error;
}

export function notFound(req: Request, res: Response, next: NextFunction): void {
    next(createError(`Route ${req.originalUrl} not found`, 404));
}
