import OpenAI from "openai";
import type { Handler } from "@netlify/functions";
import { z } from "zod";

const BodySchema = z.object({
  type: z.enum(["daily", "custom"]),
  userContext: z.string().trim().min(1).max(400).optional(),
});

const instructions =
  "You write exactly one modern, grounded daily affirmation in 1-2 sentences (20-40 words). Avoid clichés, toxic positivity, medical/financial advice, and commands like 'must/should'. Return plain text only.";

export const handler: Handler = async (event) => {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid body", details: parsed.error.flatten() }),
      };
    }

    const { type, userContext } = parsed.data;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      instructions,
      max_output_tokens: 120,
      input: [
        {
          role: "user",
          content:
            type === "custom" && userContext
              ? `Context: ${userContext}\nWrite me an affirmation for today.`
              : "Write me an affirmation for today.",
        },
      ],
    } as any);

    const text =
      // @ts-ignore
      response.output_text?.trim?.() ||
      (Array.isArray((response as any).output) &&
        (response as any).output[0]?.content?.[0]?.text?.trim()) ||
      "";

    if (!text) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "No text generated" }) };
    }

    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 10 || clean.length > 300) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Low-quality generation" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text: clean }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Generation failed" }) };
  }
};
