import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userProfile } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const PROFILE_ID = 'default'; // single-user app: one fixed row

const DEFAULT_PROFILE = {
  id: PROFILE_ID,
  name: 'Fabio Marques',
  email: 'fabio.marques@ehsbrasil.com',
  bio: 'Atuação em segurança do trabalho com foco em prevenção de eventos graves, leitura de energia e controles críticos. Trabalho com liderança de primeira linha e com a diferença entre cumprir norma e controlar risco.',
};

export async function GET() {
  try {
    const rows = await db.select().from(userProfile).where(eq(userProfile.id, PROFILE_ID)).limit(1);
    const row = rows[0];
    return NextResponse.json({
      data: {
        ...(row ?? DEFAULT_PROFILE),
        name: row?.name?.trim() || DEFAULT_PROFILE.name,
        email: row?.email?.trim() || DEFAULT_PROFILE.email,
        bio: row?.bio?.trim() || DEFAULT_PROFILE.bio,
      },
    });
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
    const saved = rows[0];
    return NextResponse.json({
      data: {
        ...(saved ?? DEFAULT_PROFILE),
        name: saved?.name?.trim() || DEFAULT_PROFILE.name,
        email: saved?.email?.trim() || DEFAULT_PROFILE.email,
        bio: saved?.bio?.trim() || DEFAULT_PROFILE.bio,
      },
    });
  } catch (error) {
    console.error('Error saving profile:', error);
    return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
  }
}
