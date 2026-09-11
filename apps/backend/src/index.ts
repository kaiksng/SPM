import { createApp } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

createApp().listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
