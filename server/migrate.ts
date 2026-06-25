import { dbRun } from './src/database/index';
(async () => {
    try {
        await dbRun('ALTER TABLE machines ADD block_reason NVARCHAR(MAX) NULL;');
        console.log('ALTER TABLE SUCCESS');
    } catch (e) {
        console.log('ALTER TABLE ERROR:', e.message);
    }
    process.exit(0);
})();
