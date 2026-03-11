import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const config = {
    api: { bodyParser: { sizeLimit: '10mb' } }
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

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

        const prompt = `
        Analyser dette bildet av en etikett. Det er ofte litt uklart hva hvert felt er, men du skal KUN trekke ut følgende to ting:
        
        1. Delenummer (I bildet ser det feks ut slik: "14004 82 98-01/6")
        2. Ordrenummer (I bildet kan det feks stå "2662096-01", men du skal KUN hente ut tallene før bindestreken, altså "2662096")
        
        Returner resultatet KUN som et gyldig JSON objekt.
        
        Eksempel på output:
        {
          "delenummer": "14004 82 98-01/6",
          "ordrenummer": "2662096"
        }
        `

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            response_format: { type: 'json_object' }
        })

        const resultDict = JSON.parse(response.choices[0].message.content)
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

        // Save to database
        const { data, error } = await supabase
            .from('kolli_items')
            .insert([{
                kolli_id,
                delenummer,
                ordrenummer,
                antall: 1
            }])
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
