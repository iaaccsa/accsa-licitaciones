#!/usr/bin/env python3
"""Planner CLI - minimal Microsoft Graph (Planner) client via device-code auth.

Commands:
  init --client-id ID --tenant-id ID   Write config.json
  login-begin                          Start device-code flow (prints code + URL)
  login-complete                       Finish device-code flow (blocks until user auth)
  whoami                               Show signed-in user
  tasks [--all] [--json]               List tasks assigned to me
  show TASK_ID [--json]                Show one task + details
  progress TASK_ID                     Set task to In progress (percentComplete=50)
  done TASK_ID [--note TEXT]           Set task Completed (100) + append note to details
  note TASK_ID TEXT                    Append a timestamped note to task details
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

import msal
import requests

BASE = Path(__file__).resolve().parent
CONFIG_PATH = BASE / "config.json"
CACHE_PATH = BASE / "token_cache.bin"
FLOW_PATH = BASE / "flow.json"
GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = ["Tasks.ReadWrite", "User.Read"]


def load_config():
    if not CONFIG_PATH.exists():
        sys.exit("Missing config.json. Run: planner.py init --client-id ... --tenant-id ...")
    return json.loads(CONFIG_PATH.read_text())


def build_app():
    cfg = load_config()
    cache = msal.SerializableTokenCache()
    if CACHE_PATH.exists():
        cache.deserialize(CACHE_PATH.read_text())
    app = msal.PublicClientApplication(
        cfg["client_id"],
        authority=f"https://login.microsoftonline.com/{cfg['tenant_id']}",
        token_cache=cache,
    )
    return app, cache


def save_cache(cache):
    if cache.has_state_changed:
        CACHE_PATH.write_text(cache.serialize())


def get_token():
    app, cache = build_app()
    accounts = app.get_accounts()
    result = app.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
    save_cache(cache)
    if not result or "access_token" not in result:
        sys.exit("Not authenticated (or token expired). Run: planner.py login-begin / login-complete")
    return result["access_token"]


def gget(token, path):
    r = requests.get(f"{GRAPH}{path}", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def gget_all(token, path):
    items = []
    url = f"{GRAPH}{path}"
    while url:
        r = requests.get(url, headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        data = r.json()
        items.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return items


def gpatch(token, path, etag, body):
    r = requests.patch(
        f"{GRAPH}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "If-Match": etag,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        data=json.dumps(body),
    )
    r.raise_for_status()
    return r.json() if r.text else {}


def task_state(pc):
    if pc >= 100:
        return "Completed"
    if pc <= 0:
        return "Not started"
    return "In progress"


def priority_label(p):
    if p is None:
        return "-"
    if p <= 1:
        return "Urgent"
    if p <= 4:
        return "Important"
    if p <= 7:
        return "Medium"
    return "Low"


def fmt_due(due):
    if not due:
        return "-"
    return due.split("T")[0]


def enrich(token, tasks):
    plan_cache, bucket_cache = {}, {}
    for t in tasks:
        pid = t.get("planId")
        if pid and pid not in plan_cache:
            try:
                plan_cache[pid] = gget(token, f"/planner/plans/{pid}").get("title", pid)
            except Exception:
                plan_cache[pid] = pid
        bid = t.get("bucketId")
        if bid and bid not in bucket_cache:
            try:
                bucket_cache[bid] = gget(token, f"/planner/buckets/{bid}").get("name", bid)
            except Exception:
                bucket_cache[bid] = bid
        t["_plan"] = plan_cache.get(pid, "")
        t["_bucket"] = bucket_cache.get(bid, "")
    return tasks


# ---- commands ----

def cmd_init(args):
    CONFIG_PATH.write_text(json.dumps({"client_id": args.client_id, "tenant_id": args.tenant_id}, indent=2))
    print(f"Wrote {CONFIG_PATH}")


def cmd_login_begin(args):
    app, cache = build_app()
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        sys.exit(f"Failed to start device flow: {json.dumps(flow, indent=2)}")
    FLOW_PATH.write_text(json.dumps(flow))
    print(flow["message"])


def cmd_login_complete(args):
    app, cache = build_app()
    if not FLOW_PATH.exists():
        sys.exit("No pending flow. Run login-begin first.")
    flow = json.loads(FLOW_PATH.read_text())
    result = app.acquire_token_by_device_flow(flow)
    FLOW_PATH.unlink(missing_ok=True)
    save_cache(cache)
    if "access_token" not in result:
        sys.exit(f"Auth failed: {result.get('error_description', result)}")
    me = gget(result["access_token"], "/me")
    print(f"Logged in as {me.get('displayName')} <{me.get('userPrincipalName')}>")


def cmd_whoami(args):
    token = get_token()
    me = gget(token, "/me")
    print(f"{me.get('displayName')} <{me.get('userPrincipalName')}>")


def cmd_tasks(args):
    token = get_token()
    tasks = gget_all(token, "/me/planner/tasks")
    if not args.all:
        tasks = [t for t in tasks if t.get("percentComplete", 0) < 100]
    tasks.sort(key=lambda t: (t.get("dueDateTime") or "9999", -(t.get("priority") or 5)))
    enrich(token, tasks)
    if args.json:
        print(json.dumps(tasks, indent=2, ensure_ascii=False))
        return
    if not tasks:
        print("No active tasks assigned to you.")
        return
    for i, t in enumerate(tasks, 1):
        print(f"[{i}] {t.get('title')}")
        print(
            f"    plan: {t['_plan']} | bucket: {t['_bucket']} | "
            f"{task_state(t.get('percentComplete', 0))} | "
            f"priority: {priority_label(t.get('priority'))} | due: {fmt_due(t.get('dueDateTime'))}"
        )
        print(f"    id: {t.get('id')}")


def cmd_show(args):
    token = get_token()
    t = gget(token, f"/planner/tasks/{args.task_id}")
    d = gget(token, f"/planner/tasks/{args.task_id}/details")
    if args.json:
        print(json.dumps({"task": t, "details": d}, indent=2, ensure_ascii=False))
        return
    print(f"{t.get('title')}")
    print(f"  state: {task_state(t.get('percentComplete', 0))} ({t.get('percentComplete', 0)}%)")
    print(f"  priority: {priority_label(t.get('priority'))} | due: {fmt_due(t.get('dueDateTime'))}")
    print(f"  description:\n{d.get('description') or '  (none)'}")
    checklist = d.get("checklist") or {}
    if checklist:
        print("  checklist:")
        for item in checklist.values():
            mark = "x" if item.get("isChecked") else " "
            print(f"    [{mark}] {item.get('title')}")


def cmd_progress(args):
    token = get_token()
    t = gget(token, f"/planner/tasks/{args.task_id}")
    gpatch(token, f"/planner/tasks/{args.task_id}", t["@odata.etag"], {"percentComplete": 50})
    print(f"In progress: {t.get('title')}")


def _append_note(token, task_id, note):
    d = gget(token, f"/planner/tasks/{task_id}/details")
    stamp = datetime.date.today().isoformat()
    existing = d.get("description") or ""
    new_desc = (existing + f"\n\n[{stamp}] {note}").strip()
    gpatch(token, f"/planner/tasks/{task_id}/details", d["@odata.etag"], {"description": new_desc})


def cmd_done(args):
    token = get_token()
    t = gget(token, f"/planner/tasks/{args.task_id}")
    if args.note:
        _append_note(token, args.task_id, args.note)
    t = gget(token, f"/planner/tasks/{args.task_id}")
    gpatch(token, f"/planner/tasks/{args.task_id}", t["@odata.etag"], {"percentComplete": 100})
    print(f"Completed: {t.get('title')}")


def cmd_note(args):
    token = get_token()
    _append_note(token, args.task_id, args.text)
    print("Note appended.")


def main():
    p = argparse.ArgumentParser(description="Planner CLI (Microsoft Graph)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init")
    s.add_argument("--client-id", required=True)
    s.add_argument("--tenant-id", required=True)
    s.set_defaults(func=cmd_init)

    sub.add_parser("login-begin").set_defaults(func=cmd_login_begin)
    sub.add_parser("login-complete").set_defaults(func=cmd_login_complete)
    sub.add_parser("whoami").set_defaults(func=cmd_whoami)

    s = sub.add_parser("tasks")
    s.add_argument("--all", action="store_true")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_tasks)

    s = sub.add_parser("show")
    s.add_argument("task_id")
    s.add_argument("--json", action="store_true")
    s.set_defaults(func=cmd_show)

    s = sub.add_parser("progress")
    s.add_argument("task_id")
    s.set_defaults(func=cmd_progress)

    s = sub.add_parser("done")
    s.add_argument("task_id")
    s.add_argument("--note")
    s.set_defaults(func=cmd_done)

    s = sub.add_parser("note")
    s.add_argument("task_id")
    s.add_argument("text")
    s.set_defaults(func=cmd_note)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
