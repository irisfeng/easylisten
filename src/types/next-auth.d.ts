import type { Session } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & Session['user'];
  }
}

declare module 'next/server' {
    interface NextRequest {
        auth?: Session | null
    }
} 