/**
 * Zod validation schemas for every API request. All inbound data is validated;
 * nothing reaches the services unvalidated.
 */
import { z } from "zod";
import { LEARNING_LEVELS } from "../../../shared/contract.js";

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "message must not be empty").max(2000, "message is too long (max 2000 characters)"),
  topicId: z.string().max(80).optional(),
  level: z.enum(LEARNING_LEVELS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20, "history is too long (max 20 messages)")
    .optional(),
});

export const solveRequestSchema = z.object({
  algorithmId: z.string().min(1).max(80),
  input: z.record(z.string(), z.unknown()),
});

export const quizGenerateRequestSchema = z.object({
  topicId: z.string().max(80).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

export const quizGradeRequestSchema = z.object({
  quizId: z.string().min(1).max(120),
  answers: z.record(z.string(), z.number().int().min(0)),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type SolveRequestInput = z.infer<typeof solveRequestSchema>;
export type QuizGenerateRequestInput = z.infer<typeof quizGenerateRequestSchema>;
export type QuizGradeRequestInput = z.infer<typeof quizGradeRequestSchema>;
