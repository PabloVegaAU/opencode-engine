<#
.SYNOPSIS
  Resolves paths and inventory from the canonical runtime distribution manifest.

.DESCRIPTION
  This script is the shared resolver/helper for the OpenCode Global runtime
  distribution manifest. It reads the manifest and provides functions to:
  - Resolve source-to-runtime path mappings
  - Get all managed entries across categories
  - Validate manifest consistency
  - Support install/update/cleanup operations

  It is installed to the runtime alongside the manifest so that install/update
  scripts can consume the same canonical inventory.

  When dot-sourced, it defines functions but does not execute the main logic.
  When run directly with -Action, it performs the requested action.

.PARAMETER Action
  Action to perform: ResolveSource, ResolveRuntime, GetInventory, GetDevOnly, ValidateManifest

.PARAMETER SourcePath
  Source-relative path to resolve (for ResolveSource action)

.PARAMETER RuntimePath
  Runtime-relative path to resolve (for ResolveRuntime action)

.PARAMETER Category
  Filter to specific category key (e.g., "contracts", "bin_retrieval", "commands")

.PARAMETER ManifestPath
  Path to the runtime manifest (defaults to this script's directory)

.EXAMPLE
  # Dot-source to use functions directly
  . .\resolve-runtime-manifest.ps1
  $inventory = Get-RuntimeManifestInventory

  # Run as script to perform action
  .\resolve-runtime-manifest.ps1 -Action GetInventory
  .\resolve-runtime-manifest.ps1 -Action ValidateManifest
#>
param(
  [string]$Action,
  [string]$SourcePath,
  [string]$RuntimePath,
  [string]$Category,
  [string]$ManifestPath
)

$ErrorActionPreference = "Stop"

# Find the manifest - default to same directory as this script
if (-not $ManifestPath) {
  $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $ManifestPath = Join-Path $ScriptDir "runtime-manifest.json"
}

function Get-Manifest {
  $content = Get-Content -Path $ManifestPath -Raw -Encoding UTF8
  try {
    return $content | ConvertFrom-Json
  }
  catch {
    Write-Error "Invalid JSON in manifest: $($_.Exception.Message)"
  }
}

function Get-ManifestSourceRoot {
  return [System.IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $ManifestPath)))
}

function Test-SafeManifestRelativePath {
  param([string]$Path, [switch]$AllowTrailingSeparator)
  if ([string]::IsNullOrWhiteSpace($Path) -or [System.IO.Path]::IsPathRooted($Path)) { return $false }
  $normalized = $Path -replace '\\', '/'
  if ($AllowTrailingSeparator) { $normalized = $normalized.TrimEnd('/') }
  if ([string]::IsNullOrWhiteSpace($normalized)) { return $false }
  foreach ($segment in $normalized.Split('/')) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq '.' -or $segment -eq '..') { return $false }
  }
  return $true
}

function Resolve-ContainedManifestPath {
  param([string]$Root, [string]$RelativePath, [switch]$AllowTrailingSeparator)
  if (-not (Test-SafeManifestRelativePath -Path $RelativePath -AllowTrailingSeparator:$AllowTrailingSeparator)) {
    throw "Unsafe manifest path: '$RelativePath'"
  }
  $canonicalRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $canonicalRoot $RelativePath))
  $prefix = $canonicalRoot + [System.IO.Path]::DirectorySeparatorChar
  if (-not $candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Manifest path escapes its root: '$RelativePath'"
  }
  return $candidate
}

function Test-ReparsePointChain {
  param([string]$Root, [string]$Path)
  $canonicalRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
  $current = [System.IO.Path]::GetFullPath($Path)
  while ($current.StartsWith($canonicalRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        return $true
      }
    }
    if ([string]::Equals($current.TrimEnd('\', '/'), $canonicalRoot, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $parent = Split-Path -Parent $current
    if ($parent -eq $current) { break }
    $current = $parent
  }
  return $false
}

function Assert-SafeSourcePath {
  param([string]$SourceRelativePath)
  $root = Get-ManifestSourceRoot
  $path = Resolve-ContainedManifestPath -Root $root -RelativePath $SourceRelativePath
  if (Test-ReparsePointChain -Root $root -Path $path) { throw "Source path contains a reparse point: '$SourceRelativePath'" }
  return $path
}

function Assert-SafeRuntimePath {
  param([string]$TargetRoot, [string]$RuntimeRelativePath)
  $path = Resolve-ContainedManifestPath -Root $TargetRoot -RelativePath $RuntimeRelativePath
  if (Test-ReparsePointChain -Root $TargetRoot -Path $path) { throw "Destination path contains a reparse point: '$RuntimeRelativePath'" }
  return $path
}

function Get-Sha256FromBytes {
  param([byte[]]$Bytes)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return -join ($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) }
  finally { $sha.Dispose() }
}

function New-ImmutableSourceSnapshot {
  param(
    [object[]]$Inventory,
    [Int64]$MaximumBytes = 67108864
  )
  $snapshot = @{}
  [Int64]$totalBytes = 0
  foreach ($entry in $Inventory) {
    $sourcePath = Assert-SafeSourcePath -SourceRelativePath $entry.source
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Missing inventory source: $($entry.source)"
    }
    $bytes = [System.IO.File]::ReadAllBytes($sourcePath)
    $totalBytes += $bytes.LongLength
    if ($totalBytes -gt $MaximumBytes) {
      throw "Distribution source snapshot exceeds the $MaximumBytes byte safety cap before any runtime write."
    }
    $snapshot[$entry.source] = [pscustomobject]@{
      Bytes = $bytes
      Sha256 = Get-Sha256FromBytes -Bytes $bytes
      Length = $bytes.LongLength
    }
  }
  return $snapshot
}

