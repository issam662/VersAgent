import 'dotenv/config';
import { initializeDatabase } from './src/database/index.js';
import machineRoutes from './src/routes/machines.js';

async function testRoute() {
    await initializeDatabase();

    const req = {
        query: {
            page: '1',
            limit: '20'
        },
        user: { id: 'test' } // mock user
    } as any;

    const res = {
        json: (data: any) => {
            console.log('Response JSON:', JSON.stringify(data, null, 2));
        }
    } as any;

    console.log('--- Testing /api/machines ---');
    // Find the GET / route
    const getRoute = (machineRoutes as any).stack.find((layer: any) =>
        layer.route && layer.route.path === '/' && layer.route.methods.get
    );

    if (getRoute) {
        // We might need to skip the authenticate middleware if it's there
        // The handler is usually the last one in the stack
        const handler = getRoute.route.stack[getRoute.route.stack.length - 1].handle;
        await handler(req, res, () => { });
    } else {
        console.error('GET / route not found in machineRoutes');
    }

    process.exit(0);
}

testRoute().catch(err => {
    console.error(err);
    process.exit(1);
});
