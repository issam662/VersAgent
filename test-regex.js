const content = 'Great! I\\\'ll proceed...\\n\\n```sql\r\nSELECT COUNT(*) FROM users WHERE [Last Login] >= CAST(GETDATE() AS DATE);\r\n```';
const sqlMatch = content.match(/(SELECT[\s\S]*?)(?:\n\n|$)/i);
console.log(sqlMatch ? sqlMatch[1].includes('`') : 'no match1');
const mdMatch = content.match(/```sql\r?\n([\s\S]*?)\r?\n```/i);
console.log(mdMatch ? 'mdMatch found' : 'mdMatch NOT found');
