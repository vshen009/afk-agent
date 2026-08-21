[CmdletBinding()]
param(
    [switch]$WhatIfMode
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$skillsRoot = Join-Path $repoRoot 'skills'

if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
    throw "Run this script from a Git checkout of vstack: $repoRoot"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $env:USERPROFILE ".vstack-backups/$timestamp"
$targets = @(
    @{ Name = 'Codex'; Path = Join-Path $env:USERPROFILE '.codex/skills' },
    @{ Name = 'Claude'; Path = Join-Path $env:USERPROFILE '.claude/skills' }
)

function Invoke-Action([string]$Message, [scriptblock]$Action) {
    if ($WhatIfMode) {
        Write-Output "whatif  $Message"
        return
    }
    & $Action
    Write-Output "done    $Message"
}

function Test-PointsTo([string]$LinkPath, [string]$SourcePath) {
    $item = Get-Item -Force -LiteralPath $LinkPath
    if (-not $item.LinkType) { return $false }
    $target = @($item.Target)[0]
    if (-not $target) { return $false }
    try {
        return (Resolve-Path -LiteralPath $target).Path -eq (Resolve-Path -LiteralPath $SourcePath).Path
    } catch {
        return $false
    }
}

foreach ($target in $targets) {
    Invoke-Action "create $($target.Name) skill directory" { New-Item -ItemType Directory -Path $target.Path -Force | Out-Null }

    Get-ChildItem -LiteralPath $skillsRoot -Directory | ForEach-Object {
        $source = $_.FullName
        if (-not (Test-Path (Join-Path $source 'SKILL.md'))) { return }
        $destination = Join-Path $target.Path $_.Name

        if (Test-Path -LiteralPath $destination) {
            if (Test-PointsTo $destination $source) {
                Write-Output "keep    $destination -> $source"
                return
            }
            $localEnv = Join-Path $destination '.env'
            $repoEnv = Join-Path $source '.env'
            if ((Test-Path -LiteralPath $localEnv) -and -not (Test-Path -LiteralPath $repoEnv)) {
                Invoke-Action "preserve local config $localEnv" { Copy-Item -LiteralPath $localEnv -Destination $repoEnv }
            }
            $backup = Join-Path $backupRoot "$($target.Name)/$($_.Name)"
            Invoke-Action "backup $destination to $backup" {
                New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
                Move-Item -LiteralPath $destination -Destination $backup
            }
        }

        Invoke-Action "link $destination -> $source" {
            try {
                New-Item -ItemType SymbolicLink -Path $destination -Target $source | Out-Null
            } catch {
                New-Item -ItemType Junction -Path $destination -Target $source | Out-Null
            }
        }
    }
}

Write-Output "Backups (if any): $backupRoot"
