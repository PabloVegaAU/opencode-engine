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

.PARAMETER Profile
  Profile to use: go, chatgpt-plus, chatgpt, mix, minimax-plus

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
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

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

function Invoke-RoutingBuilder {
  param(
    [string]$GlobalConfigPath,
    [string]$TargetRootPath,
    [string]$ProfileName,
    [string]$OverlayPath,
    [string]$MatrixPath,
    [string]$SchemaPath
  )

  $builder = @'
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv from "ajv";
import { parse, printParseErrorCode } from "jsonc-parser";

const [globalRoot, targetRoot, profileName, overlayPath, matrixPath, schemaPath] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFile(filePath));
  } catch (error) {
    fail(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function loadJsonc(filePath) {
  const errors = [];
  const value = parse(readFile(filePath), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const formatted = errors.map((entry) => `${printParseErrorCode(entry.error)}@${entry.offset}`).join(", ");
    fail(`Invalid JSONC in ${filePath}: ${formatted}`);
  }
  return value;
}

function normalizeSource(filePath) {
  return path.relative(targetRoot, filePath).replaceAll("\\", "/");
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
  const config = filePath.endsWith(".jsonc") ? loadJsonc(filePath) : loadJson(filePath);
  const agents = config?.agent ?? {};
  for (const [name, settings] of Object.entries(agents)) {
    if (!discovered.has(name)) {
      discovered.set(name, { name, sources: new Set(), modes: new Set(), category: null });
    }
    const record = discovered.get(name);
    record.sources.add(normalizeSource(filePath));
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
      discovered.set(agentName, { name: agentName, sources: new Set(), modes: new Set(), category: null });
    }
    const record = discovered.get(agentName);
    record.sources.add(normalizeSource(filePath));
    const frontmatter = parseFrontmatter(filePath);
    if (typeof frontmatter.mode === "string" && frontmatter.mode.length > 0) {
      record.modes.add(frontmatter.mode);
    }
  }
}

function validateOverlay(overlay) {
  const keys = Object.keys(overlay).sort();
  const allowed = ["$schema", "model", "small_model"];
  if (keys.length !== allowed.length || !allowed.every((key) => keys.includes(key))) {
    fail(`Profile overlay contains unexpected keys: ${keys.join(", ")}`);
  }
}

const overlay = loadJson(overlayPath);
validateOverlay(overlay);

const matrix = loadJson(matrixPath);
const schema = loadJson(schemaPath);
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(matrix)) {
  fail(`Routing matrix failed schema validation: ${ajv.errorsText(validate.errors, { separator: " | " })}`);
}

const profileMatrix = matrix?.profiles?.[profileName];
if (!profileMatrix) {
  fail(`Profile not found in routing matrix: ${profileName}`);
}

const discovered = new Map();
collectConfigAgents(path.join(targetRoot, "opencode.json"), discovered);
collectConfigAgents(path.join(targetRoot, "opencode.jsonc"), discovered);
collectMarkdownAgents(path.join(targetRoot, ".opencode", "agents"), discovered);

const categoryFile = path.join(targetRoot, ".opencode", "model-routing.json");
const localCategories = fs.existsSync(categoryFile) ? loadJson(categoryFile) : {};

for (const [name, category] of Object.entries(localCategories ?? {})) {
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
    sources: [...record.sources].sort(),
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
    categories: localCategories ?? {},
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
