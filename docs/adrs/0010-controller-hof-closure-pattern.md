# 0010. Controller HOF + Closure Pattern

**Date:** 2025-01-01
**Status:** Accepted

## Context

Socket.IO controllers need access to shared dependencies (`AppContext`, `io` instance, active connections). Three approaches were evaluated:

1. **Class-based controllers** with dependency injection via constructor.
2. **Higher-order functions (HOF) with closures**: A factory function receives dependencies and returns handler functions that close over them.
3. **Drop the handler layer**: Controllers call adapter/service methods directly without an intermediate handler abstraction.

The codebase follows a predominantly functional style with minimal use of classes. The previous approach of wrapping each handler individually created repetitive boilerplate and excessive adapter instantiation.

## Decision

Use **higher-order functions with closures** for Socket.IO controllers.

Each controller is a `createXHandlers(context)` function that returns an object of handler methods. Dependencies (`AppContext`, `io`, connections map) are captured in the closure, and each handler method receives only the event-specific arguments.

This pattern was chosen for:

- Alignment with the codebase's functional style.
- Minimal migration churn (one controller at a time).
- Reduced adapter instantiation (~79% fewer instantiations measured during the refactor).
- Natural testability via injecting mock context.

## Consequences

- **Clean dependency access**: Handlers access `context`, `io`, and connections without parameter threading or `this` binding.
- **Testable**: Pass a mock `AppContext` to the factory; test returned handlers directly.
- **Functional style**: No class boilerplate, inheritance, or lifecycle methods.
- **Measurable improvement**: Significant reduction in repeated adapter lookups per event.
- **Trade-off**: Less discoverable than class-based approaches for developers used to OOP patterns.
- **Trade-off**: No private methods or encapsulation beyond closure scope.

See also: [work-history/CONTROLLER_PATTERN_PROPOSAL.md](../../work-history/CONTROLLER_PATTERN_PROPOSAL.md)
