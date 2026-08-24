import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string;
    error?: string;
  }
}

// Extended JWT type for token callback
interface ExtendedJWT {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      const extToken = token as ExtendedJWT & typeof token;

      // Initial sign in
      if (account) {
        return {
          ...extToken,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // Token hasn't expired yet
      if (extToken.expiresAt && Date.now() < extToken.expiresAt * 1000) {
        return extToken;
      }

      // Token has expired, try to refresh
      if (extToken.refreshToken) {
        try {
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: 'refresh_token',
              refresh_token: extToken.refreshToken,
            }),
          });

          const tokens = await response.json();

          if (!response.ok) throw tokens;

          return {
            ...extToken,
            accessToken: tokens.access_token,
            expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
            refreshToken: tokens.refresh_token ?? extToken.refreshToken,
          };
        } catch (error) {
          console.error('Error refreshing access token', error);
          return { ...extToken, error: 'RefreshAccessTokenError' };
        }
      }

      return extToken;
    },
    async session({ session, token }) {
      const extToken = token as ExtendedJWT & typeof token;
      session.accessToken = extToken.accessToken;
      session.error = extToken.error;
      return session;
    },
  },
});
