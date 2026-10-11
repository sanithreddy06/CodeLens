process.env.NODE_ENV = 'production';
require('./index').start().catch(error => { console.error(error.message); process.exitCode = 1; });
