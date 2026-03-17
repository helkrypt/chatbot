import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODELS = {
  promptGen: process.env.CLAUDE_MODEL_PROMPT_GEN || 'claude-opus-4-5-20251101',
  chatbot:   process.env.CLAUDE_MODEL_CHATBOT    || 'claude-haiku-4-5-20251001',
}
