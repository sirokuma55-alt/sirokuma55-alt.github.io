"use strict";
// GATE_TRIAL_20261029: shared by the static mail pages (a.html, e.html). No server code: everything is computed here.
// JCS (RFC 8785) for the values a manifest may hold (objects, arrays, strings, safe integers, true/false/null),
// SHA-256 with WebCrypto, and the same amendment builder as gate_server.build_amendment.
var GateRelay = (function () {
  function jcs(v) {
    if (v === null) { return "null"; }
    if (v === true) { return "true"; }
    if (v === false) { return "false"; }
    if (typeof v === "string") { return JSON.stringify(v); }
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v)) { throw new Error("only safe integers are allowed"); }
      return String(v);
    }
    if (Array.isArray(v)) { return "[" + v.map(jcs).join(",") + "]"; }
    if (typeof v === "object") {
      var keys = Object.keys(v).sort();            // default sort = UTF-16 code units, as RFC 8785 asks
      return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + jcs(v[k]); }).join(",") + "}";
    }
    throw new Error("unsupported value");
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  async function sha256(bytes) { return crypto.subtle.digest("SHA-256", bytes); }

  async function hashOf(v) { return hex(await sha256(new TextEncoder().encode(jcs(v)))); }

  function b64uFromBytes(u) {
    var s = "";
    for (var i = 0; i < u.length; i++) { s += String.fromCharCode(u[i]); }
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function bytesFromB64u(t) {
    var bin = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function jsonFromB64u(t) { return JSON.parse(new TextDecoder().decode(bytesFromB64u(t))); }

  function b64uFromJson(o) { return b64uFromBytes(new TextEncoder().encode(JSON.stringify(o))); }

  function fragment() { return jsonFromB64u(location.hash.replace(/^#/, "")); }

  async function relayChallenge(rid, target, nonce) {
    var raw = await sha256(new TextEncoder().encode("gate-relay-v1\u0000" + rid + "\u0000" + target + "\u0000" + nonce));
    return b64uFromBytes(new Uint8Array(raw));
  }

  function same(a, b) { return a === b; }               // primitives only: 1 and true are different values

  function payloadDiff(before, after) {
    var keys = Object.keys(before).concat(Object.keys(after).filter(function (k) { return !(k in before); })).sort();
    var out = [];
    keys.forEach(function (k) {
      var inB = Object.prototype.hasOwnProperty.call(before, k), inA = Object.prototype.hasOwnProperty.call(after, k);
      if (inB && inA) {
        if (!same(before[k], after[k])) { out.push({ key: k, op: "changed", before: before[k], after: after[k] }); }
      } else if (inA) {
        out.push({ key: k, op: "added", before: null, after: after[k] });
      } else {
        out.push({ key: k, op: "removed", before: before[k], after: null });
      }
    });
    return out;
  }

  async function buildAmendment(base, baseHash, rid, payload) {
    var diff = payloadDiff(base.payload, payload);
    var doc = { kind: "AMENDED_APPROVAL_V1", request_id: rid, base_manifest_hash: baseHash,
                operation_type: base.operation_type, destination_id: base.destination_id,
                proposal: { payload: base.payload, payload_hash: await hashOf(base.payload) },
                approved: { payload: payload, payload_hash: await hashOf(payload) },
                diff: diff, diff_hash: await hashOf(diff), expires_at: base.expires_at };
    if (Object.prototype.hasOwnProperty.call(base, "reference")) { doc.reference = base.reference; }
    return { doc: doc, hash: await hashOf(doc) };
  }

  // GitHub Pages cannot send frame-ancestors, so the page refuses to work inside another site's frame itself
  function framed() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }

  function tailDisplay(h) { return h.slice(-4).toUpperCase().split("").join(" "); }

  function credentialJson(cred, kind) {
    var r = cred.response, u = function (b) { return b64uFromBytes(new Uint8Array(b)); };
    var resp = kind === "get"
      ? { clientDataJSON: u(r.clientDataJSON), authenticatorData: u(r.authenticatorData), signature: u(r.signature),
          userHandle: r.userHandle ? u(r.userHandle) : null }
      : { clientDataJSON: u(r.clientDataJSON), attestationObject: u(r.attestationObject) };
    return { id: cred.id, rawId: u(cred.rawId), type: cred.type, response: resp };
  }

  function replyBlock(reply) {
    var b = b64uFromJson(reply), lines = [];
    for (var i = 0; i < b.length; i += 64) { lines.push(b.slice(i, i + 64)); }
    return "-----BEGIN MOCKA GATE REPLY-----\n" + lines.join("\n") + "\n-----END MOCKA GATE REPLY-----";
  }

  // iOS Safari may refuse to open Mail by itself after Face ID: a link the person taps always works, and the text can
  // be copied into an ordinary reply as a last resort.
  function showReply(doc, to, subject, block) {
    var url = mailto(to, subject, block);
    doc.getElementById("send").href = url;
    doc.getElementById("reply-text").textContent = block;
    doc.getElementById("send-box").hidden = false;
    try { location.href = url; } catch (e) { /* the button stays */ }
    return url;
  }

  function mailto(to, subject, body) {
    return "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") + "?subject=" + encodeURIComponent(subject) +
           "&body=" + encodeURIComponent(body);
  }

  return { jcs: jcs, hashOf: hashOf, fragment: fragment, relayChallenge: relayChallenge, payloadDiff: payloadDiff,
           buildAmendment: buildAmendment, tailDisplay: tailDisplay, credentialJson: credentialJson,
           replyBlock: replyBlock, mailto: mailto, bytesFromB64u: bytesFromB64u, framed: framed,
           showReply: showReply };
})();
