import { z } from 'zod';
import { insertProfileSchema, profiles, matches, interviews, groups } from './schema';

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
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/profiles/me' as const,
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/profiles' as const,
      input: insertProfileSchema,
      responses: {
        201: z.custom<typeof profiles.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/profiles/:userId' as const,
      input: insertProfileSchema.partial(),
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    generateTwin: {
        method: 'POST' as const,
        path: '/api/profiles/generate-twin' as const,
        input: z.object({ answers: z.any() }), // Answers from onboarding
        responses: {
            200: z.object({ twinPersona: z.string() }),
        }
    }
  },
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches' as const,
      responses: {
        200: z.array(z.custom<typeof matches.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches' as const,
      input: z.object({ targetId: z.string() }),
      responses: {
        201: z.custom<typeof matches.$inferSelect>(),
      },
    },
  },
  interviews: {
    list: {
        method: 'GET' as const,
        path: '/api/interviews' as const,
        responses: {
            200: z.array(z.custom<typeof interviews.$inferSelect>()),
        }
    },
    start: {
        method: 'POST' as const,
        path: '/api/interviews' as const,
        input: z.object({ targetId: z.string() }),
        responses: {
            201: z.custom<typeof interviews.$inferSelect>(),
        }
    },
    chat: {
        method: 'POST' as const,
        path: '/api/interviews/:id/chat' as const,
        input: z.object({ message: z.string() }),
        responses: {
            200: z.object({ response: z.string() }),
        }
    }
  },
  groups: {
      list: {
          method: 'GET' as const,
          path: '/api/groups' as const,
          responses: {
              200: z.array(z.custom<typeof groups.$inferSelect>()),
          }
      }
  }
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
