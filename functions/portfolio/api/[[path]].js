const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders } });

const enc = new TextEncoder();
const cookieName = "adcypherbyte_admin";
function basePath(env) { return (env.BASE_PATH || "/portfolio").replace(/\/+$/, ""); }
function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : "";
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function makeSession(env) {
  const payload = btoa(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000, nonce: crypto.randomUUID() }));
  return payload + "." + await hmac(env.SESSION_SECRET, payload);
}
async function validSession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = cookieValue(request, cookieName);
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = await hmac(env.SESSION_SECRET, parts[0]);
  if (expected !== parts[1]) return false;
  try { return JSON.parse(atob(parts[0])).exp > Date.now(); } catch { return false; }
}
const cookie = (value, maxAge) => `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
async function bodyJson(request) { try { return await request.json(); } catch { return null; } }
function validUrl(value) {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const prefix = basePath(env);
  const apiPrefix = prefix + "/api";
  if (!path.startsWith(apiPrefix)) return json({ error: "Not found" }, 404);
  if (!env.DB) return json({ error: "Database binding DB is not configured." }, 500);
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Set ADMIN_PASSWORD and SESSION_SECRET in Pages settings." }, 500);
  const route = path.slice(apiPrefix.length) || "/";
  const method = request.method.toUpperCase();

  if (route === "/login" && method === "POST") {
    const body = await bodyJson(request);
    if (!body || typeof body.password !== "string") return json({ error: "Enter your password." }, 400);
    if (body.password !== env.ADMIN_PASSWORD) return json({ error: "Incorrect password." }, 401);
    const token = await makeSession(env);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(token, 8 * 60 * 60) });
  }
  if (route === "/logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
  }
  if (route === "/session" && method === "GET") {
    return validSession(request, env) ? json({ ok: true }) : json({ error: "Unauthorized" }, 401);
  }

  // Public read-only endpoint: visitors can view portfolio entries without logging in.
  if (route === "/projects" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT id,title,category,description,image_url,youtube_url,project_url,featured,created_at,updated_at FROM projects ORDER BY featured DESC, id DESC").all();
    return json(results || []);
  }

  if (!await validSession(request, env)) return json({ error: "Unauthorized. Please sign in again." }, 401);
  if (route === "/projects" && method === "POST") {
    const b = await bodyJson(request);
    if (!b || typeof b.title !== "string" || !b.title.trim()) return json({ error: "Project title is required." }, 400);
    if (b.title.length > 120 || (b.description || "").length > 1200) return json({ error: "Title or description is too long." }, 400);
    if (![b.image_url,b.youtube_url,b.project_url].every(validUrl)) return json({ error: "Links must be valid http or https URLs." }, 400);
    const result = await env.DB.prepare("INSERT INTO projects (title,category,description,image_url,youtube_url,project_url,featured,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
      .bind(b.title.trim(), String(b.category || "Project").slice(0,60), String(b.description || ""), String(b.image_url || ""), String(b.youtube_url || ""), String(b.project_url || ""), b.featured ? 1 : 0).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 201);
  }
  const match = route.match(/^\/projects\/(\d+)$/);
  if (match && method === "PUT") {
    const b = await bodyJson(request);
    if (!b || typeof b.title !== "string" || !b.title.trim()) return json({ error: "Project title is required." }, 400);
    if (b.title.length > 120 || (b.description || "").length > 1200) return json({ error: "Title or description is too long." }, 400);
    if (![b.image_url,b.youtube_url,b.project_url].every(validUrl)) return json({ error: "Links must be valid http or https URLs." }, 400);
    const result = await env.DB.prepare("UPDATE projects SET title=?,category=?,description=?,image_url=?,youtube_url=?,project_url=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(b.title.trim(), String(b.category || "Project").slice(0,60), String(b.description || ""), String(b.image_url || ""), String(b.youtube_url || ""), String(b.project_url || ""), b.featured ? 1 : 0, Number(match[1])).run();
    return result.meta?.changes ? json({ ok: true }) : json({ error: "Project not found." }, 404);
  }
  if (match && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(Number(match[1])).run();
    return result.meta?.changes ? json({ ok: true }) : json({ error: "Project not found." }, 404);
  }
  return json({ error: "Not found" }, 404);
}