function Get-SourceToRuntimeMapping {
  param([object]$Manifest)

  $mapping = @{}

  # Get category names safely
  $catNames = @($Manifest.categories.PSObject.Properties.Name) | Where-Object { $_ -ne $null -and $_ -ne '' }

  # Process each category
  foreach ($catName in $catNames) {
    if ([string]::IsNullOrEmpty($catName)) { continue }

    $cat = $Manifest.categories."$catName"
    if ($null -eq $cat) { continue }

    # Direct entries
    if ($null -ne $cat.entries -and $cat.entries.Count -gt 0) {
      foreach ($entry in $cat.entries) {
        if ($null -ne $entry.source -and $null -ne $entry.runtime) {
          if (-not (Test-SafeManifestRelativePath -Path $entry.source) -or -not (Test-SafeManifestRelativePath -Path $entry.runtime)) { throw "Unsafe entry in category '$catName'" }
          $mapping[$entry.source] = $entry.runtime
        }
      }
    }

    # Recursive trees with per-tree exclusions
    if ($null -ne $cat.recursive_trees -and $cat.recursive_trees.Count -gt 0) {
      foreach ($tree in $cat.recursive_trees) {
        if ($null -eq $tree.source -or $null -eq $tree.runtime) { continue }
        $sourceBase = $tree.source
        $runtimeBase = $tree.runtime
        if (-not (Test-SafeManifestRelativePath -Path $sourceBase -AllowTrailingSeparator) -or -not (Test-SafeManifestRelativePath -Path $runtimeBase -AllowTrailingSeparator)) { throw "Unsafe recursive tree in category '$catName'" }
        $excludePatterns = if ($null -ne $tree.exclude -and $tree.exclude.Count -gt 0) { $tree.exclude } else { @() }
        $resolved = Resolve-RecursivePaths -SourceBase $sourceBase -RuntimeBase $runtimeBase -ExcludePatterns $excludePatterns
        foreach ($k in $resolved.Keys) {
          $mapping[$k] = $resolved[$k]
        }
      }
    }

    # Recursive with include/exclude patterns
    if ($null -ne $cat.recursive -and $null -ne $cat.include_patterns -and $cat.include_patterns.Count -gt 0) {
      if (-not (Test-SafeManifestRelativePath -Path $cat.source_prefix -AllowTrailingSeparator) -or -not (Test-SafeManifestRelativePath -Path $cat.runtime_prefix -AllowTrailingSeparator)) { throw "Unsafe recursive category '$catName'" }
      $excludePatterns = if ($null -ne $cat.exclude_patterns -and $cat.exclude_patterns.Count -gt 0) { $cat.exclude_patterns } else { @() }
      $resolved = Resolve-RecursivePaths -SourceBase $cat.source_prefix -RuntimeBase $cat.runtime_prefix -IncludePatterns $cat.include_patterns -ExcludePatterns $excludePatterns
      foreach ($k in $resolved.Keys) {
        $mapping[$k] = $resolved[$k]
      }
    }
  }

  return $mapping
}

function Get-RuntimeToSourceMapping {
  param([object]$Manifest)

  $mapping = Get-SourceToRuntimeMapping -Manifest $Manifest
  $reversed = @{}
  foreach ($k in $mapping.Keys) {
    $reversed[$mapping[$k]] = $k
  }
  return $reversed
}

