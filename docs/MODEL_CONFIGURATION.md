# OpenClaw Model Configuration

This guide documents the recommended model setup for OpenClaw deployments, including primary model selection, fallback chains, and authentication setup.

## Overview

**Primary Model:** `openai-codex/gpt-5.3-codex` (GPT-5.3 Codex via OpenAI Code subscription)

**Fallback Chain:**
1. `anthropic/claude-haiku-4-5` — Claude Haiku (Anthropic fast/cost-optimized)
2. `kimi-coding/kimi-k2-thinking` — Kimi K2 Thinking (Moonshot AI, multi-language)

## Model Catalog

All models registered and available for `/model` switching in-session:

### OpenAI Models (Direct API - Not Used)

**Note:** Direct OpenAI API models require separate API key. Currently using OpenAI Code subscription instead.

**Available via OpenAI API (if API key added):**
- `openai/gpt-5.4`, `openai/gpt-5.2`, `openai/gpt-5.1`, `openai/gpt-5`
- `openai/gpt-4o`, `openai/gpt-4.1` (older generations)
- `openai/o1`, `openai/o1-pro`, `openai/o3`, `openai/o3-mini`

### OpenAI Code (Codex) Models ⭐ PRIMARY

**Provider:** `openai-codex/*` — OAuth via **ChatGPT Plus subscription** sign-in

| Model | Alias | Context | Auth | Notes |
|-------|-------|---------|------|-------|
| `openai-codex/gpt-5.3-codex` | Codex Fallback | 266k | OAuth | **PRIMARY RECOMMENDED** (ChatGPT Plus) |
| `openai-codex/gpt-5.2` | - | 266k | OAuth | Older Codex generation |
| `openai-codex/gpt-5.1` variants | - | 266k | OAuth | Extended context variants |

**Authentication:** This provider uses **ChatGPT Plus subscription OAuth**, not direct API key auth. Setup via Claude Code CLI token or interactive login.

### Anthropic Models

**Setup-Token Auth** (recommended - from `claude setup-token`):

| Model | Alias | Input | Context | Notes |
|-------|-------|-------|---------|-------|
| `anthropic/claude-opus-4-6` | Claude Opus | text+image | 195k | Strongest Anthropic model |
| `anthropic/claude-sonnet-4-5` | Claude Sonnet | text+image | 195k | Balanced performance |
| `anthropic/claude-haiku-4-5` | Claude Haiku | text+image | 195k | **Fallback #2** (fast, cost-effective) |

**Additional Anthropic Models:**
- `anthropic/claude-3-5-sonnet-20241022`, `anthropic/claude-3-5-haiku-20241022`
- `anthropic/claude-3-opus-20240229`, `anthropic/claude-3-sonnet-20240229`
- Older generations: `claude-3`, `claude-2.1`, `claude-instant-1.2`

### Kimi Models (Moonshot AI)

| Model | Alias | Input | Context | Notes |
|-------|-------|-------|---------|-------|
| `kimi-coding/kimi-k2-thinking` | Kimi K2 Thinking | **Fallback #3** | Extended | Chinese LLM, multi-language support |
| `kimi-coding/k2p5` | Kimi K2.5 | text+image | | Newer version |

## Authentication Setup

### Important: OpenAI Provider Distinction

**Two separate OpenAI providers exist:**

1. **`openai/*` models** — Direct OpenAI API (usage-based billing, `sk-...` API key)
   - Example: `openai/gpt-5.4`, `openai/gpt-5.2`
   - Auth: API key from platform.openai.com
   - Status: Requires direct API key configuration

2. **`openai-codex/*` models** — OpenAI Code/ChatGPT subscription (OAuth via Claude Code CLI)
   - Example: `openai-codex/gpt-5.3-codex`, `openai-codex/gpt-5.2`
   - Auth: OAuth from `claude setup-token` or interactive login
   - Status: ChatGPT Plus/Pro subscription required

### OpenAI API (gpt-5.4)

**Setup:**
```bash
export OPENAI_API_KEY="sk-..."
openclaw onboard --openai-api-key "$OPENAI_API_KEY"
```

**Config snippet:**
```json
{
  "env": { "OPENAI_API_KEY": "sk-..." },
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-5.4" }
    }
  }
}
```

### OpenAI Code (Codex) - OAuth

**Setup:**
```bash
openclaw onboard --auth-choice openai-codex
# OR
openclaw models auth login --provider openai-codex
```

