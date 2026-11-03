"use strict";
// GATE_TRIAL_20261029: register a passkey for the mail page. The answer goes back by mail and stays PENDING.
(function () {
  var R = GateRelay;
  function $(id) { return document.getElementById(id); }
  var f = null, ready = false;

  function load() {
    if (R.framed()) { $("message").textContent = "このページは、ほかのサイトの中では開けません"; return; }
    try { f = R.fragment(); } catch (e) { $("message").textContent = "リンクが壊れています"; return; }
    if (!f || f.v !== 1 || f.k !== "enroll" || typeof f.n !== "string" || typeof f.u !== "string") {
      $("message").textContent = "リンクの形が正しくありません"; return;
    }
    $("status").textContent = "登録の待ち(期限 " + f.x + ")";
    ready = true;
    $("register").hidden = false;
  }

  async function register() {
    if (!ready) { return; }
    $("message").textContent = "";
    $("register").disabled = true;
    try {
      var cred = await navigator.credentials.create({ publicKey: {
        challenge: R.bytesFromB64u(f.n).buffer, rp: { id: f.rp, name: "MoCKA Gate (mail)" },
        user: { id: R.bytesFromB64u(f.u).buffer, name: "doctor", displayName: "MoCKA Gate (mail)" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }], attestation: "none", timeout: 120000,
        authenticatorSelection: { residentKey: "required", userVerification: "required" } } });
      var reply = { v: 1, k: "enroll", n: f.n, credential: R.credentialJson(cred, "create") };
      location.href = R.mailto(f.r, "Re: [MoCKA Gate] パスキーの登録 " + cred.id.slice(-6), R.replyBlock(reply));
      $("status").textContent = "返信メールを送信してください。ID の末尾: " + cred.id.slice(-6);
      $("register").hidden = true;
    } catch (e) {
      $("message").textContent = "登録できませんでした: " + (e && e.message ? e.message : String(e));
      $("register").disabled = false;
    }
  }

  $("register").addEventListener("click", function () { window.__lastAction = register(); return window.__lastAction; });
  window.__pageReady = load();
})();
