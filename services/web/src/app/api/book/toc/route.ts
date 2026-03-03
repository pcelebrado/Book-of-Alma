import { getBookTocCollection } from '@/lib/db/collections';

export const dynamic = 'force-dynamic';

export async function GET() {
  const tocCollection = await getBookTocCollection();

  const toc =
    (await tocCollection.findOne({ _id: 'default' })) ??
    (await tocCollection.find({}).sort({ updatedAt: -1 }).limit(1).next());

  return Response.json({
    tocTree: toc?.tree ?? {},
    updatedAt: toc?.updatedAt ?? null,
  });
}
