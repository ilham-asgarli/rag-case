import { MODELS } from "../config";
import { getAnthropic } from "../providers/anthropic";

const SYSTEM = `You rewrite a follow-up question into a standalone search query.

Rules:
- Resolve pronouns and references using the conversation ("it", "that one", "the same doc").
- Keep the user's own domain terms and any exact figures, identifiers, or version numbers. They matter for keyword matching.
- Output only the rewritten query. No preamble, no quotes, no explanation.
- If the question already stands alone, output it unchanged.`;

/**
 * Folds conversation history into a self-contained query.
 *
 * Only runs for follow-ups: a first question is already standalone, and paying
 * a model round trip to echo it back would add latency for nothing.
 *
 * A failure here is non-fatal — searching with the original question is a
 * worse query, not a broken one, so the caller falls back rather than erroring.
 */
export const rewriteQuery = async (
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string | null> => {
  if (history.length === 0) return null;

  const transcript = history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");

  try {
    const response = await getAnthropic().messages.create({
      model: MODELS.rewrite,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Conversation so far:\n${transcript}\n\nFollow-up question: ${question}\n\nStandalone search query:`,
        },
      ],
    });

    const text = response.content
      .filter(
        (block): block is { type: "text"; text: string; citations: null } => block.type === "text",
      )
      .map((block) => block.text)
      .join("")
      .trim();

    if (text.length === 0 || text === question) return null;
    return text;
  } catch (error) {
    console.warn("Query rewrite failed, using the original question:", error);
    return null;
  }
};
