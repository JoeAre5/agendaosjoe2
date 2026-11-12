"""Outreach protocol contract tests against an ISOLATED draft backend only.

Needs the draft backend at 127.0.0.1:8001, its service key (fixtures only) and
session files for: an owner, a barber linked to HECTOR, and a barber with no
linked barber. Fixtures use random ids; appointments cannot be hard-deleted
(shop rule) so they are cancelled at the end. Never run against production.
Usage: python3 supabase/tests/outreach_protocol_test.py
"""
import datetime as dt
import json, os, sys, uuid, requests

BASE = "http://127.0.0.1:8001"
KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
SVC = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SVC_H = {"apikey": SVC, "Authorization": "Bearer " + SVC, "Content-Type": "application/json", "Prefer": "return=representation"}
CHARLIE = "04000000-0000-4000-8000-000000000001"
HECTOR = "04000000-0000-4000-8000-000000000002"
OWNER_USER = "00000000-0000-4000-8000-000000000001"
HECTOR_USER = os.environ.get("HECTOR_USER", "d4297e9c-8bdf-41dd-9f53-b072a956be87")
C_CLEAR, C_AMB, C_OTHER = (str(uuid.uuid4()) for _ in range(3))
RUN = (uuid.uuid4().int % 9000) * 100 + 1_000_000
NOW = dt.datetime.now(dt.timezone.utc)
FAILS, CREATED = [], []
WIN = {"p_start": "2000-01-01T00:00:00-04:00", "p_end": "2100-01-01T00:00:00-04:00"}


def at(**kw):
    return NOW + dt.timedelta(**kw)


def rest(method, path, body=None):
    r = requests.request(method, f"{BASE}/rest/v1/{path}", headers=SVC_H, json=body)
    if r.status_code >= 300:
        raise RuntimeError(f"{method} {path}: {r.status_code} {r.text}")
    return r.json() if r.text else None


def appt(n, client, barber, start, created, status="scheduled"):
    row = rest("POST", "appointments", {
        "acuity_id": RUN + n, "barber_id": barber, "client_id": client, "client_name": "Fixture",
        "service_name": "Corte", "starts_at": start.isoformat(), "ends_at": (start + dt.timedelta(minutes=30)).isoformat(),
        "duration_minutes": 30, "price_cents": 2500, "status": status, "created_at": created.isoformat(), "paid": False})[0]
    CREATED.append(row["id"])
    return row["id"]


def cancel(appt_id):
    rest("PATCH", f"appointments?id=eq.{appt_id}", {"status": "cancelled"})


def logs(client, rows=None):
    rest("DELETE", f"outreach_activity_logs?client_id=eq.{client}")
    if rows:
        rest("POST", "outreach_activity_logs", [{"client_id": client, **r} for r in rows])


def token(path):
    return json.load(open(path))["session"]["access_token"] if path else None


