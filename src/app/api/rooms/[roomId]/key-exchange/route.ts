import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import { generateStrongKey } from '@/lib/hushCrypto';

const JWT_SECRET = process.env.JWT_SECRET || '';

function getUser(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string };
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId } = await params;

  const membership = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: user.id, roomId } },
  });
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const keyExchange = await prisma.keyExchange.findUnique({
    where: { roomId },
  });

  return NextResponse.json({ keyExchange: keyExchange || null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const user = getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId } = await params;
  const body = await req.json();
  const { action } = body;

  const membership = await prisma.roomMember.findUnique({
    where: { userId_roomId: { userId: user.id, roomId } },
  });
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const io = (globalThis as any).__felfelIo;

  if (action === 'request') {
    const existing = await prisma.keyExchange.findUnique({ where: { roomId } });
    if (existing) {
      return NextResponse.json({ keyExchange: existing });
    }
    const created = await prisma.keyExchange.create({
      data: {
        roomId,
        requesterId: user.id,
        status: 'PENDING',
      },
    });

    if (io) {
      io.to(`room:${roomId}`).emit('key_exchange:request', { roomId, requesterId: user.id });
    }

    return NextResponse.json({ keyExchange: created });
  }

  if (action === 'accept') {
    let keyToUse = body.key;
    if (!keyToUse || typeof keyToUse !== 'string' || keyToUse.length < 32) {
      keyToUse = generateStrongKey();
    }

    const updated = await prisma.keyExchange.upsert({
      where: { roomId },
      create: {
        roomId,
        requesterId: user.id,
        status: 'ACCEPTED',
        key: keyToUse,
      },
      update: {
        status: 'ACCEPTED',
        key: keyToUse,
      },
    });

    if (io) {
      io.to(`room:${roomId}`).emit('key_exchange:accept', { roomId, key: keyToUse });
    }

    return NextResponse.json({ keyExchange: updated });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
