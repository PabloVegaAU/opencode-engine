<#
.SYNOPSIS
  Starts OpenCode with a model-only profile plus dynamic per-agent routing.

.DESCRIPTION
  The launcher keeps the global runtime project-neutral. It loads a minimal
  profile via OPENCODE_CONFIG, discovers agents already declared by the target
  project, resolves their model routing from the global matrix, and applies
  only those per-agent overrides through OPENCODE_CONFIG_CONTENT.

  It never writes to the target project, never copies profile files, and never
  materializes agents that the project did not already declare.

  Agent modes are validated against the allowed set: primary, subagent, all.
  Invalid modes are rejected with a clear error message before launching.

  This script uses only Node.js built-ins for JSON/JSONC parsing and validation.
  No external npm packages are required.

.PARAMETER Profile
  Profile to use: go, chatgpt-plus, mix, minimax-plus

.PARAMETER TargetDir
  Target project directory (defaults to current working directory)

.PARAMETER DryRun
  Show routing without launching OpenCode

.PARAMETER PrintRouting
  Print routing information before launch

.EXAMPLE
  .\opencode-launcher.ps1 -Profile go -TargetDir C:\mi-proyecto
  .\opencode-launcher.ps1 mix
  .\opencode-launcher.ps1 chatgpt-plus -DryRun -PrintRouting
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("go", "chatgpt-plus", "mix", "minimax-plus")]
  [string]$Profile,

  [Parameter(Mandatory = $false, Position = 1)]
  [string]$TargetDir = (Get-Location).Path,

  [switch]$DryRun,
  [switch]$PrintRouting
)

$ErrorActionPreference = "Stop"

$GlobalRoot = Split-Path -Parent $PSScriptRoot
$OpenCodeConfigDir = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }

$ProfileMap = @{
  "go"           = "go.jsonc"
  "chatgpt-plus" = "chatgpt-plus.jsonc"
  "mix"          = "mix.jsonc"
  "minimax-plus" = "minimax-plus.jsonc"
}

$OverlayFile = Join-Path $OpenCodeConfigDir "opencode.profiles\$($ProfileMap[$Profile])"
$MatrixFile = Join-Path $OpenCodeConfigDir "routing\model-matrix.json"
$MatrixSchemaFile = Join-Path $OpenCodeConfigDir "routing\model-matrix.schema.json"

foreach ($required in @($OverlayFile, $MatrixFile, $MatrixSchemaFile)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    Write-Error "Required launcher file not found: $required"
    Write-Error "Run .\install-opencode-global.ps1 first."
  }
}

$ResolvedTarget = [System.IO.Path]::GetFullPath($TargetDir)
if (-not (Test-Path -LiteralPath $ResolvedTarget -PathType Container)) {
  Write-Error "Target directory not found: $ResolvedTarget"
}