**Config snippet:**
```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai-codex/gpt-5.3-codex" }
    }
  }
}
```

### Anthropic - Setup-Token (Recommended)

**Generate token on local machine:**
```bash
claude setup-token  # Run on machine with Claude Code CLI
```

**Paste into OpenClaw on gateway:**
```bash
openclaw models auth paste-token --provider anthropic
# OR interactive:
openclaw onboard --auth-choice setup-token
```

**Config snippet:**
```json
{
  "agents": {
    "defaults": {
      "models": {
        "anthropic/claude-opus-4-6": { "alias": "Claude Opus" },
        "anthropic/claude-haiku-4-5": { "alias": "Claude Haiku" }
      },
      "model": {
        "primary": "openai/gpt-5.4",
        "fallbacks": ["openai/gpt-5.3-codex", "anthropic/claude-haiku-4-5"]
      }
    }
  }
}
```

### Kimi (Moonshot AI) - API Key

**Setup:**
```bash
export KIMI_API_KEY="sk-kimi-..."
openclaw onboard --auth-choice kimi
```

## Full Configuration Template

For deployment, use this `openclaw.json` template:

```json5
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.4",
        "fallbacks": [
          "openai/gpt-5.3-codex",
          "anthropic/claude-haiku-4-5",
          "kimi-coding/kimi-k2-thinking"
        ]
      },
      "models": {
        // OpenAI
        "openai/gpt-5.4": {
          "alias": "GPT-5.4"
        },
        "openai/gpt-5.3-codex": {
          "alias": "GPT-5.3 Codex"
        },
        // OpenAI Code (Codex)
        "openai-codex/gpt-5.3-codex": {
          "alias": "Codex Fallback"
        },
        // Anthropic
        "anthropic/claude-opus-4-6": {
          "alias": "Claude Opus"
        },
        "anthropic/claude-sonnet-4-5": {
          "alias": "Claude Sonnet"
        },
        "anthropic/claude-haiku-4-5": {
          "alias": "Claude Haiku"
        },
        // Kimi
        "kimi-coding/kimi-k2-thinking": {
          "alias": "Kimi K2 Thinking"
        }
      }
    }
  }
}
```

## Railway Environment Variables

Set these in Railway Variables (core service) to pre-populate auth during deployment:

```
ANTHROPIC_API_KEY=sk-ant-...          # (if using API key instead of setup-token)
OPENAI_API_KEY=sk-...                 # (if using direct OpenAI API)
KIMI_API_KEY=sk-kimi-...              # (if using Kimi)
```

**Note:** Setup-tokens must be pasted interactively after deployment via:
```bash
openclaw models auth paste-token --provider anthropic
```

## Model Selection in Chat

**Interactive model picker:**
```
/model                    # Show numbered list of configured models
/model 1                  # Select model #1
/model openai/gpt-5.4    # Select by full model ID
/model Claude Opus       # Select by alias
/model status            # Show current model + auth candidates
```

## Troubleshooting

### "Model is not allowed"

If users see this error, the model isn't registered in `agents.defaults.models`. Add it:

```bash
openclaw config set 'agents.defaults.models["anthropic/claude-opus-4-6"]' '{"alias": "Claude Opus"}'
```

### "No API key found for provider"

Auth is per-agent. Re-run setup for that agent:

```bash
openclaw onboard --auth-choice anthropic
```

### Setup-token refresh (Claude subscription)

Claude subscription tokens can expire. Re-generate and paste:

```bash
# On local machine with Claude Code CLI:
claude setup-token

# On gateway:
openclaw models auth paste-token --provider anthropic
```

## Decision & References

- **Decision:** Model configuration optimized for reliability + fallback resilience
- **Primary rationale:** GPT-5.4 is latest OpenAI flagship with longest context + strongest reasoning
- **Fallback #1:** GPT-5.3 Codex ensures fallback within OpenAI ecosystem (same auth)
- **Fallback #2:** Claude Haiku provides cost-effective Anthropic fallback (different provider)
- **Fallback #3:** Kimi K2 Thinking provides multi-language support + Chinese-optimized responses

See OpenClaw docs for detailed model configuration:
- [Models CLI](/concepts/models)
- [Model Providers](/concepts/model-providers)
- [Anthropic](/providers/anthropic)
- [OpenAI](/providers/openai)
- [Model Failover](/concepts/model-failover)
