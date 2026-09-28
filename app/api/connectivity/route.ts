export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
