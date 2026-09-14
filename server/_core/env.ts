/**
 * Server-side environment. Client code must never import this module.
 * All credentials stay on the server.
 */
export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  port: parseInt(process.env.PORT || "3000", 10),

  /** Secret used to sign session JWTs. Required in production. */
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Object storage for original documents: "local" (filesystem) or "s3".
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  storageDir: process.env.STORAGE_DIR ?? "storage",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "",
  s3Prefix: process.env.S3_PREFIX ?? "triage",

  // OCR: "auto" (Textract when AWS credentials exist, else demo),
  // "demo", or "textract".
  ocrProvider: (process.env.OCR_PROVIDER ?? "auto") as "auto" | "demo" | "textract",

  // Agent extraction engine: "deterministic" (no external model) or
  // "strands" (Strands Agents SDK with a configured model provider).
  agentProvider: (process.env.AGENT_PROVIDER ?? "deterministic") as
    | "deterministic"
    | "strands",
  modelId: process.env.MODEL_ID ?? "",
  // Strands model provider: "bedrock" (AWS credential chain) or "openai"
  // (any OpenAI-compatible endpoint, including local ones).
  strandsModelProvider: (process.env.STRANDS_MODEL_PROVIDER ?? "bedrock") as
    | "bedrock"
    | "openai",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
} as const;
