// Vercel serverless: serve the radar data
import { readFileSync } from "node:fs";
import path from "node:path";

export default function handler(req, res) {
  try {
    const file = path.join(process.cwd(), "data", "opportunities.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    res.setHeader("content-type", "application/json");
    res.setHeader("access-control-allow-origin", "*");
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}