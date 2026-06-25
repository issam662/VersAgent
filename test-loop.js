const fs = require('fs');

async function testLoop() {
    const code = fs.readFileSync('server/src/routes/ai.ts', 'utf8');
    const sys = code.split('const systemContext = `')[1].split('`;')[0];

    const db = await import('./server/dist/database/index.js');
    await db.initializeDatabase();
    const { executeTool } = await import('./server/dist/services/aiTools.js');

    let currentMessages = [
        { role: 'system', content: sys },
        { role: 'user', content: 'How many users have logged in today?' }
    ];

    let finalAnswerSent = false;
    for (let i = 0; i < 5; i++) {
        console.log(`\n--- ITERATION ${i + 1} ---`);
        const r = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'hermes3', stream: false, messages: currentMessages })
        });
        const d = await r.json();
        let content = d.message.content;
        console.log('AI OUTPUT:\n', content);

        let tool_calls = [];
        
        // Simulating ai.ts parsing
        let cleanForJson = content.replace(/```(json)?\n?/gi, '').replace(/```/g, '').trim();
        const match = content.match(/\{[\s\S]*"name"\s*:\s*"[^"]+"[\s\S]*\}/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                const args = parsed.parameters || parsed.arguments;
                if (parsed.name && args !== undefined) {
                    tool_calls.push({ function: { name: parsed.name, arguments: args } });
                    content = content.replace(match[0], '').trim();
                }
            } catch (e) {}
        }
        
        if (tool_calls.length === 0) {
            const sqlMatch = content.match(/```sql\n([\s\S]*?)\n```/i);
            if (sqlMatch && sqlMatch[1]) {
                const query = sqlMatch[1].trim();
                tool_calls.push({ function: { name: 'run_sql_query', arguments: { query } } });
            }
        }

        if (tool_calls.length === 0) {
            console.log('\nFINAL ANSWER:\n', content);
            finalAnswerSent = true;
            break;
        }

        currentMessages.push({ role: 'assistant', content: d.message.content });
        for (const tc of tool_calls) {
            console.log(`[EXEC TOOL] ${tc.function.name} ->`, tc.function.arguments);
            const res = await executeTool(tc.function.name, tc.function.arguments);
            console.log(`[TOOL RESULT]:`, res);
            currentMessages.push({ role: 'tool', content: JSON.stringify(res) });
        }
    }
    process.exit(0);
}

testLoop().catch(console.error);
