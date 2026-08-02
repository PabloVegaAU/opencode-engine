## Project Agents

This project uses OpenCode Global for orchestration. Add project-specific agent definitions here.

## Available Agents

| Agent | Purpose |
|-------|---------|
| `orchestrator` | Primary coordination agent for task delegation and management |
| `explorer` | Read-only investigation and analysis |
| `dev` | Implementation and code modifications |
| `qa` | Testing and verification |

## Agent Selection Guidelines

- **Simple tasks**: Use the primary agent directly
- **Complex divisible tasks**: Identify independent subtasks, emit parallel `Task` calls
- **Read-only analysis**: Use `explorer`
- **Code implementation**: Use `dev`
- **Testing/verification**: Use `qa`
- **Coordination**: Use `orchestrator`

## Project Authority

- Authority comes from the explicit user request, effective project rules, and current task constraints.
- OpenCode may analyze, make operational decisions, plan, delegate, implement, test, and report within authorized scope.
- When a material decision changes scope, safety, irreversible architecture, or user data, request a user decision or stop only the affected part.
