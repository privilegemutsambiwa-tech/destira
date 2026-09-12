import { z } from 'zod';
import { insertProfileSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  profiles: {
    get: {
      method: 'GET' as const,
      path: '/api/profiles/:userId' as const,
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    me: {
      method: 'GET' as const,
      path: '/api/profiles/me' as const,
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    create: {
      method: 'POST' as const,
      path: '/api/profiles' as const,
      input: insertProfileSchema,
      responses: { 201: z.any(), 400: errorSchemas.validation },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/profiles/:userId' as const,
      input: insertProfileSchema.partial(),
      responses: { 200: z.any(), 404: errorSchemas.notFound },
    },
    generateTwin: {
      method: 'POST' as const,
      path: '/api/profiles/generate-twin' as const,
      input: z.object({ answers: z.any() }),
      responses: { 200: z.object({ twinPersona: z.string() }) },
    },
    discover: {
      method: 'GET' as const,
      path: '/api/profiles/discover' as const,
      responses: { 200: z.array(z.any()) },
    },
  },
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches' as const,
      responses: { 200: z.array(z.any()) },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches' as const,
      input: z.object({ targetId: z.string() }),
      responses: { 201: z.any() },
    },
    respond: {
      method: 'PUT' as const,
      path: '/api/matches/:id/respond' as const,
      input: z.object({ action: z.enum(["accept", "reject"]) }),
      responses: { 200: z.any() },
    },
  },
  interviews: {
    list: {
      method: 'GET' as const,
      path: '/api/interviews' as const,
      responses: { 200: z.array(z.any()) },
    },
    start: {
      method: 'POST' as const,
      path: '/api/interviews' as const,
      input: z.object({ targetId: z.string() }),
      responses: { 201: z.any() },
    },
    chat: {
      method: 'POST' as const,
      path: '/api/interviews/:id/chat' as const,
      input: z.object({ message: z.string() }),
      responses: { 200: z.object({ response: z.string() }) },
    },
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/messages/:matchId' as const,
      responses: { 200: z.array(z.any()) },
    },
    send: {
      method: 'POST' as const,
      path: '/api/messages/:matchId' as const,
      input: z.object({ content: z.string() }),
      responses: { 201: z.any() },
    },
  },
  groups: {
    list: {
      method: 'GET' as const,
      path: '/api/groups' as const,
      responses: { 200: z.array(z.any()) },
    },
    get: {
      method: 'GET' as const,
      path: '/api/groups/:id' as const,
      responses: { 200: z.any() },
    },
    join: {
      method: 'POST' as const,
      path: '/api/groups/:id/join' as const,
      responses: { 200: z.any() },
    },
    messages: {
      method: 'GET' as const,
      path: '/api/groups/:id/messages' as const,
      responses: { 200: z.array(z.any()) },
    },
    sendMessage: {
      method: 'POST' as const,
      path: '/api/groups/:id/messages' as const,
      input: z.object({ content: z.string() }),
      responses: { 201: z.any() },
    },
  },
  demo: {
    seed: {
      method: 'POST' as const,
      path: '/api/demo/seed' as const,
      responses: { 200: z.object({ message: z.string() }) },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
