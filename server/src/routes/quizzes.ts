/**
 * Quiz routes.
 *
 * Generate: builds a question set only from the curated, validated question
 * bank (or a validated provider response — the curated bank is always the
 * fallback). Grade: deterministic backend grading of MC and numerical
 * questions; returns per-question results with rationales.
 *
 * Generated quizzes (with their answer keys) live in a short-lived
 * in-memory store keyed by quizId, with a TTL. This is per-request working
 * state, not durable storage — no database. If the store is cold (e.g.
 * server restarted between generate and grade), grading fails gracefully
 * with a clear error.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { quizGenerateRequestSchema, quizGradeRequestSchema } from "../schemas/index.js";
import { getQuizQuestions } from "../data/quiz-bank.js";
import { getTopic } from "../data/topics.js";
import type { QuizQuestion, ValidatedQuiz } from "../../../shared/contract.js";
import { getQuiz, storeQuiz } from "../services/quizzes/store.js";

export const quizzesRouter = Router();

quizzesRouter.post("/api/quizzes/generate", (req, res, next) => {
  try {
    const body = quizGenerateRequestSchema.parse(req.body);
    const topicId = body.topicId ?? "polynomial-reductions";
    const topic = getTopic(topicId);
    if (!topic) {
      res.status(404).json({
        error: { code: "topic_not_found", message: `No topic with id "${topicId}".` },
      });
      return;
    }
    const pool = getQuizQuestions(topicId);
    const count = Math.min(body.count ?? 5, pool.length);
    // Deterministic-ish selection: shuffle with a simple LCG seeded by time,
    // then take the first `count`. Questions keep their curated answer keys.
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const questions: QuizQuestion[] = shuffled.slice(0, count);
    const quiz: ValidatedQuiz = {
      id: `quiz-${randomUUID()}`,
      topicId,
      title: `Practice quiz — ${topic.title}`,
      questions,
    };
    storeQuiz(quiz);
    // The quiz block sent to the client intentionally OMITS answer keys,
    // rationales, and hints — grading happens on the backend.
    res.json({
      quiz: {
        id: quiz.id,
        topicId: quiz.topicId,
        title: quiz.title,
        questions: questions.map(({ answer: _a, rationale: _r, hint: _h, ...q }) => q),
      },
    });
  } catch (err) {
    next(err);
  }
});

quizzesRouter.post("/api/quizzes/grade", (req, res, next) => {
  try {
    const body = quizGradeRequestSchema.parse(req.body);
    const quiz = getQuiz(body.quizId);
    if (!quiz) {
      res.status(410).json({
        error: {
          code: "quiz_expired",
          message: "This quiz session has expired (or the server restarted). Please generate a new quiz.",
        },
      });
      return;
    }
    const results = quiz.questions.map((q) => {
      const given = body.answers[q.id] ?? null;
      const correct = given !== null && given === q.answer;
      return {
        questionId: q.id,
        correct,
        given,
        answer: q.answer,
        rationale: q.rationale,
        hint: q.hint,
      };
    });
    const score = results.filter((r) => r.correct).length;
    res.json({
      quizId: body.quizId,
      score,
      total: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
});
