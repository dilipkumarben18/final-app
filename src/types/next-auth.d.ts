import { PermissionMap } from '@/lib/permissions';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      role: 'MASTER' | 'WORKER';
    };
  }

  interface User {
    id: string;
    name: string;
    role: 'MASTER' | 'WORKER';
  }
}
