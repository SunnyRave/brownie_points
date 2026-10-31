import { route, readJson, json, principal } from '@/lib/api';
import { addBookmark, listBookmarks, removeBookmark } from '@/lib/services/engagement';

export const GET = route(async () => json({ bookmarks: await listBookmarks(await principal()) }));
export const POST = route(async (req: Request) => json(await addBookmark(await principal(), await readJson(req))));
export const DELETE = route(async (req: Request) => json(await removeBookmark(await principal(), await readJson(req))));
