import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url, title, description } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const systemPrompt = "You are a JSON-only generator. Output pure JSON with no explanation."
    
    const userPrompt = `Analyze this bookmark and generate relevant tags and category:

URL: ${url}
Title: ${title || 'N/A'}
Description: ${description || 'N/A'}

Generate a JSON object with:
- tags: array of 2-3 concise, relevant tags (max 2 words each)
- category: single most relevant category

Examples:
- For a React tutorial: {"tags": ["react", "tutorial", "javascript"], "category": "Development"}
- For a recipe blog: {"tags": ["recipe", "cooking", "food"], "category": "Lifestyle"}
- For a news article: {"tags": ["news", "current-events"], "category": "News"}

Focus on the main topic, technology, or domain of the bookmark.`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'BookmarkManager',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-r1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const aiContent = data.choices[0]?.message?.content

    if (!aiContent) {
      throw new Error('No content received from AI')
    }

    // Extract JSON from the response (handle potential markdown formatting)
    let jsonContent = aiContent
    if (aiContent.includes('```json')) {
      const match = aiContent.match(/```json\s*([\s\S]*?)\s*```/)
      if (match) {
        jsonContent = match[1]
      }
    }

    const result = JSON.parse(jsonContent.trim())

    // Validate the response structure
    if (!result.tags || !Array.isArray(result.tags) || !result.category) {
      throw new Error('Invalid AI response structure')
    }

    return NextResponse.json({
      tags: result.tags.slice(0, 3), // Ensure max 3 tags
      category: result.category,
    })
  } catch (error) {
    console.error('AI tags generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate AI tags' },
      { status: 500 }
    )
  }
} 