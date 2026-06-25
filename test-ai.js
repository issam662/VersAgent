const fs = require('fs');
const code = fs.readFileSync('server/src/routes/ai.ts', 'utf8');
const sys = code.split('const systemContext = `')[1].split('`;')[0];

fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: 'hermes3',
        stream: false,
        messages: [
            { role: 'system', content: sys },
            { role: 'user', content: 'how many users have logged in today?' }
        ]
    })
})
.then(r => r.json())
.then(d => {
    console.log('--- RESPONSE ---');
    console.log(d.message.content);
})
.catch(console.error);
