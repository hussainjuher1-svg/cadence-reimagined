import { createCadenceServer } from './app.mjs';

const port = Number(process.env.PORT || 4311);
const server = createCadenceServer({ port });
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`Cadence local development mode listening at http://127.0.0.1:${address.port}`);
  console.log(`Database: ${server.cadenceDbPath}`);
  console.log('Local development mode — accounts are stored in a database file on this computer. This is not production authentication.');
});
const shutdown = () => server.close(() => { server.cadenceDb.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
