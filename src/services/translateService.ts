import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiApiKey = process.env.GEMINI_API_KEY || '';

export type SupportedLang = 'vi' | 'en';

const LANG_NAME: Record<SupportedLang, string> = {
  vi: 'Vietnamese',
  en: 'English',
};

function getGeminiModel() {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

/**
 * Dịch một mảng text sang ngôn ngữ đích. Giữ nguyên thứ tự.
 * Không dịch các placeholder dạng {{var}} và các URL.
 */
export async function translateBatch(
  texts: string[],
  targetLang: SupportedLang
): Promise<string[]> {
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình');
  }
  if (texts.length === 0) return [];

  const model = getGeminiModel();
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

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error('Translation output length mismatch');
  }
  return parsed.map((v) => String(v));
}