def rpc(tok, fn, body=None):
    h = {"apikey": KEY, "Content-Type": "application/json"}
    if tok:
        h["Authorization"] = "Bearer " + tok
    return requests.post(f"{BASE}/rest/v1/rpc/{fn}", headers=h, json=body or {})


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" ({detail})" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def main():
    owner, hector, unlinked = (token(f"/tmp/{n}_session.json") for n in ("owner", "hector", "barber"))
    rest("POST", "clients", [{"id": C_CLEAR, "first_name": "Clear"}, {"id": C_AMB, "first_name": "Ambiguous"}, {"id": C_OTHER, "first_name": "Other"}])
    try:
        # Clear Hector 3/3 (unpaid) + cancelled Charlie visit that must be ignored.
        for i, d in enumerate((90, 60, 30), 1):
            appt(i, C_CLEAR, HECTOR, at(days=-d), at(days=-d - 1))
        appt(4, C_CLEAR, CHARLIE, at(days=-20), at(days=-21), "cancelled")
        for i, (b, d) in enumerate(((CHARLIE, 80), (HECTOR, 60), (CHARLIE, 40), (HECTOR, 20)), 5):
            appt(i, C_AMB, b, at(days=-d, hours=2), at(days=-d - 1))
        appt(9, C_OTHER, CHARLIE, at(days=-50, hours=4), at(days=-51))
        appt(10, C_OTHER, CHARLIE, at(days=-25, hours=4), at(days=-26))

        aff = {r["client_id"]: r["barber_id"] for r in rpc(owner, "outreach_affinities").json()}
        check("clear affinity from real appointments, payment and cancelled ignored", aff.get(C_CLEAR) == HECTOR)
        check("ambiguous client has no barber", C_AMB in aff and aff[C_AMB] is None)
        h_aff = rpc(hector, "outreach_affinities").json()
        check("barber sees only own clear clients", C_CLEAR in {r["client_id"] for r in h_aff} and not {C_AMB, C_OTHER} & {r["client_id"] for r in h_aff}, h_aff)
        check("staff account without linked barber sees nothing", rpc(unlinked, "outreach_affinities").json() == [])
        check("anonymous cannot read affinity", rpc(None, "outreach_affinities").status_code in (401, 403))

        r = rpc(hector, "record_outreach_copy", {"p_client_id": C_CLEAR})
        check("barber copies own clear client", r.status_code == 200, r.text)
        ra = rpc(hector, "record_outreach_copy", {"p_client_id": C_AMB}); check("barber blocked on ambiguous client", ra.status_code == 403, f"{ra.status_code} {ra.text}")
        check("barber blocked on other barber's client", rpc(hector, "record_outreach_copy", {"p_client_id": C_OTHER}).status_code == 403)
        check("staff without barber link blocked", rpc(unlinked, "record_outreach_copy", {"p_client_id": C_CLEAR}).status_code == 403)
        row = rest("GET", f"outreach_activity_logs?client_id=eq.{C_CLEAR}")
        check("actor recorded from session", row and row[0]["actor_barber_id"] == HECTOR and row[0]["actor_user_id"] == HECTOR_USER, row)
        d = requests.post(f"{BASE}/rest/v1/outreach_activity_logs", headers={"apikey": KEY, "Authorization": "Bearer " + hector, "Content-Type": "application/json"},
                          json={"client_id": C_OTHER, "actor_user_id": OWNER_USER})
        check("direct writes rejected (actor cannot be forged)", d.status_code in (401, 403), d.status_code)
        r2 = rpc(owner, "record_outreach_copy", {"p_client_id": C_CLEAR, "p_action": "whatsapp"}).json()[0]
        check("owner copy reports previous copier", r2["previous_actor_name"] == "Hector Cruz", r2)
        hist = [x for x in rpc(hector, "outreach_copy_history", {"p_since": "2000-01-01"}).json() if x["client_id"] == C_CLEAR]
        check("barber observes owner's copy (shared state)", len(hist) == 2 and hist[0]["actor_name"] == "Charlie Corchado", hist)
        rpc(owner, "record_outreach_copy", {"p_client_id": C_AMB})
        check("barber cannot read ambiguous history", all(x["client_id"] != C_AMB for x in rpc(hector, "outreach_copy_history", {"p_since": "2000-01-01"}).json()))

        # Attribution: owner copy at T0, Hector copy at T0+10h (latest copier).
        t0 = at(days=-10)
        logs(C_CLEAR, [{"actor_user_id": OWNER_USER, "actor_barber_id": None, "copied_at": t0.isoformat()},
                       {"actor_user_id": HECTOR_USER, "actor_barber_id": HECTOR, "copied_at": (t0 + dt.timedelta(hours=10)).isoformat()}])
        a72 = appt(11, C_CLEAR, CHARLIE, at(days=3), t0 + dt.timedelta(hours=82))
        a71 = appt(12, C_CLEAR, HECTOR, at(days=5), t0 + dt.timedelta(hours=81, minutes=59))

        def credits(tok=owner):
            return [c for c in rpc(tok, "outreach_credits", WIN).json() if c["client_id"] == C_CLEAR]
        cr = credits()
        check("one credit per recovery cycle", len(cr) == 1, cr)
        check("latest copier credited; appointment barber kept separate",
              cr and cr[0]["actor_barber_id"] == HECTOR and cr[0]["appointment_id"] == a71, cr)
        check("barber sees own credit", len(credits(hector)) == 1)
        cancel(a71)
        cr = credits()
        check("cancellation invalidates; next valid booking at exactly 72h credited", len(cr) == 1 and cr[0]["appointment_id"] == a72, cr)
        cancel(a72)
        late = appt(13, C_CLEAR, HECTOR, at(days=7), t0 + dt.timedelta(hours=82, seconds=1))
        check("booking one second after 72h earns nothing", credits() == [])
        logs(C_CLEAR, [{"actor_user_id": OWNER_USER, "copied_at": at(hours=-1).isoformat()}])
        appt(14, C_CLEAR, HECTOR, at(days=9), at(minutes=-30))
        check("copy made while a future booking exists opens no cycle (no pre-existing credit)", credits() == [])
        cancel(late)
        cr = credits()
        check("after that booking is cancelled, the window's later valid booking counts", len(cr) == 1, cr)
        sel = rpc(owner, "outreach_credits", {"p_start": at(days=-30).isoformat(), "p_end": at(days=-29).isoformat()}).json()
        check("credits filtered by appointment created_at period", all(c["client_id"] != C_CLEAR for c in sel))
        check("anonymous cannot read credits", rpc(None, "outreach_credits", WIN).status_code in (401, 403))
    finally:
        for c in (C_CLEAR, C_AMB, C_OTHER):
            logs(c)
        for a in CREATED:
            cancel(a)
    print(f"\n{len(FAILS)} failed")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
