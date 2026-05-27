import { test } from 'vitest';

test('inspect environment', () => {
    console.log('process.execArgv:', process.execArgv);
    console.log('process.argv:', process.argv);
});
