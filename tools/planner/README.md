# Planner CLI

Minimal Microsoft Graph client to read/update Microsoft Planner tasks assigned to
you, via delegated **device-code auth** (no client secret).

## One-time Azure app registration

1. Azure Portal -> **Microsoft Entra ID** -> **App registrations** -> **New registration**.
2. Name: `Planner CLI`. Supported account types: **Accounts in this organizational directory only** (single tenant).
3. Register (no redirect URI needed).
4. **Authentication** -> Advanced settings -> **Allow public client flows** = **Yes** -> Save.
5. **API permissions** -> Add a permission -> Microsoft Graph -> **Delegated** ->
   add `Tasks.ReadWrite` (and `User.Read`, usually present) -> **Grant admin consent** if your tenant requires it.
6. **Overview**: copy **Application (client) ID** and **Directory (tenant) ID**.

## Setup

```bash
cd tools/planner
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python planner.py init --client-id <APP_ID> --tenant-id <TENANT_ID>
venv/bin/python planner.py login-begin      # prints URL + code
venv/bin/python planner.py login-complete   # blocks until you authenticate in browser
```

## Usage

```bash
venv/bin/python planner.py tasks             # active tasks assigned to me
venv/bin/python planner.py tasks --all       # include completed
venv/bin/python planner.py show <TASK_ID>
venv/bin/python planner.py progress <TASK_ID>            # -> In progress (50%)
venv/bin/python planner.py done <TASK_ID> --note "what I did"   # -> Completed (100%)
venv/bin/python planner.py note <TASK_ID> "progress note"
```

Reporting note: Planner comments live in the M365 Group conversation and are not
writable via delegated Graph, so `--note` appends a timestamped line to the task
**description** instead.
