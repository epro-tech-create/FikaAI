import { useEffect, useState } from "react";
import { api, message } from "../../services/api";
import { PageHeading, StatePanel } from "../../components/PortalUI";
import type { Role } from "../../lib/auth";

export default function LocationSettingsPage({
  role,
}: {
  role: Extract<Role, "admin" | "instructor">;
}) {
  const [mode, setMode] = useState<"strict" | "any">("strict");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/${role}/settings/location-mode`);
      const m = res.data?.mode === "any" ? "any" : "strict";
      setMode(m);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [role]);

  async function toggle(next: "strict" | "any") {
    setSaving(true);
    setError("");
    setOk("");
    try {
      // admin can POST, instructor is read-only (will 403)
      const res = await api.post(`/admin/settings/location-mode`, {
        mode: next,
      });
      const m = res.data?.mode === "any" ? "any" : "strict";
      setMode(m);
      setOk(
        `Location mode: ${m === "strict" ? "Configured location (geofence enforced)" : "Any location (geofence disabled)"}`,
      );
    } catch (e) {
      // fallback: try role's endpoint if admin not allowed
      try {
        if (role === "admin") throw e;
        setError(message(e) + " — only admin can change. Ask admin.");
      } catch {
        setError(message(e));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <main className="portal-content">
        <StatePanel kind="loading" />
      </main>
    );
  return (
    <main className="portal-content">
      <PageHeading
        eyebrow="SETTINGS"
        title="Location mode"
        description="Choose whether attendance requires the configured RAFIC location or allows any location. Default is configured location (strict)."
      />
      {error ? <StatePanel kind="error">{error}</StatePanel> : null}
      {ok.trim() ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            color: "#065f46",
          }}
        >
          {ok}
        </div>
      ) : null}
      <section
        className="content-card"
        style={{ padding: 20, overflow: "visible" }}
      >
        <h4 style={{ margin: "0 0 10px", color: "#f1f5f9", lineHeight: 1.4 }}>
          Current:{" "}
          {mode === "strict"
            ? "Configured location (strict)"
            : "Any location (bypass geofence)"}
        </h4>
        <p
          style={{
            color: "#cbd5e1",
            fontSize: 13,
            marginBottom: 16,
            lineHeight: 1.7,
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        >
          Strict = student must be inside RAFIC geofence (default). Any = skip
          GPS distance check, only venue/face needed. Toggle is live, resets on
          backend restart; set{" "}
          <code
            style={{
              background: "rgba(255,255,255,0.08)",
              padding: "3px 6px",
              borderRadius: 4,
              wordBreak: "break-all",
            }}
          >
            GPS_VERIFICATION_ENABLED
          </code>{" "}
          in{" "}
          <code
            style={{
              background: "rgba(255,255,255,0.08)",
              padding: "3px 6px",
              borderRadius: 4,
              wordBreak: "break-all",
            }}
          >
            .env.production
          </code>{" "}
          for persistent default.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            disabled={saving}
            onClick={() => toggle("strict")}
            className={
              mode === "strict" ? "portal-primary" : "secondary-button"
            }
          >
            Use configured location
          </button>
          <button
            disabled={saving}
            onClick={() => toggle("any")}
            className={mode === "any" ? "portal-primary" : "secondary-button"}
          >
            Allow any location
          </button>
          <button
            disabled={saving}
            onClick={() => load()}
            className="secondary-button"
          >
            Refresh
          </button>
        </div>
        {role === "instructor" && (
          <small style={{ display: "block", marginTop: 8, color: "#64748b" }}>
            Instructor view is read-only. Admin can change.
          </small>
        )}
      </section>
    </main>
  );
}
