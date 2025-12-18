# Radio Room Load Tester

A load testing tool for Radio Room that simulates multiple users joining rooms, sending messages, adding songs to the queue, and reacting to content.

## Quick Start

### Using npm (Development)

```bash
# From the monorepo root
npm install

# Run with a scenario file
npm run load-test -w apps/load-tester -- run --scenario scenarios/chat-activity.yaml

# Run with inline options
npm run load-test -w apps/load-tester -- run --target http://localhost:3000 --room test-room --users 10 --duration 60
```

### Using Docker

```bash
# Build the image
docker build -t radio-room-load-tester -f apps/load-tester/Dockerfile .

# Run with a scenario file
docker run -v $(pwd)/apps/load-tester/scenarios:/app/scenarios radio-room-load-tester run --scenario /app/scenarios/chat-activity.yaml

# Run with inline options
docker run radio-room-load-tester run --target http://host.docker.internal:3000 --room test-room --users 5
```

## CLI Usage

### Commands

```bash
# Run a load test
load-tester run [options]

# Validate a scenario file
load-tester validate <file>

# Create a sample scenario file
load-tester init [file]
```

### Run Options

| Option                     | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `-s, --scenario <file>`    | Path to scenario YAML file                       |
| `-t, --target <url>`       | Target server URL (overrides scenario)           |
| `-r, --room <id>`          | Room ID to join (overrides scenario)             |
| `-p, --password <pass>`    | Room password (overrides scenario)               |
| `-u, --users <count>`      | Number of users to simulate (overrides scenario) |
| `-d, --duration <seconds>` | Test duration in seconds (overrides scenario)    |
| `--join-pattern <pattern>` | User join pattern: `staggered` or `burst`        |
| `-v, --verbose`            | Enable verbose logging                           |

### Overriding Scenario Options

You can load a scenario file and override specific settings via CLI arguments:

```bash
# Use queue-stress scenario but run against production with a different room
npm run load-test -w apps/load-tester -- run \
  --scenario scenarios/queue-stress.yaml \
  --target https://api.listeningroom.club \
  --room my-production-room

# Use a scenario but with fewer users for a quick test
npm run load-test -w apps/load-tester -- run \
  --scenario scenarios/mass-join.yaml \
  --users 10 \
  --duration 30
```

## Scenario Configuration

Create a YAML file to define complex test scenarios:

```yaml
name: "my-test"
description: "Custom load test"
target: "http://localhost:3000"
roomId: "test-room"
password: "optional" # if room is password-protected
duration: 60 # seconds
verbose: false

users:
  count: 10
  joinPattern: "staggered" # or "burst"
  joinDuration: 15 # seconds to spread joins over
  leaveAfterActions: false
  stayDuration: 30 # optional, seconds to stay after actions

actions:
  queueSongs:
    enabled: true
    totalSongs: 20
    trackIds:
      - "spotify-track-id-1"
      - "spotify-track-id-2"
    distribution: "even" # or "random", "burst"

  sendMessages:
    enabled: true
    messagesPerUser: 5
    content: # optional, uses defaults if not provided
      - "Custom message 1"
      - "Custom message 2"
    distribution: "random"

  reactions:
    enabled: true
    reactionsPerUser: 3
    targetTypes:
      - "message"
      - "track"
    emojis:
      - "👍"
      - "❤️"
    distribution: "random"
```

### Distribution Patterns

- **even**: Actions are spread evenly across the duration
- **random**: Actions occur at random times within the duration
- **burst**: 80% of actions occur in the first 20% of time

### Join Patterns

- **staggered**: Users join evenly over the join duration
- **burst**: Most users join quickly at the start

## Example Scenarios

Three example scenarios are included:

### 1. Queue Stress Test (`scenarios/queue-stress.yaml`)

15 users add 40 songs over 3 minutes. Tests queue sync and Spotify integration.

### 2. Mass Join Test (`scenarios/mass-join.yaml`)

400 users join over 1 minute. Tests connection handling and broadcasting.

### 3. Chat Activity Test (`scenarios/chat-activity.yaml`)

10 users with full lifecycle - join, chat, react, leave.

## Metrics Output

The tool outputs a summary at the end of each run:

```
═══════════════════════════════════════════════════════════
  Radio Room Load Tester
═══════════════════════════════════════════════════════════

  Scenario:    chat-activity-test
  Target:      http://localhost:3000
  Room:        test-room
  Users:       10
  Duration:    120s

──────────────────────────────────────────────────────────

  Summary

  Duration:          121s
  Total Actions:     130
  Successful:        128
  Failed:            2
  Avg Duration:      45ms

  Action Breakdown:
    connect: 10/10 (100%) avg 234ms
    sendMessage: 80/80 (100%)
    addReaction: 48/50 (96%)

═══════════════════════════════════════════════════════════
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev -w apps/load-tester -- run --scenario scenarios/chat-activity.yaml

# Build
npm run build -w apps/load-tester
```

## Notes

- For queue testing, you need real Spotify track IDs that work with your room's Spotify integration
- The tool respects Ctrl+C for graceful shutdown
- Use `--verbose` to see detailed connection and action logs
- When testing against Docker, use `host.docker.internal` instead of `localhost`
