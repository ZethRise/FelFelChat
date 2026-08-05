import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// POST /api/rooms/[roomId]/read — mark room as read for current user
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = await params;

    // Update lastReadAt for this user in this room
    await prisma.roomMember.update({
      where: { userId_roomId: { userId: user.id, roomId } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/rooms/[roomId]/read error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
