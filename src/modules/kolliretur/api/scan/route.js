import { createClient } from '@supabase/supabase-js'
import { anthropic, MODELS } from '@/lib/anthropic'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
    try {
        const { searchParams } = new URL(request.url)
        const kolli_id = searchParams.get('kolli_id')

        if (!kolli_id) {
            return Response.json({ error: 'kolli_id is required' }, { status: 400 })
        }

        const formData = await request.formData()
        const file = formData.get('file')

        if (!file) {
            return Response.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const base64Image = buffer.toString('base64')
        const mimeType = file.type || 'image/jpeg'

        const prompt = `Analyser dette bildet av en etikett. Det er ofte litt uklart hva hvert felt er, men du skal KUN trekke ut følgende to ting:

1. Delenummer (I bildet ser det feks ut slik: "14004 82 98-01/6")
2. Ordrenummer (I bildet kan det feks stå "2662096-01", men du skal KUN hente ut tallene før bindestreken, altså "2662096")

Returner resultatet KUN som et gyldig JSON objekt, uten noe annet tekst.

Eksempel på output:
{"delenummer": "14004 82 98-01/6", "ordrenummer": "2662096"}`

        const response = await anthropic.messages.create({
            model: MODELS.chatbot,
            max_tokens: 256,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
                    { type: 'text', text: prompt }
                ]
            }]
        })

        const rawText = response.content[0].text
        // Parse JSON from response — handle potential markdown code blocks
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        const resultDict = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
        const delenummer = resultDict.delenummer || 'UNKNOWN'
        const ordrenummer = resultDict.ordrenummer || 'UNKNOWN'

        // Check for duplicate
        if (delenummer !== 'UNKNOWN' && ordrenummer !== 'UNKNOWN') {
            const { data: existingItems } = await supabase
                .from('kolli_items')
                .select('*')
                .eq('kolli_id', kolli_id)
                .eq('delenummer', delenummer)
                .eq('ordrenummer', ordrenummer)

            if (existingItems && existingItems.length > 0) {
                return Response.json({
                    success: true,
                    extracted: resultDict,
                    saved_item: existingItems[0],
                    is_duplicate: true
                })
            }
        }

        const { data, error } = await supabase
            .from('kolli_items')
            .insert([{ kolli_id, delenummer, ordrenummer, antall: 1 }])
            .select()

        if (error) throw error

        return Response.json({
            success: true,
            extracted: resultDict,
            saved_item: data[0],
            is_duplicate: false
        })

    } catch (error) {
        console.error('Error processing image:', error)
        return Response.json({ error: error.message }, { status: 500 })
    }
}
