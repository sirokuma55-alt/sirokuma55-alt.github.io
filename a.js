"use strict";
// GATE_TRIAL_20261029: the mail approval page. Shows only what it could hash itself; signs the challenge it computed.
(function () {
  var R = GateRelay;
  function $(id) { return document.getElementById(id); }
  function message(t) { $("message").textContent = t; }
  var f = null, baseHash = null, amendment = null, ready = false;   // ready only after the page hashed what it shows
  var OPS = { changed: "変更", added: "追加", removed: "削除" };

  function diffText(diff) {
    return diff.map(function (d) {
      var op = OPS[d.op] || String(d.op);
      if (d.op === "added") { return op + " " + d.key + ": " + JSON.stringify(d.after); }
      if (d.op === "removed") { return op + " " + d.key + ": " + JSON.stringify(d.before); }
      return op + " " + d.key + ": " + JSON.stringify(d.before) + " → " + JSON.stringify(d.after);
    }).join("\n");
  }

  function refuse(text) {
    $("status").textContent = "この承認は表示できません";
    $("approve").hidden = true;
    $("edit").hidden = true;
    message(text);
  }

  async function load() {
    if (R.framed()) { refuse("このページは、ほかのサイトの中では開けません"); return; }
    try {
      f = R.fragment();
    } catch (e) { refuse("リンクが壊れています"); return; }
    if (!f || f.v !== 1 || f.k !== "approve" || !f.m || f.m.request_id !== f.rid || typeof f.n !== "string") {
      refuse("リンクの形が正しくありません"); return;
    }
    try { baseHash = await R.hashOf(f.m); } catch (e) { refuse("内容を計算できません: " + e.message); return; }
    $("op").textContent = f.m.operation_type;
    $("dest").textContent = f.m.destination_id;
    $("payload").textContent = JSON.stringify(f.m.payload, null, 2);
    $("reference").textContent = f.m.reference ? JSON.stringify(f.m.reference, null, 2) : "(なし)";
    $("expires").textContent = f.m.expires_at;
    $("hash-tail").textContent = R.tailDisplay(baseHash);
    $("hash-full").textContent = baseHash;
    $("status").textContent = "承認待ち";
    ready = true;
    $("approve").hidden = false;
    $("edit").hidden = false;
  }

  function startEdit() {
    if (!ready) { return; }
    $("editor").value = JSON.stringify(amendment ? amendment.doc.approved.payload : f.m.payload, null, 2);
    $("edit-box").hidden = false;
  }

  async function apply() {
    if (!ready) { return; }
    message("");
    var payload;
    try { payload = JSON.parse($("editor").value); } catch (e) { message("JSON として読めません: " + e.message); return; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) { message("内容は { } の形にしてください"); return; }
    var a;
    try { a = await R.buildAmendment(f.m, baseHash, f.rid, payload); } catch (e) { message("計算できません: " + e.message); return; }
    if (!a.doc.diff.length) { message("元の提案から何も変わっていません"); return; }
    amendment = a;
    $("diff").textContent = diffText(a.doc.diff);
    $("amend-tail").textContent = R.tailDisplay(a.hash);
    $("amend-full").textContent = a.hash;
    $("amend-box").hidden = false;
    $("edit-box").hidden = true;
    $("approve").textContent = "修正版を承認 (Face ID)";
  }

  function drop() {
    amendment = null;
    $("amend-box").hidden = true;
    $("approve").textContent = "承認 (Face ID)";
  }

  // the text in the edit box that would be signed if the doctor pressed "check" now
  function pendingEdit() {
    if ($("edit-box").hidden) { return false; }
    var applied = amendment ? amendment.doc.approved.payload : f.m.payload;
    try { return R.jcs(JSON.parse($("editor").value)) !== R.jcs(applied); } catch (e) { return true; }
  }

  async function approve() {
    if (!ready) { return; }
    if (pendingEdit()) {          // never sign the proposal while an edit that was not checked is on the screen
      message("書き換えた内容がまだ反映されていません。「修正内容を確かめる」を押してから承認してください。");
      return;
    }
    message("");
    $("approve").disabled = true;
    try {
      var target = amendment ? amendment.hash : baseHash;
      var challenge = await R.relayChallenge(f.rid, target, f.n);
      var allow = Array.isArray(f.c) ? f.c.map(function (id) { return { type: "public-key", id: R.bytesFromB64u(id).buffer }; }) : [];
      var cred = await navigator.credentials.get({ publicKey: {
        challenge: R.bytesFromB64u(challenge).buffer, rpId: f.rp, timeout: 120000, userVerification: "required",
        allowCredentials: allow } });
      var reply = { v: 1, k: "approve", rid: f.rid, n: f.n, mode: amendment ? "amended" : "as_proposed",
                    credential: R.credentialJson(cred, "get") };
      if (amendment) { reply.payload = amendment.doc.approved.payload; }
      var subject = "Re: [MoCKA Gate] " + (amendment ? "修正版を承認 " : "承認 ") + R.tailDisplay(target);
      R.showReply(document, f.r, subject, R.replyBlock(reply));
      $("status").textContent = "返信メールを送信してください";
      $("approve").hidden = true;
      $("edit").hidden = true;
    } catch (e) {
      message("承認できませんでした: " + (e && e.message ? e.message : String(e)));
      $("approve").disabled = false;
    }
  }

  $("approve").addEventListener("click", function () { window.__lastAction = approve(); return window.__lastAction; });
  $("edit").addEventListener("click", startEdit);
  $("apply").addEventListener("click", function () { window.__lastAction = apply(); return window.__lastAction; });
  $("drop").addEventListener("click", drop);
  $("copy").addEventListener("click", function () {
    var t = $("reply-text").textContent;
    window.__lastAction = navigator.clipboard.writeText(t).then(function () {
      $("message").textContent = "コピーしました。届いたメールに返信して、本文に貼り付けて送信してください。";
    }, function () { $("message").textContent = "コピーできませんでした。下の文字を長押しで選んでコピーしてください。"; });
    return window.__lastAction;
  });
  window.__pageReady = load();
})();
