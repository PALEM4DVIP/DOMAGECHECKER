"use client";

import { useMemo, useState } from "react";

const PLACEHOLDER = "contoh.com\nanotherdomain.id\ngithub.com";

function parseDomainsInput(text) {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function ageLabel(age) {
  if (!age) return "—";
  const parts = [];
  if (age.years) parts.push(`${age.years}th`);
  if (age.months) parts.push(`${age.months}bl`);
  if (!age.years && age.days) parts.push(`${age.days}hr`);
  if (!parts.length) return "Baru hari ini";
  return parts.join(" ");
}

function Led({ tone }) {
  const map = {
    ok: "bg-signal shadow-[0_0_8px_2px_rgba(79,216,196,0.6)]",
    warn: "bg-signal2 shadow-[0_0_8px_2px_rgba(242,184,75,0.6)]",
    bad: "bg-danger shadow-[0_0_8px_2px_rgba(232,96,76,0.6)]",
    off: "bg-line",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[tone] || map.off}`} />;
}

function statusOf(row) {
  const problems = [];
  if (row.whois && (!row.whois.found || (row.whois.daysUntilExpiry != null && row.whois.daysUntilExpiry < 30))) {
    problems.push(row.whois.found ? "warn" : "bad");
  }
  if (row.ssl && (!row.ssl.found || row.ssl.expired || (row.ssl.daysRemaining != null && row.ssl.daysRemaining < 14))) {
    problems.push(row.ssl.found && !row.ssl.expired ? "warn" : "bad");
  }
  if (row.dns && !row.dns.found) problems.push("warn");
  if (problems.includes("bad")) return "bad";
  if (problems.includes("warn")) return "warn";
  return "ok";
}

function toCSV(results) {
  const header = [
    "domain",
    "umur",
    "tanggal_registrasi",
    "tanggal_kadaluarsa_domain",
    "registrar",
    "dns_A",
    "dns_MX",
    "dns_NS",
    "ssl_issuer",
    "ssl_kadaluarsa",
    "ssl_sisa_hari",
  ];
  const lines = [header.join(",")];
  for (const r of results) {
    const row = [
      r.domain,
      r.whois?.age ? ageLabel(r.whois.age) : "",
      r.whois?.registrationDate ? fmtDate(r.whois.registrationDate) : "",
      r.whois?.expirationDate ? fmtDate(r.whois.expirationDate) : "",
      r.whois?.registrar || "",
      (r.dns?.records?.A || []).join(";"),
      (r.dns?.records?.MX || []).join(";"),
      (r.dns?.records?.NS || []).join(";"),
      r.ssl?.issuer || "",
      r.ssl?.validTo ? fmtDate(r.ssl.validTo) : "",
      r.ssl?.daysRemaining ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

export default function Page() {
  const [domainsText, setDomainsText] = useState("");
  const [opts, setOpts] = useState({ whois: true, dns: true, ssl: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const domainCount = useMemo(() => parseDomainsInput(domainsText).length, [domainsText]);

  async function runCheck(e) {
    e.preventDefault();
    setError(null);
    const domains = parseDomainsInput(domainsText);
    if (!domains.length) {
      setError("Masukkan minimal satu domain.");
      return;
    }
    if (!opts.whois && !opts.dns && !opts.ssl) {
      setError("Pilih minimal satu jenis pemeriksaan.");
      return;
    }
    setLoading(true);
    setResults(null);
    setExpanded(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains, options: opts }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Terjadi kesalahan.");
        return;
      }
      setResults(data.results);
    } catch (err) {
      setError(err.message || "Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!results) return;
    const csv = toCSV(results);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domain-inspector-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-grid bg-grid relative">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink via-transparent to-ink" />

      <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <header className="mb-10 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-signal font-mono text-xs tracking-[0.25em] uppercase mb-3">
              <Led tone="ok" />
              <span className="led-live">sistem siap</span>
            </div>
            <h1 className="font-mono text-3xl sm:text-4xl font-semibold tracking-tight text-paper">
              Domain Inspector
            </h1>
            <p className="text-muted mt-2 max-w-lg text-sm sm:text-base leading-relaxed">
              Periksa umur domain, catatan DNS, dan sertifikat SSL — satu per satu
              atau sekaligus banyak domain.
            </p>
          </div>
        </header>

        <form
          onSubmit={runCheck}
          className="rounded-lg border border-line bg-panel/80 backdrop-blur-sm p-5 sm:p-6 mb-8"
        >
          <label className="block font-mono text-xs uppercase tracking-widest text-muted mb-2">
            Daftar domain (satu per baris, atau pisahkan dengan koma)
          </label>
          <textarea
            value={domainsText}
            onChange={(e) => setDomainsText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={5}
            spellCheck={false}
            className="w-full resize-y rounded-md bg-panel2 border border-line text-paper font-mono text-sm px-3 py-3 outline-none focus:border-signal transition-colors placeholder:text-muted/60"
          />
          <div className="flex items-center justify-between mt-2 text-xs text-muted font-mono">
            <span>{domainCount} domain terdeteksi &middot; maks. 50</span>
          </div>

          <div className="flex flex-wrap gap-3 mt-5">
            {[
              { key: "whois", label: "Umur Domain (WHOIS)" },
              { key: "dns", label: "Catatan DNS" },
              { key: "ssl", label: "Sertifikat SSL" },
            ].map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => setOpts((o) => ({ ...o, [item.key]: !o[item.key] }))}
                className={`px-3 py-2 rounded-md border text-xs font-mono uppercase tracking-wide transition-colors ${
                  opts[item.key]
                    ? "border-signal text-signal bg-signal/10"
                    : "border-line text-muted hover:border-muted"
                }`}
              >
                {opts[item.key] ? "✓ " : ""}
                {item.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 text-sm text-danger font-mono border border-danger/40 bg-danger/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-md bg-signal text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Memeriksa…" : "Jalankan Pemeriksaan"}
            </button>
            {results && !loading && (
              <button
                type="button"
                onClick={downloadCSV}
                className="px-4 py-2.5 rounded-md border border-line text-paper text-sm hover:border-signal transition"
              >
                Unduh CSV
              </button>
            )}
          </div>
        </form>

        {loading && (
          <div className="font-mono text-sm text-muted flex items-center gap-2 mb-8">
            <Led tone="warn" />
            <span className="led-live">memproses {domainCount} domain…</span>
          </div>
        )}

        {results && (
          <div className="rounded-lg border border-line overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-panel2 text-muted font-mono text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Domain</th>
                  <th className="text-left px-4 py-3 font-medium">Umur</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Registrar</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Kadaluarsa Domain</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">SSL</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  const isOpen = expanded === row.domain;
                  const tone = statusOf(row);
                  return (
                    <>
                      <tr
                        key={row.domain}
                        onClick={() => setExpanded(isOpen ? null : row.domain)}
                        className="border-t border-line hover:bg-panel/60 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Led tone={tone} />
                        </td>
                        <td className="px-4 py-3 font-mono text-paper">{row.domain}</td>
                        <td className="px-4 py-3 text-paper">
                          {row.whois ? ageLabel(row.whois.age) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted hidden sm:table-cell">
                          {row.whois?.registrar || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted hidden md:table-cell">
                          {row.whois ? fmtDate(row.whois.expirationDate) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted hidden md:table-cell">
                          {row.ssl?.found
                            ? row.ssl.expired
                              ? "Kedaluwarsa"
                              : `${row.ssl.daysRemaining} hari lagi`
                            : "—"}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-line bg-panel2/60">
                          <td colSpan={6} className="px-4 py-5">
                            <DetailPanel row={row} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-14 text-xs text-muted font-mono text-center">
          Data WHOIS via RDAP publik &middot; DNS via Google DNS-over-HTTPS &middot; SSL diperiksa langsung ke port 443
        </footer>
      </div>
    </main>
  );
}

function DetailPanel({ row }) {
  return (
    <div className="grid gap-6 sm:grid-cols-3 font-mono text-xs">
      {row.whois && (
        <div>
          <div className="text-signal uppercase tracking-widest mb-2">WHOIS / RDAP</div>
          {row.whois.found ? (
            <ul className="space-y-1 text-paper/90">
              <li><span className="text-muted">Terdaftar:</span> {fmtDate(row.whois.registrationDate)}</li>
              <li><span className="text-muted">Kadaluarsa:</span> {fmtDate(row.whois.expirationDate)}</li>
              <li><span className="text-muted">Umur:</span> {ageLabel(row.whois.age)}</li>
              <li><span className="text-muted">Registrar:</span> {row.whois.registrar || "—"}</li>
              {row.whois.status?.length > 0 && (
                <li><span className="text-muted">Status:</span> {row.whois.status.join(", ")}</li>
              )}
            </ul>
          ) : (
            <div className="text-danger">{row.whois.error || "Tidak ditemukan"}</div>
          )}
        </div>
      )}

      {row.dns && (
        <div>
          <div className="text-signal uppercase tracking-widest mb-2">DNS</div>
          {row.dns.found ? (
            <ul className="space-y-1 text-paper/90">
              {Object.entries(row.dns.records)
                .filter(([, v]) => v.length)
                .map(([type, values]) => (
                  <li key={type}>
                    <span className="text-muted">{type}:</span> {values.join(", ")}
                  </li>
                ))}
            </ul>
          ) : (
            <div className="text-danger">Tidak ada catatan DNS ditemukan</div>
          )}
        </div>
      )}

      {row.ssl && (
        <div>
          <div className="text-signal uppercase tracking-widest mb-2">SSL</div>
          {row.ssl.found ? (
            <ul className="space-y-1 text-paper/90">
              <li><span className="text-muted">Penerbit:</span> {row.ssl.issuer}</li>
              <li><span className="text-muted">Berlaku hingga:</span> {fmtDate(row.ssl.validTo)}</li>
              <li>
                <span className="text-muted">Sisa waktu:</span>{" "}
                {row.ssl.expired ? (
                  <span className="text-danger">Kedaluwarsa</span>
                ) : (
                  `${row.ssl.daysRemaining} hari`
                )}
              </li>
              {!row.ssl.trusted && (
                <li className="text-signal2">Peringatan: {row.ssl.trustNote}</li>
              )}
            </ul>
          ) : (
            <div className="text-danger">{row.ssl.error || "Tidak dapat memeriksa SSL"}</div>
          )}
        </div>
      )}
    </div>
  );
}
