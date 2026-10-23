# MoiMone Finance MCP server

A small [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your
MoiMone finance data as tools any MCP-compatible AI client (Claude Desktop, Claude Code,
Cursor, …) can call. Ask *"how much did I spend on food this month?"* or *"am I over any
budget?"* right inside the AI — not just in the app.

It's **read-only** and reuses the same Supabase data as the MoiMone backend. Balances are
**derived from transactions** (opening balance + the sum of each transaction's effect), so
the numbers always match the app's dashboard.

## Tools

| Tool | What it returns |
|---|---|
| `financial_overview` | Spendable-now balance, per-account balances, this/last month totals + spending by category, budgets with spend, and savings goals |
| `spending_by_category` | Spending by category for a month (defaults to this month) |
| `budget_status` | Current-month budgets with spent / remaining (flags over-budget) |
| `account_balances` | Each account's balance + total spendable now (debit + cash) |
| `recent_transactions` | Most recent transactions, optionally filtered by category |

## Setup

```bash
cd mcp-server
npm install
cp .env.example .env    # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MOIMONE_USER_EMAIL
npm start               # sanity check — should print "running (stdio)"
```

> Uses the Supabase **service-role** key, so run it locally/trusted — never expose it.

## Connect it to Claude Desktop

Add this to your Claude Desktop config
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS), then restart Claude:

```json
{
  "mcpServers": {
    "moimone-finance": {
      "command": "node",
      "args": ["/absolute/path/to/MoiMone/mcp-server/index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR-PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SERVICE_ROLE_KEY",
        "MOIMONE_USER_EMAIL": "you@example.com"
      }
    }
  }
}
```

(For Claude Code: `claude mcp add moimone-finance -- node /absolute/path/to/MoiMone/mcp-server/index.js`,
with the same env vars.)

Then ask the assistant things like *"what's my spendable balance?"*, *"break down my spending
by category last month,"* or *"which budgets am I close to?"* — it will call these tools live.
