import { NextResponse } from 'next/server';
import { pingN8n, pingWebhookAuth } from '@/lib/n8n/client';

/** Reports whether the configured n8n instance is reachable + auth OK (Fase A). */
export async function GET() {
  try {
    const health = await pingN8n();
    // Só vale testar auth se o host respondeu; senão deixamos authOk indefinido.
    if (health.reachable) {
      const auth = await pingWebhookAuth();
      health.authOk = auth.authOk;
      if (auth.error) health.error = health.error ?? auth.error;
    }
    return NextResponse.json({ data: health });
  } catch (error) {
    console.error('Error pinging n8n:', error);
    return NextResponse.json({ error: 'Failed to reach n8n' }, { status: 500 });
  }
}
