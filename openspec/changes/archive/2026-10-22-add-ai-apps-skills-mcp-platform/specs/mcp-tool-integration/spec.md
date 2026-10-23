# Spec Delta

## Purpose

Defines safe MCP server registration, tool discovery, model tool schemas, validated tool execution, and continuation of an assistant response with bounded tool results.

## ADDED Requirements

### Requirement: Service connects to configured MCP servers
The system SHALL load MCP server registrations from validated server-side configuration, establish the configured transport, initialize the protocol, and discover available tools through MCP. Credentials and connection details SHALL remain server-side.

#### Scenario: MCP server is discovered
- **WHEN** the application starts with a reachable configured MCP server
- **THEN** the application initializes the connection and records the server's available tools

#### Scenario: MCP outage is bounded
- **WHEN** a configured MCP server is unavailable or returns an invalid protocol response
- **THEN** affected tool operations fail with a generic bounded error while non-tool applications remain usable

### Requirement: Local MCP server exposes safe demonstration tools
The repository SHALL include a local MCP server exposing at least two deterministic, non-destructive tools suitable for lesson acceptance, including a calculator-style tool and a class schedule lookup tool with bounded schemas.

#### Scenario: Tool list includes required tools
- **WHEN** the application performs MCP tool discovery against the local server
- **THEN** the discovered list includes both documented demonstration tools with name, description, and input schema

#### Scenario: Invalid tool arguments are rejected
- **WHEN** a client or model supplies arguments outside a tool's schema or bounds
- **THEN** the tool is not executed and a bounded validation result is recorded

### Requirement: Only bound tool schemas reach the model
Each application SHALL send the model only the tool definitions explicitly bound to that application. Tool names SHALL be server-normalized, collision-safe, and traceable to one MCP server and one discovered tool.

#### Scenario: Bound tools appear in provider request
- **WHEN** an application with one MCP tool binding sends a model request
- **THEN** the provider request contains only that normalized tool schema

#### Scenario: Unbound tool call is rejected
- **WHEN** the model returns a call for a tool not bound to the current application
- **THEN** the server does not execute it and records a bounded denial

### Requirement: Model tool calls execute through the server
When the model returns a valid bound tool call, the system SHALL validate the arguments, execute the corresponding MCP tool server-side, append a bounded tool result to the conversation context, and request or construct the final assistant response.

#### Scenario: Successful MCP tool loop
- **WHEN** the model selects a bound tool with valid arguments
- **THEN** the server records the model call, executes the MCP tool, records its result, and produces a final answer that can reference the result

#### Scenario: Tool failure does not fabricate success
- **WHEN** MCP execution fails or times out
- **THEN** the server returns a generic tool-unavailable response and does not create a successful fabricated tool result

