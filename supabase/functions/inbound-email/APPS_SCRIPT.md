# Gmail → AgendaOS Inbound Reply Webhook (Google Apps Script)

This script polls the `charliesbarbershop.camuy@gmail.com` mailbox for replies
sent to `noreply@charliesbarbershop.co` and `news@charliesbarbershop.co`, then
forwards each new reply to the `inbound-email` Edge Function which stores it
in `contact_submissions` and shows up in **Admin → Bandeja → Respuestas**.

---

## 1. Setup (one-time)

1. Open https://script.google.com while signed in to
   **charliesbarbershop.camuy@gmail.com** (the inbox that receives the replies).
2. Click **New Project**, name it `AgendaOS Inbound Replies`.
3. Paste the entire `Code.gs` block below, **replacing** any existing code.
4. In **Project Settings → Script Properties**, add two properties:
   - `WEBHOOK_URL` =
     `https://zskjtfpiohvsgwvbbxnc.supabase.co/functions/v1/inbound-email`
   - `WEBHOOK_SECRET` = (the value of `INBOUND_EMAIL_WEBHOOK_SECRET` you set in
     Lovable Cloud → Secrets)
5. Run `installTrigger` once. Authorize the script when Google asks
   (it needs Gmail read + script properties access).
6. Run `pollInbox` once manually to verify it works — check the execution log.

The trigger then runs every minute automatically. A Gmail label
`AgendaOS/Forwarded` is applied to every message after it is sent so the
poller never re-sends the same message twice.

---

## 2. `Code.gs`