$NormalizedOpenCode = [System.IO.Path]::GetFullPath($OpenCodeConfigDir).TrimEnd('\', '/')
$NormalizedTarget = $ResolvedTarget.TrimEnd('\', '/')
if ([string]::Equals($NormalizedTarget, $NormalizedOpenCode, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Error "The global OpenCode root cannot be a launcher TargetDir. Select a project directory."
}

# Valid agent modes - anything else is rejected
$ValidAgentModes = @("primary", "subagent", "all")

function Invoke-RoutingBuilder {
  param(
    [string]$GlobalConfigPath,
    [string]$TargetRootPath,
    [string]$ProfileName,
    [string]$OverlayPath,
    [string]$MatrixPath,
    [string]$SchemaPath
  )

  # No external dependencies - uses only Node.js built-ins
  $builder = @'
import fs from "fs";
import path from "path";

const VALID_AGENT_MODES = new Set(["primary", "subagent", "all"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// String-aware JSONC parser - handles comments without corrupting strings
function parseJsonc(content) {
  let result = '';
  let i = 0;
  // Normalize line endings
  content = content.replace(/\r\n?/g, "\n");
  while (i < content.length) {
    if (content[i] === '"') {
      // String literal - preserve it entirely
      result += content[i++];
      while (i < content.length && content[i] !== '"') {
        if (content[i] === '\\') result += content[i++];
        result += content[i++];
      }
      if (i < content.length) result += content[i++];
    } else if (content[i] === '/' && content[i + 1] === '/') {
      // Single-line comment - skip to end of line
      while (i < content.length && content[i] !== '\n') i++;
    } else if (content[i] === '/' && content[i + 1] === '*') {
      // Multi-line comment - skip entirely
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += content[i++];
    }
  }
  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(result);
  } catch (error) {
    fail(`JSON parse error: ${error.message}`);
  }
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFile(filePath));
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function loadJsonc(filePath) {
  return parseJsonc(readFile(filePath));
}

function normalizeSource(filePath) {
  return path.relative(targetRoot, filePath).replace(/\\/g, "/");
}

function parseFrontmatter(filePath) {
  const text = readFile(filePath);
  if (!text.startsWith("---")) {
    return {};
  }
  const lines = text.split(/\r?\n/);
  let inFrontmatter = false;
  const frontmatter = {};
  for (const line of lines) {
    if (!inFrontmatter) {
      if (line.trim() === "---") {
        inFrontmatter = true;
      }
      continue;
    }
    if (line.trim() === "---") {
      break;
    }
    const match = /^([A-Za-z0-9_]+):\s*(.+?)\s*$/.exec(line);
    if (match) {
      frontmatter[match[1]] = match[2];
    }
  }
  return frontmatter;
}

function collectConfigAgents(filePath, discovered) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  let config;
  if (filePath.endsWith(".jsonc")) {
    config = loadJsonc(filePath);
  } else {
    config = loadJson(filePath);
  }
  const agents = config?.agent ?? {};
  for (const [name, settings] of Object.entries(agents)) {
    if (!discovered.has(name)) {
      discovered.set(name, { name, sources: [], modes: new Set(), category: null });
    }
    const record = discovered.get(name);
    record.sources.push(normalizeSource(filePath));
    if (settings && typeof settings === "object" && typeof settings.mode === "string") {
      record.modes.add(settings.mode);
    }
  }
}

function collectMarkdownAgents(dirPath, discovered) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const filePath = path.join(dirPath, entry.name);
    const agentName = path.basename(entry.name, ".md");
    if (!discovered.has(agentName)) {
      discovered.set(agentName, { name: agentName, sources: [], modes: new Set(), category: null });
    }
    const record = discovered.get(agentName);
    record.sources.push(normalizeSource(filePath));
    const frontmatter = parseFrontmatter(filePath);
    if (typeof frontmatter.mode === "string" && frontmatter.mode.length > 0) {
      record.modes.add(frontmatter.mode);
    }
  }
}

// Validate routing matrix has expected structure
function validateMatrixStructure(matrix) {
  if (!matrix || typeof matrix !== "object") {
    return "matrix is not an object";
  }
  if (!matrix.profiles || typeof matrix.profiles !== "object") {
    return "matrix.profiles is missing or not an object";
  }
  return null;
}

// Validate overlay has expected structure
function validateOverlay(overlay) {
  if (!overlay || typeof overlay !== "object") {
    return "overlay is not an object";
  }
  if (typeof overlay.model !== "string") {
    return "overlay.model is missing or not a string";
  }
  return null;
}

// Validate agent modes before proceeding
function validateAgentModes(discovered) {
  const errors = [];
  for (const [name, record] of discovered) {
    // Check for conflicting modes across sources
    if (record.modes.size > 1) {
      const sources = record.sources.sort();
      const modes = [...record.modes].sort();
      errors.push(`Agent "${name}" has conflicting modes: ${modes.join(", ")} from sources: ${sources.join(", ")}`);
    }
    // Check each mode for validity
    for (const mode of record.modes) {
      if (!VALID_AGENT_MODES.has(mode)) {
        const source = record.sources[0] || "unknown";
        errors.push(`Agent "${name}" has invalid mode "${mode}" from ${source}. Valid modes are: primary, subagent, all`);
      }
    }
  }
  return errors;
}

const globalRoot = process.argv[2];
const targetRoot = process.argv[3];
const profileName = process.argv[4];
const overlayPath = process.argv[5];
const matrixPath = process.argv[6];
const schemaPath = process.argv[7];

let overlay;
try {
  overlay = loadJsonc(overlayPath);
} catch (e) {
  fail(`Failed to load overlay: ${e.message}`);
}

const overlayError = validateOverlay(overlay);
if (overlayError) {
  fail(`Invalid overlay: ${overlayError}`);
}

let matrix;
try {
  matrix = loadJson(matrixPath);
} catch (e) {
  fail(`Failed to load matrix: ${e.message}`);
}

const matrixError = validateMatrixStructure(matrix);
if (matrixError) {
  fail(`Invalid matrix structure: ${matrixError}`);
}

const profileMatrix = matrix?.profiles?.[profileName];
if (!profileMatrix) {
  fail(`Profile not found in routing matrix: ${profileName}`);
}

const discovered = new Map();
collectConfigAgents(path.join(targetRoot, "opencode.json"), discovered);
collectConfigAgents(path.join(targetRoot, "opencode.jsonc"), discovered);
collectMarkdownAgents(path.join(targetRoot, ".opencode", "agents"), discovered);

// Validate agent modes before proceeding
const modeErrors = validateAgentModes(discovered);
if (modeErrors.length > 0) {
  for (const err of modeErrors) {
    console.error(`MODE_VALIDATION_FAILED: ${err}`);
  }
  process.exit(1);
}

const categoryFile = path.join(targetRoot, ".opencode", "model-routing.json");
let localCategories = {};
if (fs.existsSync(categoryFile)) {
  try {
    localCategories = loadJson(categoryFile) || {};
  } catch (e) {}
}

for (const [name, category] of Object.entries(localCategories)) {
  if (!discovered.has(name)) {
    continue;
  }
  const record = discovered.get(name);
  record.category = typeof category === "string" ? category : null;
}

const resolvedAgents = [];
const contentAgent = {};
const unknownAgents = [];

for (const record of [...discovered.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const roleAssignment = profileMatrix.roles?.[record.name];
  const categoryAssignment = record.category ? profileMatrix.categories?.[record.category] : null;
  const assignment = roleAssignment ?? categoryAssignment ?? null;
  const mode = record.modes.size > 0 ? [...record.modes][0] : null;
  const resolved = {
    name: record.name,
    mode,
    sources: record.sources.sort(),
    category: record.category,
    resolvedModel: assignment ? assignment.model : overlay.model,
    resolvedVariant: assignment?.variant ?? null,
    resolvedBy: roleAssignment ? "role" : categoryAssignment ? "category" : "root",
    unknown: assignment === null
  };
  resolvedAgents.push(resolved);
  if (assignment) {
    contentAgent[record.name] = assignment.variant
      ? { model: assignment.model, variant: assignment.variant }
      : { model: assignment.model };
  } else {
    unknownAgents.push(record.name);
  }
}

const result = {
  overlay,
  contentConfig: { agent: contentAgent },
  summary: {
    profile: profileName,
    project: targetRoot,
    agentCount: resolvedAgents.length,
    agents: resolvedAgents,
    categories: localCategories,
    unknownAgents,
    writes: 0
  }
};

process.stdout.write(JSON.stringify(result));
'@

  Push-Location -LiteralPath $GlobalConfigPath
  try {
    $raw = $builder | node --input-type=module - $GlobalConfigPath $TargetRootPath $ProfileName $OverlayPath $MatrixPath $SchemaPath
    if ($LASTEXITCODE -ne 0) {
      throw "The routing builder failed."
    }
    return $raw | ConvertFrom-Json
  }
  finally {
    Pop-Location
  }
}

function Write-RoutingSummary {
  param([object]$RoutingResult)

  Write-Host "[launcher] Profile: $($RoutingResult.summary.profile)"
  Write-Host "[launcher] Project: $($RoutingResult.summary.project)"
  Write-Host "[launcher] Overlay: $OverlayFile"
  Write-Host "[launcher] Agents found: $($RoutingResult.summary.agentCount)"
  foreach ($agent in $RoutingResult.summary.agents) {
    $sourceText = ($agent.sources -join ", ")
    $modeText = if ($agent.mode) { $agent.mode } else { "unknown-mode" }
    $categoryText = if ($agent.category) { " category=$($agent.category)" } else { "" }
    $variantText = if ($agent.resolvedVariant) { " variant=$($agent.resolvedVariant)" } else { "" }
    Write-Host ("  - {0} [{1}] <= {2}{3} -> {4}{5}" -f $agent.name, $modeText, $sourceText, $categoryText, $agent.resolvedModel, $variantText)
  }
  if ($RoutingResult.summary.unknownAgents.Count -gt 0) {
    Write-Warning ("Unknown agents inherit the root model: {0}" -f ($RoutingResult.summary.unknownAgents -join ", "))
  }
  Write-Host "[launcher] Zero writes: yes"
}

$RoutingResult = Invoke-RoutingBuilder `
  -GlobalConfigPath $OpenCodeConfigDir `
  -TargetRootPath $ResolvedTarget `
  -ProfileName $Profile `
  -OverlayPath $OverlayFile `
  -MatrixPath $MatrixFile `
  -SchemaPath $MatrixSchemaFile

$InlineRoutingJson = ($RoutingResult.contentConfig | ConvertTo-Json -Depth 12 -Compress)

if ($DryRun -or $PrintRouting) {
  Write-RoutingSummary -RoutingResult $RoutingResult
}
if ($PrintRouting) {
  Write-Output ("__PROFILE_JSON__" + (($RoutingResult.overlay | ConvertTo-Json -Depth 12 -Compress)))
  Write-Output ("__ROUTING_JSON__" + $InlineRoutingJson)
  Write-Output ("__DISCOVERY_JSON__" + (($RoutingResult.summary | ConvertTo-Json -Depth 12 -Compress)))
}
if ($DryRun) {
  exit 0
}

$PreviousConfig = $env:OPENCODE_CONFIG
$PreviousInline = $env:OPENCODE_CONFIG_CONTENT
$ExitCode = 0

try {
  $env:OPENCODE_CONFIG = $OverlayFile
  $env:OPENCODE_CONFIG_CONTENT = $InlineRoutingJson
  Push-Location -LiteralPath $ResolvedTarget
  try {
    & opencode
    $ExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
}
finally {
  if ($null -eq $PreviousConfig) {
    Remove-Item Env:OPENCODE_CONFIG -ErrorAction SilentlyContinue
  }
  else {
    $env:OPENCODE_CONFIG = $PreviousConfig
  }

  if ($null -eq $PreviousInline) {
    Remove-Item Env:OPENCODE_CONFIG_CONTENT -ErrorAction SilentlyContinue
  }
  else {
    $env:OPENCODE_CONFIG_CONTENT = $PreviousInline
  }
}

exit $ExitCode
