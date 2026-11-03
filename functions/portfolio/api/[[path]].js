const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });

const enc = new TextEncoder();

function basePath(env) {
  return (env.BASE_PATH || "/portfolio").replace(/\/+$/, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function accessDomain(env) {
  let domain = (env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  if (!domain) return "";
  if (!domain.startsWith("https://")) domain = "https://" + domain;
  return domain.replace(/\/+$/, "");
}

async function validAccess(request, env) {
  try {
    if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_TEAM_DOMAIN) return false;

    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[0]))
    );

    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(parts[1]))
    );

    if (header.alg !== "RS256" || !header.kid) return false;

    const domain = accessDomain(env);
    const issuer = domain;

    if (claims.iss !== issuer) return false;
    if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return false;
    if (claims.nbf && claims.nbf > Math.floor(Date.now() / 1000)) return false;

    const audiences = Array.isArray(claims.aud)
      ? claims.aud
      : [claims.aud];

    if (!audiences.includes(env.CF_ACCESS_AUD)) return false;

    const response = await fetch(domain + "/cdn-cgi/access/certs");
    if (!response.ok) return false;

    const certificates = await response.json();
    const jwk = certificates.keys?.find(key => key.kid === header.kid);

    if (!jwk || jwk.kty !== "RSA") return false;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      base64UrlDecode(parts[2]),
      enc.encode(parts[0] + "." + parts[1])
    );
  } catch (error) {
    return false;
  }
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function validProject(b) {
  return b &&
    typeof b.title === "string" &&
    b.title.trim() &&
    b.title.length <= 120 &&
    String(b.description || "").length <= 1200 &&
    [b.image_url, b.youtube_url, b.project_url].every(validUrl);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const prefix = basePath(env);
  const apiPrefix = prefix + "/api";

  if (!path.startsWith(apiPrefix)) {
    return json({ error: "Not found" }, 404);
  }

  if (!env.DB) {
    return json({ error: "Database binding DB is not configured." }, 500);
  }

  const route = path.slice(apiPrefix.length) || "/";
  const method = request.method.toUpperCase();

  // Public read-only endpoint.
  // Visitors can view portfolio projects without signing in.
  if (route === "/projects" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id,title,category,description,image_url,youtube_url,project_url,featured,created_at,updated_at FROM projects ORDER BY featured DESC, id DESC"
    ).all();

    return json(results || []);
  }

  // All admin operations require a valid Cloudflare Access JWT.
  if (route === "/admin" || route.startsWith("/admin/")) {
    const authenticated = await validAccess(request, env);

    if (!authenticated) {
      return json(
        { error: "Cloudflare Access authentication required." },
        403
      );
    }

    if (route === "/admin/session" && method === "GET") {
      return json({ ok: true });
    }

    if (route === "/admin/projects" && method === "POST") {
      const b = await bodyJson(request);

      if (!validProject(b)) {
        return json(
          { error: "Check the project title, description and links." },
          400
        );
      }

      const result = await env.DB.prepare(
        "INSERT INTO projects (title,category,description,image_url,youtube_url,project_url,featured,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)"
      ).bind(
        b.title.trim(),
        String(b.category || "Project").slice(0, 60),
        String(b.description || ""),
        String(b.image_url || ""),
        String(b.youtube_url || ""),
        String(b.project_url || ""),
        b.featured ? 1 : 0
      ).run();

      return json(
        { ok: true, id: result.meta?.last_row_id },
        201
      );
    }

    const match = route.match(/^\/admin\/projects\/(\d+)$/);

    if (match && method === "PUT") {
      const b = await bodyJson(request);

      if (!validProject(b)) {
        return json(
          { error: "Check the project title, description and links." },
          400
        );
      }

      const result = await env.DB.prepare(
        "UPDATE projects SET title=?,category=?,description=?,image_url=?,youtube_url=?,project_url=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(
        b.title.trim(),
        String(b.category || "Project").slice(0, 60),
        String(b.description || ""),
        String(b.image_url || ""),
        String(b.youtube_url || ""),
        String(b.project_url || ""),
        b.featured ? 1 : 0,
        Number(match[1])
      ).run();

      return result.meta?.changes
        ? json({ ok: true })
        : json({ error: "Project not found." }, 404);
    }

    if (match && method === "DELETE") {
      const result = await env.DB.prepare(
        "DELETE FROM projects WHERE id=?"
      ).bind(Number(match[1])).run();

      return result.meta?.changes
        ? json({ ok: true })
        : json({ error: "Project not found." }, 404);
    }
  }

  return json({ error: "Not found" }, 404);
}