function Resolve-RecursivePaths {
  param(
    [string]$SourceBase,
    [string]$RuntimeBase,
    [string[]]$IncludePatterns = @("*"),
    [string[]]$ExcludePatterns = @()
  )

  $result = @{}
  $sourceRoot = Split-Path -Parent (Split-Path -Parent $ManifestPath)

  # Resolve the source directory
  $sourceDir = Join-Path $sourceRoot $SourceBase
  if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
    return $result
  }

  # Get all files recursively
  $files = Get-ChildItem -LiteralPath $sourceDir -Recurse -File
  foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
    $relativePath = $relativePath -replace '\\', '/'

    # Check if file matches include patterns
    $matched = $false
    foreach ($pattern in $IncludePatterns) {
      if ($relativePath -like $pattern) {
        $matched = $true
        break
      }
    }
    if (-not $matched) { continue }

    # Check exclude patterns (per-tree exclusions)
    $excluded = $false
    foreach ($pattern in $ExcludePatterns) {
      if ($relativePath -eq $pattern -or $relativePath -like $pattern) {
        $excluded = $true
        break
      }
    }
    if ($excluded) { continue }

    $sourceRelPath = ($SourceBase + $relativePath) -replace '\\', '/'
    $runtimeRelPath = ($RuntimeBase + $relativePath) -replace '\\', '/'
    $result[$sourceRelPath] = $runtimeRelPath
  }

  return $result
}

function Get-Inventory {
  param(
    [object]$Manifest,
    [string]$FilterCategory
  )

  $inventory = @()

  # Get category names safely
  $catNames = @($Manifest.categories.PSObject.Properties.Name) | Where-Object { $_ -ne $null -and $_ -ne '' }

  foreach ($catName in $catNames) {
    if ([string]::IsNullOrEmpty($catName)) { continue }
    if ($FilterCategory -and $catName -ne $FilterCategory) { continue }

    $cat = $Manifest.categories."$catName"
    if ($null -eq $cat) { continue }

    $catDesc = if ($null -ne $cat.Description) { $cat.Description } else { $catName }

    # Direct entries
    if ($null -ne $cat.entries -and $cat.entries.Count -gt 0) {
      foreach ($entry in $cat.entries) {
        if ($null -ne $entry.source -and $null -ne $entry.runtime) {
          $inventory += [ordered]@{
            category_key = $catName
            category_description = $catDesc
            source = $entry.source
            runtime = $entry.runtime
            type = "entry"
          }
        }
      }
    }

    # Recursive trees
    if ($null -ne $cat.recursive_trees -and $cat.recursive_trees.Count -gt 0) {
      foreach ($tree in $cat.recursive_trees) {
        if ($null -eq $tree.source -or $null -eq $tree.runtime) { continue }
        $sourceRoot = Split-Path -Parent (Split-Path -Parent $ManifestPath)
        $sourceDir = Join-Path $sourceRoot $tree.source
        $excludePatterns = if ($null -ne $tree.exclude -and $tree.exclude.Count -gt 0) { $tree.exclude } else { @() }
        if (Test-Path -LiteralPath $sourceDir -PathType Container) {
          $files = Get-ChildItem -LiteralPath $sourceDir -Recurse -File
          foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
            $relativePath = $relativePath -replace '\\', '/'

            # Apply exclusions
            $excluded = $false
            foreach ($pattern in $excludePatterns) {
              if ($relativePath -eq $pattern -or $relativePath -like $pattern) {
                $excluded = $true
                break
              }
            }
            if ($excluded) { continue }

            $sourceRelPath = ($tree.source + $relativePath) -replace '\\', '/'
            $runtimeRelPath = ($tree.runtime + $relativePath) -replace '\\', '/'
            $inventory += [ordered]@{
              category_key = $catName
              category_description = $catDesc
              source = $sourceRelPath
              runtime = $runtimeRelPath
              type = "tree"
            }
          }
        }
      }
    }

    # Recursive patterns
    if ($null -ne $cat.recursive -and $null -ne $cat.include_patterns -and $cat.include_patterns.Count -gt 0) {
      $sourceRoot = Split-Path -Parent (Split-Path -Parent $ManifestPath)
      $sourceDir = Join-Path $sourceRoot $cat.source_prefix
      $excludePatterns = if ($null -ne $cat.exclude_patterns -and $cat.exclude_patterns.Count -gt 0) { $cat.exclude_patterns } else { @() }
      if (Test-Path -LiteralPath $sourceDir -PathType Container) {
        $files = Get-ChildItem -LiteralPath $sourceDir -Recurse -File
        foreach ($file in $files) {
          $relativePath = $file.FullName.Substring($sourceDir.Length).TrimStart('\', '/')
          $relativePath = $relativePath -replace '\\', '/'

          $matched = $false
          foreach ($pattern in $cat.include_patterns) {
            if ($relativePath -like $pattern) {
              $matched = $true
              break
            }
          }
          if (-not $matched) { continue }

          foreach ($pattern in $excludePatterns) {
            if ($relativePath -like $pattern) {
              $matched = $false
              break
            }
          }
          if (-not $matched) { continue }

          $sourceRelPath = ($cat.source_prefix + $relativePath) -replace '\\', '/'
          $runtimeRelPath = ($cat.runtime_prefix + $relativePath) -replace '\\', '/'
          $inventory += [ordered]@{
            category_key = $catName
            category_description = $catDesc
            source = $sourceRelPath
            runtime = $runtimeRelPath
            type = "recursive"
          }
        }
      }
    }
  }

  return $inventory
}

