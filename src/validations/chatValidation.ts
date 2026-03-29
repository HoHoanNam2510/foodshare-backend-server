import { z } from 'zod';

// =============================================
// I. VALIDATION CHO USER / STORE
// =============================================

export const getOrCreateConversationSchema = z.object({
  receiverId: z.string().min(1, 'receiverId là bắt buộc'),
});

export type GetOrCreateConversationBody = z.infer<
  typeof getOrCreateConversationSchema
>;

export const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1, 'conversationId là bắt buộc'),
    text: z.string().optional(),
    imageUrl: z.string().optional(),
    location: z
      .object({
        latitude: z.number({ required_error: 'latitude là bắt buộc' }),
        longitude: z.number({ required_error: 'longitude là bắt buộc' }),
      })
      .optional(),
    relatedPostId: z.string().optional(),
  })
  .refine((data) => data.text || data.imageUrl || data.location, {
    message: 'Phải có ít nhất text, imageUrl, hoặc location',
  });

export type SendMessageBody = z.infer<typeof sendMessageSchema>;

// =============================================
// II. VALIDATION CHO ADMIN
// =============================================

export const adminGetConversationsSchema = z.object({
  participantId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type AdminGetConversationsQuery = z.infer<
  typeof adminGetConversationsSchema
>;
