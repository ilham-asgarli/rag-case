import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

export const getAnthropic = (): Anthropic => {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.");
  }

  client = new Anthropic({ apiKey });
  return client;
};