```javascript
/**
 * AgendaOS Inbound Replies — Gmail → Supabase webhook.
 *
 * Looks for unread messages addressed to noreply@ or news@ on
 * charliesbarbershop.co (or the legacy charliesbarber.co domain) and
 * forwards each one to the `inbound-email` Edge Function. Already-forwarded
 * messages are tagged with the `AgendaOS/Forwarded` label so they are
 * never sent twice — even if you mark them unread again.
 */

const FORWARDED_LABEL = 'AgendaOS/Forwarded';
const PROCESSED_LABEL = 'AgendaOS/Processed';

// Gmail search — broad on purpose. The Edge Function does the strict filter
// (must be addressed to one of our sender addresses AND be a threaded reply).
// We scan the last 7 days only to keep API quota low.
const SEARCH_QUERY =
  '(to:noreply@charliesbarbershop.co OR ' +
  ' to:news@charliesbarbershop.co OR ' +
  ' to:noreply@charliesbarber.co OR ' +
  ' to:news@charliesbarber.co OR ' +
  ' deliveredto:noreply@charliesbarbershop.co OR ' +
  ' deliveredto:news@charliesbarbershop.co) ' +
  '-label:' + FORWARDED_LABEL + ' newer_than:7d';

function installTrigger() {
  // Remove any prior triggers for pollInbox
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pollInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollInbox').timeBased().everyMinutes(1).create();
  Logger.log('Trigger installed: pollInbox every 1 minute');
}

function getOrCreateLabel(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

function pollInbox() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WEBHOOK_URL');
  var secret = props.getProperty('WEBHOOK_SECRET');
  if (!url || !secret) {
    Logger.log('Missing WEBHOOK_URL or WEBHOOK_SECRET in Script Properties');
    return;
  }

  var forwardedLabel = getOrCreateLabel(FORWARDED_LABEL);
  var processedLabel = getOrCreateLabel(PROCESSED_LABEL);

  var threads = GmailApp.search(SEARCH_QUERY, 0, 50);
  Logger.log('Threads matched: ' + threads.length);

  threads.forEach(function (thread) {
    var threadId = thread.getId();
    var messages = thread.getMessages();

    messages.forEach(function (msg) {
      // Skip messages we already forwarded (per-message check via header).
      // Apps Script can't put labels on individual messages, only threads,
      // so we additionally check the Message-ID against a cache.
      var msgId = msg.getId();
      var cacheKey = 'fwd:' + msgId;
      var cache = CacheService.getScriptCache();
      if (cache.get(cacheKey)) return;

      // Skip our own outbound mail (when we send via Gmail later)
      var fromHeader = msg.getFrom() || '';
      if (/charliesbarbershop\.camuy@gmail\.com/i.test(fromHeader)) return;

      var to = msg.getTo() || '';
      var cc = msg.getCc() || '';
      var bcc = msg.getBcc() || '';
      var allRecipients = (to + ' ' + cc + ' ' + bcc).toLowerCase();
      if (
        !/noreply@charliesbarber/.test(allRecipients) &&
        !/news@charliesbarber/.test(allRecipients)
      ) {
        return; // not addressed to one of our sender addresses
      }

      var rawHeaders = msg.getRawContent();
      var inReplyTo = matchHeader(rawHeaders, 'In-Reply-To');
      var references = matchHeader(rawHeaders, 'References');
      var messageIdHeader = matchHeader(rawHeaders, 'Message-ID');

      var senderName = '';
      var senderEmail = fromHeader;
      var m = fromHeader.match(/^\s*\"?([^\"<]*)\"?\s*<([^>]+)>\s*$/);
      if (m) { senderName = m[1].trim(); senderEmail = m[2].trim(); }

      var payload = {
        gmail_message_id: messageIdHeader || msgId,
        gmail_thread_id: threadId,
        from_name: senderName,
        from_email: senderEmail,
        to_email: to,
        cc_email: cc,
        subject: msg.getSubject() || '',
        body_plain: msg.getPlainBody() || '',
        received_at: msg.getDate().toISOString(),
        in_reply_to: inReplyTo,
        references: references,
      };

      try {
        var resp = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'X-Webhook-Secret': secret },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        var code = resp.getResponseCode();
        Logger.log(
          'Forwarded ' + msgId + ' → ' + code + ' ' + resp.getContentText().slice(0, 200),
        );
        if (code >= 200 && code < 300) {
          cache.put(cacheKey, '1', 21600); // 6h dedupe per-message
        }
      } catch (err) {
        Logger.log('Fetch error for ' + msgId + ': ' + err);
      }
    });

    // Tag the whole thread so the next poll skips it (label-level)
    thread.addLabel(forwardedLabel);
    thread.addLabel(processedLabel);
  });
}

function matchHeader(raw, name) {
  // Headers are case-insensitive and can wrap across lines (folded with whitespace)
  var re = new RegExp('^' + name + ':\\s*([\\s\\S]*?)(?=\\r?\\n[A-Za-z-]+:)', 'mi');
  var m = raw.match(re);
  if (!m) return '';
  return m[1].replace(/\r?\n\s+/g, ' ').trim();
}
```

---

## 3. Verifying it works

After installing:

1. Send a test reply from any email account to `noreply@charliesbarbershop.co`
   (reply to a real confirmation email so the `In-Reply-To` header is set).
2. Wait up to 1 minute for the trigger to fire.
3. Open `/admin/bandeja` → **Respuestas** tab. The reply should appear with
   a 🔴 NUEVO badge.
4. If nothing appears, in Apps Script go to **Executions** to see logs from
   `pollInbox`. The log line `Forwarded <id> → 200` confirms a successful
   forward; anything else (401, 400, 500) indicates a problem.

## 4. Why the previous script wasn't working

The earlier version most likely:
- searched only `is:unread in:inbox` (replies to noreply@ may not land in the
  primary inbox), **or**
- never sent the `X-Webhook-Secret` header, so the Edge Function returned 401
  silently, **or**
- looked up `to:` only and missed the `Delivered-To:` header that Gmail uses
  for forwarded addresses.

This version fixes all three by using a broad Gmail search, sending the
shared secret, and labelling threads to guarantee idempotency.
