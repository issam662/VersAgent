const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const sql = require('mssql');
require('dotenv').config({ path: __dirname + '/.env' });

const poolConfig = {
    server: process.env.DB_SERVER || 'EUMOOUJ-DB01',
    database: process.env.DB_NAME || 'IT_Applications',
    user: process.env.DB_USER || 'Issam_IT',
    password: process.env.DB_PASSWORD || 'issam123',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: true
    }
};

const server = new Server({
    name: "mssql-mcp",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

let pool;
async function getPool() {
    if (!pool) {
        pool = await sql.connect(poolConfig);
    }
    return pool;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_tables",
                description: "List all tables in the connected SQL Server database.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            },
            {
                name: "describe_table",
                description: "Get the schema for a specific table.",
                inputSchema: {
                    type: "object",
                    properties: {
                        tableName: { type: "string" }
                    },
                    required: ["tableName"]
                }
            },
            {
                name: "query_database",
                description: "Execute a read-only SELECT query against the database.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The SQL SELECT query to execute" }
                    },
                    required: ["query"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const p = await getPool();

    if (request.params.name === "list_tables") {
        try {
            const result = await p.request().query("SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
            return {
                content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true
            };
        }
    }

    if (request.params.name === "describe_table") {
        try {
            const tableName = request.params.arguments.tableName;
            const result = await p.request()
                .input('tableName', sql.NVarChar, tableName)
                .query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName");
            return {
                content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true
            };
        }
    }

    if (request.params.name === "query_database") {
        try {
            const query = request.params.arguments.query;
            const upperQuery = query.toUpperCase();
            
            // Basic safety check to prevent accidental modifications via the AI agent
            const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'EXEC'];
            for (const word of forbidden) {
                if (upperQuery.includes(word)) {
                    return {
                        content: [{ type: "text", text: `Error: Query blocked. Only read-only SELECT queries are allowed. Forbidden keyword found: ${word}` }],
                        isError: true
                    };
                }
            }

            const result = await p.request().query(query);
            return {
                content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error.message}` }],
                isError: true
            };
        }
    }

    return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true
    };
});

async function run() {
    try {
        await getPool(); // test connection
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (e) {
        console.error("Failed to start MCP server:", e);
        process.exit(1);
    }
}

run();
