import { NextResponse } from 'next/server';
import { getPrincipal } from '@/lib/auth/session';

export { route, readJson } from '@/lib/http';
export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const principal = () => getPrincipal();
export const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
export type Params<T extends string> = { params: Promise<Record<T, string>> };
