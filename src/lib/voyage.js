const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
export const EMBEDDING_MODEL = 'voyage-3-lite'

/**
 * Genererer embedding(s) via Voyage AI REST API.
 * @param {string|string[]} input - Tekst(er) å embedde
 * @param {'query'|'document'} inputType - Type input for optimal retrieval
 * @returns {Promise<number[][]>} Array av embedding-vektorer
 */
export async function embed(input, inputType = 'document') {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY er ikke satt')

  const texts = Array.isArray(input) ? input : [input]

  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Voyage AI feil (${res.status}): ${error}`)
  }

  const data = await res.json()
  return data.data.map(d => d.embedding)
}
