import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/routeAuth';

// GET /api/rooms/:roomId/members - Fetch all members of a room
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;

    const { roomId } = await context.params;

    if (!roomId) {
      return NextResponse.json({ error: 'missingRoomId' }, { status: 400 });
    }

    const isMember = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: auth.user.id, roomId } },
    });
    if (!isMember && !auth.user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch room with members
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                bio: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: 'roomNotFound' }, { status: 404 });
    }

    return NextResponse.json({
      members: room.members,
      total: room.members.length,
    });
  } catch (error) {
    console.error('Fetch room members error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// DELETE /api/rooms/:roomId/members — leave room (or close DM)
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;

    const { roomId } = await context.params;
    if (!roomId) {
      return NextResponse.json({ error: 'missingRoomId' }, { status: 400 });
    }

    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: auth.user.id, roomId } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 404 });
    }

    // Remove membership
    await prisma.roomMember.delete({
      where: { userId_roomId: { userId: auth.user.id, roomId } },
    });

    // If room has no members left, delete it
    const remaining = await prisma.roomMember.count({ where: { roomId } });
    if (remaining === 0) {
      await prisma.message.deleteMany({ where: { roomId } });
      await prisma.room.delete({ where: { id: roomId } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Leave room error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
