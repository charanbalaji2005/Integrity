import { createServer } from "vite";

async function start() {
  try {
    const server = await createServer({
      server: {
        port: 5173,
        strictPort: true,
        host: "0.0.0.0",
      },
    });
    await server.listen();
    server.printUrls();
    setInterval(() => {}, 1000 * 60 * 60);
  } catch (err) {
    console.error("Vite server error:", err);
    process.exit(1);
  }
}

start();
