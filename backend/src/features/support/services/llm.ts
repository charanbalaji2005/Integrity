import { env } from "../../../config/env";

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Calls the configured LLM (Groq first, then local Ollama). Returns null when
 * no provider answers — callers must then fall back to deterministic,
 * documentation-based output rather than inventing a response.
 */
export async function callLLM(
	messages: ChatMessage[],
	opts: { json?: boolean; timeoutMs?: number } = {},
): Promise<string | null> {
	const timeoutMs = opts.timeoutMs ?? 15000;

	if (env.GROQ_API_KEY) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${env.GROQ_API_KEY}`,
				},
				body: JSON.stringify({
					model: env.GROQ_CHAT_MODEL,
					messages,
					temperature: 0.2,
					...(opts.json ? { response_format: { type: "json_object" } } : {}),
				}),
				signal: ctrl.signal,
			});
			if (res.ok) {
				const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
				const content = data.choices?.[0]?.message?.content;
				if (content?.trim()) return content.trim();
			} else {
				console.warn(`[SupportAI] Groq returned ${res.status}`);
			}
		} catch (err) {
			console.warn("[SupportAI] Groq call failed:", err instanceof Error ? err.message : err);
		} finally {
			clearTimeout(timer);
		}
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 8000));
	try {
		const res = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: env.OLLAMA_CHAT_MODEL,
				messages,
				stream: false,
				...(opts.json ? { format: "json" } : {}),
			}),
			signal: ctrl.signal,
		});
		if (res.ok) {
			const data = (await res.json()) as { message?: { content?: string } };
			if (data.message?.content?.trim()) return data.message.content.trim();
		}
	} catch {
		// no local model
	} finally {
		clearTimeout(timer);
	}
	return null;
}

export function parseJsonLoose<T>(raw: string | null): T | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		const m = raw.match(/\{[\s\S]*\}/);
		if (!m) return null;
		try {
			return JSON.parse(m[0]) as T;
		} catch {
			return null;
		}
	}
}