function Get-DevOnlyEntries {
  param([object]$Manifest)

  $devOnly = @()
  if ($null -ne $Manifest.categories.runtime_scripts.dev_only -and $Manifest.categories.runtime_scripts.dev_only.Count -gt 0) {
    foreach ($entry in $Manifest.categories.runtime_scripts.dev_only) {
      if ($null -ne $entry.source -and $null -ne $entry.reason) {
        $devOnly += [ordered]@{
          source = $entry.source
          reason = $entry.reason
        }
      }
    }
  }
  return $devOnly
}

function Test-ManifestValid {
  param([object]$Manifest)

  $errors = @()

  # Check required fields
  if (-not $Manifest.manifest_version) {
    $errors += "Missing manifest_version"
  }
  if (-not $Manifest.categories) {
    $errors += "Missing categories"
  }

  # Check required categories exist
  $requiredCategories = @("global_config", "contracts", "bin_retrieval", "templates", "commands", "runtime_scripts")
  foreach ($cat in $requiredCategories) {
    if (-not $Manifest.categories."$cat") {
      $errors += "Missing required category: $cat"
    }
  }

  # Check install_requires
  if (-not $Manifest.install_requires -or $Manifest.install_requires.Count -eq 0) {
    $errors += "install_requires is empty or missing"
  }

  return $errors
}

# Export functions when dot-sourced
function global:Get-RuntimeManifestInventory {
  param([string]$FilterCategory)
  $manifest = Get-Manifest
  return Get-Inventory -Manifest $manifest -FilterCategory $FilterCategory
}

function global:Get-DevOnlyScripts {
  $manifest = Get-Manifest
  return Get-DevOnlyEntries -Manifest $manifest
}

function global:Get-SourceToRuntimePath {
  param([string]$SourcePath)
  $manifest = Get-Manifest
  $mapping = Get-SourceToRuntimeMapping -Manifest $manifest
  if ($mapping.ContainsKey($SourcePath)) {
    return $mapping[$SourcePath]
  }
  return $null
}

function global:Get-RuntimeToSourcePath {
  param([string]$RuntimePath)
  $manifest = Get-Manifest
  $mapping = Get-RuntimeToSourceMapping -Manifest $manifest
  if ($mapping.ContainsKey($RuntimePath)) {
    return $mapping[$RuntimePath]
  }
  return $null
}

function global:Get-RuntimeManifestPath {
  return $ManifestPath
}

# Only execute main logic if Action parameter was provided
if ($Action) {
  switch ($Action) {
    "ResolveSource" {
      if (-not $RuntimePath) {
        Write-Error "-RuntimePath is required for ResolveSource action"
      }
      $manifest = Get-Manifest
      $mapping = Get-RuntimeToSourceMapping -Manifest $manifest
      if ($mapping.ContainsKey($RuntimePath)) {
        Write-Output $mapping[$RuntimePath]
      } else {
        Write-Error "Runtime path not found in manifest: $RuntimePath"
      }
    }

    "ResolveRuntime" {
      if (-not $SourcePath) {
        Write-Error "-SourcePath is required for ResolveRuntime action"
      }
      $manifest = Get-Manifest
      $mapping = Get-SourceToRuntimeMapping -Manifest $manifest
      if ($mapping.ContainsKey($SourcePath)) {
        Write-Output $mapping[$SourcePath]
      } else {
        Write-Error "Source path not found in manifest: $SourcePath"
      }
    }

    "GetInventory" {
      $manifest = Get-Manifest
      $inventory = Get-Inventory -Manifest $manifest -FilterCategory $Category
      if ($Category) {
        $result = @{ $Category = $inventory }
        Write-Output ($result | ConvertTo-Json -Depth 10)
      } else {
        Write-Output ($inventory | ConvertTo-Json -Depth 10)
      }
    }

    "GetDevOnly" {
      $manifest = Get-Manifest
      $devOnly = Get-DevOnlyEntries -Manifest $manifest
      Write-Output ($devOnly | ConvertTo-Json -Depth 10)
    }

    "ValidateManifest" {
      $manifest = Get-Manifest
      $errors = Test-ManifestValid -Manifest $manifest
      if ($errors.Count -eq 0) {
        Write-Host "Manifest is valid."
        exit 0
      } else {
        Write-Host "Manifest validation failed:"
        foreach ($err in $errors) {
          Write-Host "  - $err"
        }
        exit 1
      }
    }

    default {
      Write-Error "Unknown action: $Action"
    }
  }
}
