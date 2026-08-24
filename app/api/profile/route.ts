import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userProfile } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const PROFILE_ID = 'default'; // single-user app: one fixed row

const EMPTY = { id: PROFILE_ID, name: '', email: '', bio: '' };

export async function GET() {
  try {
    const rows = await db.select().from(userProfile).where(eq(userProfile.id, PROFILE_ID)).limit(1);
    const row = rows[0];
    return NextResponse.json({ data: row ?? EMPTY });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name : '';
    const email = typeof body.email === 'string' ? body.email : '';
    const bio = typeof body.bio === 'string' ? body.bio : null;

    await db
      .insert(userProfile)
      .values({ id: PROFILE_ID, name, email, bio, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userProfile.id,
        set: { name, email, bio, updatedAt: new Date() },
      });

    const rows = await db.select().from(userProfile).where(eq(userProfile.id, PROFILE_ID)).limit(1);
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
