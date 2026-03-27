import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');

/**
 * Generer embeddings for en eller flere tekster.
 * Drop-in erstatning for Voyage AI embed()-funksjonen.
 *
 * @param {string | string[]} input - Tekst eller array av tekster
 * @param {'query' | 'document'} _inputType - Ignorert (Voyage AI-spesifikt, ikke brukt av OpenAI)
 * @returns {Promise<number[][]>} Array av embedding-vektorer
 */
export async function embed(input, _inputType) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY er ikke satt');

  const texts = Array.isArray(input) ? input : [input];

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data.map((item) => item.embedding);
}

/**
 * Generer embedding for én enkelt tekst.
 *
 * @param {string} text
 * @returns {Promise<number[]>} Embedding-vektor
 */
export async function embedSingle(text) {
  const results = await embed([text]);
  return results[0];
}
