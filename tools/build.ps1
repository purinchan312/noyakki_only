# Offline validation and .mcpack/.mcaddon packaging script using only PowerShell and .NET standard classes.
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$srcDir = Join-Path $repoRoot "src"
$bpDir = Join-Path $srcDir "behavior_pack"
$rpDir = Join-Path $srcDir "resource_pack"
$distDir = Join-Path $repoRoot "dist"

$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Test-NoBomUtf8 {
    param([string]$FilePath)
    $bytes = [System.IO.File]::ReadAllBytes($FilePath)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        Add-Failure "UTF-8 BOM detected (must be UTF-8 without BOM): $FilePath"
        return $null
    }
    try {
        return $utf8Strict.GetString($bytes)
    } catch {
        Add-Failure "Invalid UTF-8 encoding in: $FilePath"
        return $null
    }
}

function Test-JsSyntaxLight {
    param([string]$FilePath, [string]$Text)
    $stack = New-Object System.Collections.Generic.Stack[char]
    $n = $Text.Length
    $i = 0
    $line = 1
    $prevNonWs = ';'

    while ($i -lt $n) {
        $c = $Text[$i]
        if ($c -eq "`n") {
            $line++
            $i++
            continue
        }
        if ([char]::IsWhiteSpace($c)) {
            $i++
            continue
        }

        # Line comment
        if ($c -eq '/' -and ($i + 1) -lt $n -and $Text[$i + 1] -eq '/') {
            while ($i -lt $n -and $Text[$i] -ne "`n") { $i++ }
            continue
        }

        # Block comment
        if ($c -eq '/' -and ($i + 1) -lt $n -and $Text[$i + 1] -eq '*') {
            $i += 2
            $closed = $false
            while ($i -lt $n) {
                if ($Text[$i] -eq "`n") { $line++ }
                if ($Text[$i] -eq '*' -and ($i + 1) -lt $n -and $Text[$i + 1] -eq '/') {
                    $i += 2
                    $closed = $true
                    break
                }
                $i++
            }
            if (-not $closed) {
                Add-Failure "Unclosed block comment in $FilePath"
                return
            }
            continue
        }

        # Single or double quoted string
        if ($c -eq "'" -or $c -eq '"') {
            $quote = $c
            $i++
            $closed = $false
            while ($i -lt $n) {
                $sc = $Text[$i]
                if ($sc -eq '\') {
                    $i += 2
                    continue
                }
                if ($sc -eq "`n") {
                    Add-Failure "Unclosed string literal at line $line in $FilePath"
                    return
                }
                if ($sc -eq $quote) {
                    $i++
                    $closed = $true
                    break
                }
                $i++
            }
            if (-not $closed) {
                Add-Failure "Unclosed string literal in $FilePath"
                return
            }
            $prevNonWs = $quote
            continue
        }

        # Template literal (skip text outside ${...}, track inner braces)
        if ($c -eq '`') {
            $i++
            $closed = $false
            while ($i -lt $n) {
                $tc = $Text[$i]
                if ($tc -eq '\') {
                    $i += 2
                    continue
                }
                if ($tc -eq "`n") { $line++ }
                if ($tc -eq '`') {
                    $i++
                    $closed = $true
                    break
                }
                if ($tc -eq '$' -and ($i + 1) -lt $n -and $Text[$i + 1] -eq '{') {
                    $i += 2
                    $depth = 1
                    while ($i -lt $n -and $depth -gt 0) {
                        $ec = $Text[$i]
                        if ($ec -eq "`n") { $line++ }
                        elseif ($ec -eq '\') { $i += 2; continue }
                        elseif ($ec -eq "'" -or $ec -eq '"') {
                            $iq = $ec
                            $i++
                            while ($i -lt $n) {
                                if ($Text[$i] -eq '\') { $i += 2; continue }
                                if ($Text[$i] -eq $iq) { $i++; break }
                                $i++
                            }
                            continue
                        }
                        elseif ($ec -eq '{') { $depth++ }
                        elseif ($ec -eq '}') { $depth-- }
                        $i++
                    }
                    continue
                }
                $i++
            }
            if (-not $closed) {
                Add-Failure "Unclosed template literal in $FilePath"
                return
            }
            $prevNonWs = '`'
            continue
        }

        # Regex literal heuristic when '/' follows operator/delimiter
        if ($c -eq '/' -and ($prevNonWs -in @('=', '(', ',', ':', '!', '?', '[', '{', ';', '&', '|'))) {
            $i++
            $inClass = $false
            $closed = $false
            while ($i -lt $n) {
                $rc = $Text[$i]
                if ($rc -eq '\') { $i += 2; continue }
                if ($rc -eq '[') { $inClass = $true }
                elseif ($rc -eq ']') { $inClass = $false }
                elseif ($rc -eq '/' -and (-not $inClass)) {
                    $i++
                    $closed = $true
                    break
                }
                elseif ($rc -eq "`n") { break }
                $i++
            }
            if (-not $closed) {
                Add-Failure "Unclosed regex literal at line $line in $FilePath"
                return
            }
            $prevNonWs = '/'
            continue
        }

        if ($c -eq '{' -or $c -eq '(' -or $c -eq '[') {
            $stack.Push($c)
        } elseif ($c -eq '}' -or $c -eq ')' -or $c -eq ']') {
            if ($stack.Count -eq 0) {
                Add-Failure "Unmatched closing '$c' at line $line in $FilePath"
                return
            }
            $open = $stack.Pop()
            $expected = switch ($open) {
                '{' { '}' }
                '(' { ')' }
                '[' { ']' }
            }
            if ($c -ne $expected) {
                Add-Failure "Mismatched bracket '$open' and '$c' at line $line in $FilePath"
                return
            }
        }

        $prevNonWs = $c
        $i++
    }

    if ($stack.Count -gt 0) {
        Add-Failure "Unclosed bracket '$($stack.Peek())' in $FilePath"
    }
}

Write-Host "=== 1. Prohibited Files & Dependencies Gate ==="
$forbiddenFileNames = @(
    ("pack" + "age.json"),
    ("pack" + "age-lock.json"),
    ("ya" + "rn.lock"),
    ("pn" + "pm-lock.yaml"),
    ("ts" + "config.json"),
    ("pack" + "ages.config"),
    ("require" + "ments.txt"),
    ("py" + "project.toml"),
    ("Pip" + "file")
)
$forbiddenDirNames = @(
    ("node_" + "modules"),
    ("__py" + "cache__"),
    (".ve" + "nv"),
    ("ve" + "nv")
)
$forbiddenExts = @(
    ".ts", ".tsx", ".mts", ".cts",
    ".py", ".pyc", ".pyo",
    ".java", ".class", ".jar"
)

$repoItems = Get-ChildItem -Path $repoRoot -Recurse -Force | Where-Object {
    $rel = $_.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    $top = ($rel -split '[\\/]')[0]
    $top -ne ".git" -and $top -ne "dist"
}

foreach ($item in $repoItems) {
    if ($item.PSIsContainer) {
        if ($forbiddenDirNames -contains $item.Name) {
            Add-Failure "Prohibited directory detected: $($item.FullName)"
        }
        continue
    }
    if ($forbiddenFileNames -contains $item.Name) {
        Add-Failure "Prohibited file detected: $($item.FullName)"
    }
    if ($forbiddenExts -contains $item.Extension.ToLowerInvariant()) {
        Add-Failure "Prohibited extension ($($item.Extension)) detected: $($item.FullName)"
    }
    if ($item.Extension.ToLowerInvariant() -eq ".csproj") {
        $csprojText = [System.IO.File]::ReadAllText($item.FullName)
        if ($csprojText -match ("<Pack" + "ageReference")) {
            Add-Failure "External NuGet PackageReference is prohibited: $($item.FullName)"
        }
    }
}

# Scan src/ and tools/ for prohibited network calls, beta APIs, or class-based OOP
$betaToken = "-be" + "ta"
$netModuleToken = "@minecraft/server-" + "net"
$httpToken = "ht" + "tp://"
$httpsToken = "ht" + "tps://"
$iwrToken = "Invoke-Web" + "Request"
$irmToken = "Invoke-Rest" + "Method"
$wcToken = "Web" + "Client"
$hcToken = "Http" + "Client"
$xhrToken = "XMLHttp" + "Request"
$fetchPattern = '\bfe' + 'tch\s*\('
$classPattern = '(?m)^\s*(?:export\s+)?cla' + 'ss\s+[A-Za-z_$]'

$scanTargets = Get-ChildItem -Path @($srcDir, (Join-Path $repoRoot "tools")) -Recurse -File -ErrorAction SilentlyContinue
foreach ($file in $scanTargets) {
    $rawText = [System.IO.File]::ReadAllText($file.FullName)
    foreach ($token in @($betaToken, $netModuleToken, $httpToken, $httpsToken, $iwrToken, $irmToken, $wcToken, $hcToken, $xhrToken)) {
        if ($rawText.IndexOf($token, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Add-Failure "Prohibited token '$token' found in: $($file.FullName)"
        }
    }
    if ($rawText -match $fetchPattern) {
        Add-Failure "Prohibited network call pattern found in: $($file.FullName)"
    }
    if ($file.Extension.ToLowerInvariant() -eq ".js") {
        if ($rawText -match $classPattern) {
            Add-Failure "Class declaration is prohibited by architecture guidelines: $($file.FullName)"
        }
        if ($rawText -match '\brequire\s*\(' -or $rawText -match '\bmodule\.exports\b') {
            Add-Failure "CommonJS syntax is prohibited (use ES Modules): $($file.FullName)"
        }
    }
}

Write-Host "=== 2. Encoding, JSON, Lang, and Icon Checks ==="
$textFiles = Get-ChildItem -Path $srcDir -Recurse -File | Where-Object {
    $_.Extension.ToLowerInvariant() -in @(".json", ".lang", ".js")
}

$jsTexts = @{}
foreach ($tf in $textFiles) {
    $content = Test-NoBomUtf8 -FilePath $tf.FullName
    if ($null -eq $content) { continue }
    $ext = $tf.Extension.ToLowerInvariant()
    if ($ext -eq ".json") {
        try {
            $null = $content | ConvertFrom-Json
        } catch {
            Add-Failure "JSON syntax error in $($tf.FullName): $($_.Exception.Message)"
        }
    } elseif ($ext -eq ".js") {
        $jsTexts[$tf.FullName] = $content
        Test-JsSyntaxLight -FilePath $tf.FullName -Text $content
    }
}

# Validate pack_icon.png
$iconPath = Join-Path $bpDir "pack_icon.png"
if (-not (Test-Path $iconPath)) {
    Add-Failure "Missing pack_icon.png at: $iconPath"
} else {
    $pngBytes = [System.IO.File]::ReadAllBytes($iconPath)
    if ($pngBytes.Length -lt 24) {
        Add-Failure "pack_icon.png is too small to be a valid PNG."
    } else {
        $expectedSig = [byte[]]@(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        $sigOk = $true
        for ($k = 0; $k -lt 8; $k++) {
            if ($pngBytes[$k] -ne $expectedSig[$k]) { $sigOk = $false; break }
        }
        if (-not $sigOk) {
            Add-Failure "pack_icon.png does not have a valid PNG signature."
        }
        $pngW = ([uint32]$pngBytes[16] -shl 24) -bor ([uint32]$pngBytes[17] -shl 16) -bor ([uint32]$pngBytes[18] -shl 8) -bor [uint32]$pngBytes[19]
        $pngH = ([uint32]$pngBytes[20] -shl 24) -bor ([uint32]$pngBytes[21] -shl 16) -bor ([uint32]$pngBytes[22] -shl 8) -bor [uint32]$pngBytes[23]
        if ($pngW -le 0 -or $pngH -le 0) {
            Add-Failure "pack_icon.png has invalid IHDR dimensions (${pngW}x${pngH})."
        }
    }
}

# Validate languages.json and .lang files
$langsJsonPath = Join-Path $bpDir "texts\languages.json"
if (-not (Test-Path $langsJsonPath)) {
    Add-Failure "Missing texts/languages.json"
} else {
    $langsList = ([System.IO.File]::ReadAllText($langsJsonPath, $utf8Strict)) | ConvertFrom-Json
    foreach ($reqLang in @("ja_JP", "en_US")) {
        if ($langsList -notcontains $reqLang) {
            Add-Failure "languages.json missing required locale '$reqLang'"
        }
        $langFile = Join-Path $bpDir "texts\$reqLang.lang"
        if (-not (Test-Path $langFile)) {
            Add-Failure "Missing translation file: $langFile"
        } else {
            $langContent = [System.IO.File]::ReadAllText($langFile, $utf8Strict)
            if ($langContent -notmatch '(?m)^pack\.name=.+$' -or $langContent -notmatch '(?m)^pack\.description=.+$') {
                Add-Failure "Missing pack.name or pack.description in: $langFile"
            }
        }
    }
}

Write-Host "=== 3. Manifest & Dependency Checks ==="
$manifestPath = Join-Path $bpDir "manifest.json"
$versionString = "0.0.0"
if (-not (Test-Path $manifestPath)) {
    Add-Failure "Missing manifest.json at: $manifestPath"
} else {
    $manifest = ([System.IO.File]::ReadAllText($manifestPath, $utf8Strict)) | ConvertFrom-Json
    if ($manifest.format_version -ne 2) {
        Add-Failure "manifest.json format_version must be 2."
    }

    $minVer = @($manifest.header.min_engine_version)
    if ($minVer.Count -ne 3 -or $minVer[0] -ne 1 -or $minVer[1] -ne 26 -or $minVer[2] -ne 60) {
        Add-Failure "manifest.json min_engine_version must be [1, 26, 60]."
    }

    $hdrVer = @($manifest.header.version)
    if ($hdrVer.Count -ne 3) {
        Add-Failure "manifest.json header.version must be a [major, minor, patch] array."
    } else {
        $versionString = "$($hdrVer[0]).$($hdrVer[1]).$($hdrVer[2])"
    }

    $uuidRegex = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $seenUuids = New-Object System.Collections.Generic.HashSet[string]
    if ($manifest.header.uuid -notmatch $uuidRegex) {
        Add-Failure "Invalid header.uuid format: $($manifest.header.uuid)"
    } else {
        [void]$seenUuids.Add($manifest.header.uuid)
    }

    $hasScriptModule = $false
    foreach ($mod in $manifest.modules) {
        if ($mod.uuid -notmatch $uuidRegex) {
            Add-Failure "Invalid module uuid format: $($mod.uuid)"
        } elseif (-not $seenUuids.Add($mod.uuid)) {
            Add-Failure "Duplicate UUID found in manifest.json: $($mod.uuid)"
        }

        $modVer = @($mod.version)
        if ($modVer.Count -ne 3 -or $modVer[0] -ne $hdrVer[0] -or $modVer[1] -ne $hdrVer[1] -or $modVer[2] -ne $hdrVer[2]) {
            Add-Failure "Module version does not match header.version ($versionString)."
        }

        if ($mod.type -eq "script") {
            $hasScriptModule = $true
            if ($mod.language -ne "javascript") {
                Add-Failure "Script module language must be 'javascript'."
            }
            $entryRel = $mod.entry -replace '/', '\'
            $entryFull = Join-Path $bpDir $entryRel
            if (-not (Test-Path $entryFull)) {
                Add-Failure "Script entry file missing: $entryFull"
            }
        }
    }
    if (-not $hasScriptModule) {
        Add-Failure "manifest.json must declare a script module."
    }

    $allowedDeps = @{
        "@minecraft/server" = "2.11.0"
        "@minecraft/server-ui" = "2.3.0"
    }
    $foundDeps = New-Object System.Collections.Generic.HashSet[string]
    foreach ($dep in $manifest.dependencies) {
        if (-not $allowedDeps.ContainsKey($dep.module_name)) {
            Add-Failure "Prohibited dependency in manifest.json: $($dep.module_name)"
            continue
        }
        [void]$foundDeps.Add($dep.module_name)
        if ($dep.version -ne $allowedDeps[$dep.module_name]) {
            Add-Failure "Dependency $($dep.module_name) version must be '$($allowedDeps[$dep.module_name])', got '$($dep.version)'."
        }
    }
    foreach ($reqDep in $allowedDeps.Keys) {
        if (-not $foundDeps.Contains($reqDep)) {
            Add-Failure "Missing required dependency in manifest.json: $reqDep"
        }
    }
}

Write-Host "=== 4. ES Module Import/Export Resolution ==="
$exportsByFile = @{}
foreach ($kv in $jsTexts.GetEnumerator()) {
    $exportSet = New-Object System.Collections.Generic.HashSet[string]
    $exportDeclMatches = [regex]::Matches($kv.Value, '(?m)^\s*export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)')
    foreach ($m in $exportDeclMatches) {
        [void]$exportSet.Add($m.Groups[1].Value)
    }
    $exportListMatches = [regex]::Matches($kv.Value, 'export\s*\{([^}]*)\}')
    foreach ($m in $exportListMatches) {
        $items = $m.Groups[1].Value -split ','
        foreach ($item in $items) {
            $trimmed = $item.Trim()
            if ($trimmed.Length -eq 0) { continue }
            if ($trimmed -match '([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)') {
                [void]$exportSet.Add($Matches[2])
            } elseif ($trimmed -match '^([A-Za-z_$][A-Za-z0-9_$]*)$') {
                [void]$exportSet.Add($Matches[1])
            }
        }
    }
    $exportsByFile[$kv.Key] = $exportSet
}

foreach ($kv in $jsTexts.GetEnumerator()) {
    $filePath = $kv.Key
    $fileDir = Split-Path -Parent $filePath
    $importMatches = [regex]::Matches($kv.Value, '(?ms)import\s+([\s\S]*?)\s+from\s+["'']([^"'']+)["'']\s*;')
    foreach ($im in $importMatches) {
        $clause = $im.Groups[1].Value
        $specifier = $im.Groups[2].Value
        if ($specifier -eq "@minecraft/server" -or $specifier -eq "@minecraft/server-ui") {
            continue
        }
        if (-not ($specifier.StartsWith("./") -or $specifier.StartsWith("../"))) {
            Add-Failure "Prohibited non-relative external import '$specifier' in $filePath"
            continue
        }
        $targetPath = [System.IO.Path]::GetFullPath((Join-Path $fileDir ($specifier -replace '/', '\')))
        if (-not (Test-Path $targetPath)) {
            Add-Failure "Broken relative import '$specifier' in $filePath (missing $targetPath)"
            continue
        }
        if ($clause -match '\{([^}]*)\}') {
            $targetExports = $exportsByFile[$targetPath]
            $names = $Matches[1] -split ','
            foreach ($entry in $names) {
                $clean = $entry.Trim()
                if ($clean.Length -eq 0) { continue }
                $origName = ($clean -split '\s+as\s+')[0].Trim()
                if ($null -eq $targetExports -or (-not $targetExports.Contains($origName))) {
                    Add-Failure "Imported symbol '$origName' is not exported by '$specifier' (referenced in $filePath)"
                }
            }
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host "Build aborted with $($failures.Count) verification failure(s)." -ForegroundColor Red
    exit 1
}

Write-Host "=== 5. Packaging Offline Artifact ==="
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

function Add-DirectoryToZip {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$SourceRoot,
        [string]$ArchivePrefix
    )
    $files = Get-ChildItem -Path $SourceRoot -Recurse -File | Sort-Object FullName
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($SourceRoot.Length).TrimStart('\', '/') -replace '\\', '/'
        $entryName = if ([string]::IsNullOrEmpty($ArchivePrefix)) { $rel } else { "$ArchivePrefix/$rel" }
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $Archive,
            $f.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
}

$hasResourcePack = Test-Path (Join-Path $rpDir "manifest.json")
$outExt = if ($hasResourcePack) { ".mcaddon" } else { ".mcpack" }
$outFileName = "noyakki_only_v${versionString}${outExt}"
$outPath = Join-Path $distDir $outFileName

if (Test-Path $outPath) {
    Remove-Item -Path $outPath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open($outPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    if ($hasResourcePack) {
        Add-DirectoryToZip -Archive $archive -SourceRoot $bpDir -ArchivePrefix "behavior_pack"
        Add-DirectoryToZip -Archive $archive -SourceRoot $rpDir -ArchivePrefix "resource_pack"
    } else {
        Add-DirectoryToZip -Archive $archive -SourceRoot $bpDir -ArchivePrefix ""
    }
} finally {
    $archive.Dispose()
}

Write-Host "=== 6. Verifying Packaged Archive ==="
$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($outPath)
try {
    $entryNames = @($verifyZip.Entries | ForEach-Object { $_.FullName })
    foreach ($en in $entryNames) {
        if ($en.Contains('\')) {
            Add-Failure "Archive entry uses backslash instead of forward slash: $en"
        }
    }
    $prefix = if ($hasResourcePack) { "behavior_pack/" } else { "" }
    foreach ($reqEntry in @(
        "${prefix}manifest.json",
        "${prefix}pack_icon.png",
        "${prefix}texts/languages.json",
        "${prefix}texts/ja_JP.lang",
        "${prefix}texts/en_US.lang",
        "${prefix}scripts/main.js"
    )) {
        if ($entryNames -notcontains $reqEntry) {
            Add-Failure "Archive missing required entry: $reqEntry"
        }
    }
    Write-Host "[PASS] Packaged $($entryNames.Count) entries into $outPath" -ForegroundColor Green
} finally {
    $verifyZip.Dispose()
}

if ($failures.Count -gt 0) {
    Write-Host "Archive verification failed with $($failures.Count) error(s)." -ForegroundColor Red
    exit 1
}

Write-Host "=== ALL CHECKS PASSED ($outFileName) ===" -ForegroundColor Green
