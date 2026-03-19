import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const MODELS = {
  promptGen: process.env.CLAUDE_MODEL_PROMPT_GEN || 'claude-sonnet-4-6',
  chatbot:   process.env.CLAUDE_CHAT_MODEL       || 'claude-haiku-4-5-20251001',
}
