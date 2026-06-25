import { dbAll } from '../database/index.js';

export const aiToolSchemas = [
    {
        type: 'function',
        function: {
            name: 'run_sql_query',
            description: 'Run a read-only SQL SELECT query against the VersAgent database. You have full access to explore tables (e.g., machines, incidents, network_interfaces). Use standard MS SQL Server (T-SQL) syntax. Do not run destructive queries.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The exact SQL query to run. MUST be a SELECT statement.' }
                },
                required: ['query']
            }
        }
    }
];

export async function executeTool(name: string, args: any): Promise<any> {
    try {
        if (name === 'run_sql_query') {
            const query = args.query;
            if (!query) return { error: "No query provided." };

            // Strict Regex filter to prevent destructive commands
            const destructivePattern = /\b(UPDATE|DELETE|INSERT|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|CREATE|GRANT|REVOKE)\b/i;
            if (destructivePattern.test(query)) {
                console.warn(`[AI Tool] Blocked destructive query: ${query}`);
                return { error: "Error: Destructive commands are forbidden. Only SELECT queries are allowed." };
            }

            console.log(`[AI Tool] Executing SQL: ${query}`);
            const results = await dbAll(query, []);
            
            // Clean up unnamed columns (like from COUNT(*)) which come back as empty string keys
            const cleanResults = results.map(row => {
                const cleanRow: any = {};
                for (const [key, value] of Object.entries(row)) {
                    cleanRow[key === '' ? 'value' : key] = value;
                }
                return cleanRow;
            });
            
            // Limit results to prevent overwhelming the AI's context window
            return { count: cleanResults.length, data: cleanResults.slice(0, 30) };
        }
        
        return { error: `Tool ${name} not found or not implemented.` };
    } catch (err: any) {
        console.error(`[AI Tool Error] ${name}:`, err);
        return { error: `Database error while executing tool ${name}: ${err.message}` };
    }
}
