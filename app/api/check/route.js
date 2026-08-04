import { NextResponse } from "next/server";
import tls from "node:tls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_DOMAINS = 50;
const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 9000;
const SSL_TIMEOUT_MS = 8000;

function normalizeDomain(raw) {
  if (!raw) return "";
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0];
  d = d.split(":")[0];
  d = d.replace(/^www\./, "");
  return d;
}

function isLikelyValidDomain(d) {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(d);
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function formatAge(fromDate, toDate) {
  let years = toDate.getFullYear() - fromDate.getFullYear();
  let months = toDate.getMonth() - fromDate.getMonth();
  let days = toDate.getDate() - fromDate.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function extractRegistrar(entities) {
  if (!Array.isArray(entities)) return null;
  const registrarEntity = entities.find((e) =>
    Array.isArray(e.roles) && e.roles.includes("registrar")
  );
  if (!registrarEntity) return null;
  if (Array.isArray(registrarEntity.vcardArray) && registrarEntity.vcardArray[1]) {
    const fnField = registrarEntity.vcardArray[1].find((f) => f[0] === "fn");
    if (fnField && fnField[3]) return fnField[3];
  }
  return registrarEntity.handle || null;
}

async function checkWhois(domain) {
  try {
    const res = await fetchWithTimeout(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) {
      return {
        found: false,
        error:
          res.status === 404
            ? "Domain tidak terdaftar atau tidak ditemukan di RDAP"
            : `RDAP merespons dengan status ${res.status}`,
      };
    }
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    const regEvent = events.find((e) => e.eventAction === "registration");
    const expEvent = events.find((e) => e.eventAction === "expiration");
    const updEvent = events.find(
      (e) => e.eventAction === "last changed" || e.eventAction === "last update of RDAP database"
    );

    const registrationDate = regEvent ? new Date(regEvent.eventDate) : null;
    const expirationDate = expEvent ? new Date(expEvent.eventDate) : null;
    const now = new Date();

    let age = null;
    if (registrationDate && !isNaN(registrationDate)) {
      age = formatAge(registrationDate, now);
    }

    let daysUntilExpiry = null;
    if (expirationDate && !isNaN(expirationDate)) {
      daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
    }

    return {
      found: true,
      registrationDate: registrationDate ? registrationDate.toISOString() : null,
      expirationDate: expirationDate ? expirationDate.toISOString() : null,
      lastChanged: updEvent ? updEvent.eventDate : null,
      age,
      daysUntilExpiry,
      registrar: extractRegistrar(data.entities),
      status: Array.isArray(data.status) ? data.status : [],
    };
  } catch (err) {
    return { found: false, error: err.name === "AbortError" ? "Timeout" : err.message };
  }
}

const DNS_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME"];

async function fetchDnsType(domain, type) {
  try {
    const res = await fetchWithTimeout(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.Answer)) return [];
    return data.Answer.filter((a) => a.type === dnsTypeToCode(type)).map((a) => a.data);
  } catch {
    return [];
  }
}

function dnsTypeToCode(type) {
  const map = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
  return map[type];
}

async function checkDNS(domain) {
  const entries = await Promise.all(
    DNS_TYPES.map(async (type) => [type, await fetchDnsType(domain, type)])
  );
  const records = {};
  let hasAny = false;
  for (const [type, values] of entries) {
    records[type] = values;
    if (values.length) hasAny = true;
  }
  return { found: hasAny, records };
}

function checkSSL(domain) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let socket;
    try {
      socket = tls.connect(
        {
          host: domain,
          port: 443,
          servername: domain,
          timeout: SSL_TIMEOUT_MS,
          rejectUnauthorized: false,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            const authorized = socket.authorized;
            const authError = socket.authorizationError;
            socket.end();
            if (!cert || Object.keys(cert).length === 0) {
              finish({ found: false, error: "Tidak ada sertifikat yang diberikan server" });
              return;
            }
            const now = new Date();
            const validFrom = new Date(cert.valid_from);
            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));
            finish({
              found: true,
              issuer: cert.issuer?.O || cert.issuer?.CN || "Tidak diketahui",
              subject: cert.subject?.CN || domain,
              validFrom: validFrom.toISOString(),
              validTo: validTo.toISOString(),
              daysRemaining,
              expired: daysRemaining < 0,
              trusted: !!authorized,
              trustNote: authorized ? null : String(authError || "Tidak tepercaya"),
            });
          } catch (err) {
            finish({ found: false, error: err.message });
          }
        }
      );
      socket.on("error", (err) => finish({ found: false, error: err.message }));
      socket.on("timeout", () => {
        socket.destroy();
        finish({ found: false, error: "Timeout menghubungi port 443" });
      });
    } catch (err) {
      finish({ found: false, error: err.message });
    }
  });
}

async function checkOneDomain(domain, options) {
  const result = { domain };
  const jobs = [];
  if (options.whois) jobs.push(checkWhois(domain).then((r) => (result.whois = r)));
  if (options.dns) jobs.push(checkDNS(domain).then((r) => (result.dns = r)));
  if (options.ssl) jobs.push(checkSSL(domain).then((r) => (result.ssl = r)));
  await Promise.allSettled(jobs);
  return result;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body permintaan tidak valid" }, { status: 400 });
  }

  const rawDomains = Array.isArray(body.domains) ? body.domains : [];
  const options = {
    whois: body.options?.whois !== false,
    dns: body.options?.dns !== false,
    ssl: body.options?.ssl !== false,
  };

  const seen = new Set();
  const domains = [];
  const invalid = [];
  for (const raw of rawDomains) {
    const d = normalizeDomain(raw);
    if (!d) continue;
    if (!isLikelyValidDomain(d)) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(d)) continue;
    seen.add(d);
    domains.push(d);
  }

  if (!domains.length) {
    return NextResponse.json(
      { error: "Tidak ada domain valid untuk diperiksa", invalid },
      { status: 400 }
    );
  }
  if (domains.length > MAX_DOMAINS) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_DOMAINS} domain per permintaan` },
      { status: 400 }
    );
  }
  if (!options.whois && !options.dns && !options.ssl) {
    return NextResponse.json(
      { error: "Pilih minimal satu jenis pemeriksaan" },
      { status: 400 }
    );
  }

  const results = [];
  for (let i = 0; i < domains.length; i += CONCURRENCY) {
    const batch = domains.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((d) => checkOneDomain(d, options))
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ results, invalid, count: results.length });
}
