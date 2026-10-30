import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export const forbidden = (code = 'forbidden', message?: string) => new HttpError(403, code, message);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);

export function toErrorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: 'validation_failed', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}

/** Wraps a route handler so thrown HttpErrors / ZodErrors become JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest('invalid_json');
  }
}
