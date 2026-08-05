import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/routeAuth';
import { prisma } from '@/lib/prisma';

// GET /api/settings — fetch user settings
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;

    const settings = await prisma.userSettings.findUnique({
      where: { userId: auth.user.id },
    });

    return NextResponse.json({ settings: settings || null });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// PUT /api/settings — update user settings
export async function PUT(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();

    const data: any = {};

    if (body.notifications !== undefined) data.notifications = body.notifications;
    if (body.sound !== undefined) data.sound = body.sound;
    if (body.preview !== undefined) data.preview = body.preview;
    if (body.quietHoursEnabled !== undefined) data.quietHoursEnabled = body.quietHoursEnabled;
    if (body.quietHoursStart !== undefined) data.quietHoursStart = body.quietHoursStart;
    if (body.quietHoursEnd !== undefined) data.quietHoursEnd = body.quietHoursEnd;
    if (body.theme !== undefined) data.theme = body.theme;
    if (body.accentColor !== undefined) data.accentColor = body.accentColor;
    if (body.fontSize !== undefined) data.fontSize = body.fontSize;
    if (body.bubbleStyle !== undefined) data.bubbleStyle = body.bubbleStyle;
    if (body.readReceipts !== undefined) data.readReceipts = body.readReceipts;
    if (body.lastSeen !== undefined) data.lastSeen = body.lastSeen;
    if (body.screenLock !== undefined) data.screenLock = body.screenLock;
    if (body.autoDownload !== undefined) data.autoDownload = body.autoDownload;
    if (body.autoDownloadWiFi !== undefined) data.autoDownloadWiFi = body.autoDownloadWiFi;
    if (body.imageQuality !== undefined) data.imageQuality = body.imageQuality;
    if (body.enterToSend !== undefined) data.enterToSend = body.enterToSend;
    if (body.chatBackup !== undefined) data.chatBackup = body.chatBackup;
    if (body.clearCache !== undefined) data.clearCache = body.clearCache;

    const upserted = await prisma.userSettings.upsert({
      where: { userId: auth.user.id },
      update: data,
      create: { userId: auth.user.id, ...data },
    });

    return NextResponse.json({ settings: upserted });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
