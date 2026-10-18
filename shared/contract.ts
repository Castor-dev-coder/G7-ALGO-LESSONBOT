/**
 * Shared API contract between the AlgoTutor AI client and server.
 *
 * This module is the single source of truth for the chat block schema,
 * topic/lesson types, solver result types, and API envelopes. Both the
 * Vite client and the Express server import from here — do not duplicate
 * these types on either side.
 */

// ---------------------------------------------------------------------------
// Learning levels
// ---------------------------------------------------------------------------

export const LEARNING_LEVELS = ["beginner", "intermediate", "formal"] as const;
export type LearningLevel = (typeof LEARNING_LEVELS)[number];

// ---------------------------------------------------------------------------
// Chat blocks (rendered inside assistant turns)
// ---------------------------------------------------------------------------

export type GraphNodeState = "default" | "active" | "selected" | "covered" | "uncovered" | "cut" | "side_a" | "side_b";
export type GraphEdgeState = "default" | "active" | "covered" | "uncovered" | "cut" | "uncut";

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: GraphNodeState;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  state: GraphEdgeState;
  caption?: string;
}

export type GraphLayout = "circular" | "linear" | "hierarchical" | "grid";
export type EdgeType = "default" | "straight" | "step" | "smoothstep" | "bezier";

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  directed?: boolean;
  layout?: GraphLayout;
  edgeType?: EdgeType;
}

export interface TableColumn {
  key: string;
  header: string;
}

export type TableRow = Record<string, string | number>;

export interface ChartDatum {
  label: string;
  value: number;
  /** Accessible description of what this datum means. */
  description?: string;
}

export interface ChartData {
  /** Human-readable unit/definition of the value axis, e.g. "cut edges". */
  valueUnit: string;
  data: ChartDatum[];
}

export interface TraceStep {
  step: number;
  title: string;
  description: string;
  /** Node/edge ids highlighted at this step. */
  highlightNodes?: string[];
  highlightEdges?: string[];
  /** Full graph snapshot at this step (states applied to the base graph). */
  graph?: GraphData;
  /** Optional structured table shown beside the step explanation. */
  table?: { columns: TableColumn[]; rows: TableRow[]; caption?: string };
}

export interface AlgorithmTrace {
  algorithmId: string;
  algorithmName: string;
  title: string;
  steps: TraceStep[];
  result: Record<string, unknown>;
  complexity: { time: string; space: string };
  /** Guarantee/probability statement computed by the solver, not by the AI. */
  guarantee?: string;
  /** Present when the algorithm uses randomness (seedable teaching mode). */
  seed?: number;
  warnings?: string[];
}

export type QuizDifficulty = "easy" | "medium" | "hard";

export interface QuizQuestion {
  id: string;
  prompt: string;
  kind: "multiple_choice" | "numerical";
  choices?: string[];
  /** Correct answer: choice index for MC, numeric value for numerical. */
  answer: number;
  rationale: string;
  difficulty: QuizDifficulty;
  hint: string;
  /** Lesson objective this question checks. */
  objective: string;
}

export interface ValidatedQuiz {
  id: string;
  topicId: string;
  title: string;
  questions: QuizQuestion[];
}

export type CalloutVariant = "info" | "warning" | "success";

export interface SourceReference {
  title: string;
  url?: string;
  note?: string;
}

export type ChatBlock =
  | { type: "text"; markdown: string }
  | { type: "math"; latex: string; displayMode?: boolean }
  | { type: "callout"; variant: CalloutVariant; title?: string; markdown: string }
  | { type: "graph"; graphId: string; data: GraphData; caption: string }
  | { type: "table"; columns: TableColumn[]; rows: TableRow[]; caption?: string }
  | { type: "chart"; chartType: "line" | "bar"; data: ChartData; caption: string }
  | { type: "algorithm_trace"; trace: AlgorithmTrace }
  | { type: "quiz"; quiz: ValidatedQuiz }
  | { type: "source_reference"; ref: SourceReference };

// ---------------------------------------------------------------------------
// Topics / curriculum
// ---------------------------------------------------------------------------

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface Misconception {
  myth: string;
  correction: string;
}

export interface TopicSummary {
  slug: string;
  title: string;
  description: string;
}

export interface TopicDetail extends TopicSummary {
  objectives: string[];
  prerequisites: string[];
  readinessQuestions: string[];
  intuition: string;
  formalStatement: string;
  keyTerms: KeyTerm[];
  notation: { symbol: string; meaning: string }[];
  workedExample: {
    title: string;
    input: string;
    steps: string[];
    result: string;
  };
  visualization: {
    kind: "graph" | "table" | "chart" | "none";
    description: string;
  };
  analysis: string;
  misconceptions: Misconception[];
  summary: string;
  furtherPractice: string[];
  relatedTopics: string[];
  references: { title: string; url?: string; note?: string }[];
}

// ---------------------------------------------------------------------------
// Solver results
// ---------------------------------------------------------------------------

export interface SolverResult {
  algorithmId: string;
  algorithmName: string;
  topicId: string;
  input: Record<string, unknown>;
  steps: TraceStep[];
  result: Record<string, unknown>;
  complexity: { time: string; space: string };
  guarantee?: string;
  seed?: number;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ChatRequest {
  message: string;
  topicId?: string;
  level: LearningLevel;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface ChatResponse {
  blocks: ChatBlock[];
  mode: "ai" | "curated_fallback";
  topicId: string | null;
  level: LearningLevel;
  /** True when the request asked for a computed example and the solver ran. */
  computed: boolean;
  /** Effective topic for THIS turn (may switch from the user-selected one). */
  effectiveTopicId?: string | null;
  /** Action ids the producing provider can honor on the next turn. */
  actions?: string[];
}

/**
 * Contextual follow-up actions (ids -> UI prompt). The server decides which
 * ids are available per response; the client renders the matching subset.
 */
export const TUTOR_ACTIONS: Record<string, { label: string; prompt: string }> = {
  explain_simpler: { label: "Explain more simply", prompt: "Explain that more simply" },
  formal_proof: { label: "Show formal proof", prompt: "Show me the formal proof for the current topic" },
  another_example: { label: "Give another example", prompt: "Give me another example for the current topic" },
  quiz: { label: "Generate a practice question", prompt: "Generate a practice question on this" },
  compare: { label: "Compare approaches", prompt: "Now compare that with another approach from the supported topics" },
};

export interface SolveRequest {
  algorithmId: string;
  input: Record<string, unknown>;
}

export interface QuizGenerateRequest {
  topicId?: string;
  count?: number;
}

export interface QuizGradeRequest {
  quizId: string;
  answers: Record<string, number>;
}

export interface QuizGradeResponse {
  quizId: string;
  score: number;
  total: number;
  results: {
    questionId: string;
    correct: boolean;
    given: number | null;
    answer: number;
    rationale: string;
    hint: string;
  }[];
}

export interface HealthResponse {
  status: "ok";
  ai: { provider: string; enabled: boolean };
  time: string;
}
