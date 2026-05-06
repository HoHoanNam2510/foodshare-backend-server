import OpenAI from 'openai';

const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
  : null;

export type SupportedLang = 'vi' | 'en';

const LANG_NAME: Record<SupportedLang, string> = {
  vi: 'Vietnamese',
  en: 'English',
};

export async function translateBatch(
  texts: string[],
  targetLang: SupportedLang
): Promise<string[]> {
  if (!groqClient) {
    throw new Error('GROQ_API_KEY chưa được cấu hình');
  }
  if (texts.length === 0) return [];

  const numbered = texts
    .map((t, i) => `[${i}] ${t.replace(/\r?\n/g, ' ')}`)
    .join('\n');

  const prompt = `You are a translation service. Translate each numbered line below into ${LANG_NAME[targetLang]}.
Rules:
- Preserve proper nouns, brand names, product names (e.g., FoodShare, Goong, MoMo).
- Do NOT translate text inside {{ }} — keep placeholders exactly as-is.
- Keep URLs unchanged.
- Keep the output concise and natural for a mobile app UI.
- Output ONLY a JSON array of strings in the same order. No markdown, no explanation.

Input:
${numbered}

Output JSON:`;

  const response = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
    temperature: 0.1,
  });

  const raw = (response.choices[0].message.content || '').trim();
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error('Translation output length mismatch');
  }
  return parsed.map((v) => String(v));
}
