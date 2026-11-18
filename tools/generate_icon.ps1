# Generates src/behavior_pack/pack_icon.png (256x256 RGBA PNG) using only PowerShell and .NET standard classes.
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$outputPath = Join-Path $repoRoot "src\behavior_pack\pack_icon.png"

# Build CRC32 lookup table using 64-bit unsigned-safe arithmetic
$crcTable = New-Object 'int64[]' 256
[int64]$poly = 3988292384L # 0xEDB88320
[int64]$mask32 = 4294967295L # 0xFFFFFFFF
for ($n = 0; $n -lt 256; $n++) {
    [int64]$c = $n
    for ($k = 0; $k -lt 8; $k++) {
        if (($c -band 1L) -ne 0L) {
            $c = $poly -bxor ($c -shr 1)
        } else {
            $c = $c -shr 1
        }
    }
    $crcTable[$n] = $c -band $mask32
}

function Get-Crc32Bytes {
    param([byte[]]$Data)
    [int64]$crc = $mask32
    for ($i = 0; $i -lt $Data.Length; $i++) {
        [int]$idx = [int](($crc -bxor [int64]$Data[$i]) -band 255L)
        $crc = ($crcTable[$idx] -bxor ($crc -shr 8)) -band $mask32
    }
    $crc = ($crc -bxor $mask32) -band $mask32
    return ,([byte[]]@(
        [byte](($crc -shr 24) -band 255L),
        [byte](($crc -shr 16) -band 255L),
        [byte](($crc -shr 8) -band 255L),
        [byte]($crc -band 255L)
    ))
}

function Get-BigEndianUInt32Bytes {
    param([int64]$Value)
    return ,([byte[]]@(
        [byte](($Value -shr 24) -band 255L),
        [byte](($Value -shr 16) -band 255L),
        [byte](($Value -shr 8) -band 255L),
        [byte]($Value -band 255L)
    ))
}

function Write-PngChunk {
    param(
        [System.IO.Stream]$Stream,
        [string]$ChunkType,
        [byte[]]$Payload
    )
    $typeBytes = [System.Text.Encoding]::ASCII.GetBytes($ChunkType)
    $lenBytes = Get-BigEndianUInt32Bytes -Value ([int64]$Payload.Length)

    $crcInput = New-Object 'byte[]' ($typeBytes.Length + $Payload.Length)
    [System.Buffer]::BlockCopy($typeBytes, 0, $crcInput, 0, $typeBytes.Length)
    if ($Payload.Length -gt 0) {
        [System.Buffer]::BlockCopy($Payload, 0, $crcInput, $typeBytes.Length, $Payload.Length)
    }
    $crcBytes = Get-Crc32Bytes -Data $crcInput

    $Stream.Write($lenBytes, 0, 4)
    $Stream.Write($typeBytes, 0, 4)
    if ($Payload.Length -gt 0) {
        $Stream.Write($Payload, 0, $Payload.Length)
    }
    $Stream.Write($crcBytes, 0, 4)
}

function Compress-Zlib {
    param([byte[]]$RawData)
    $ms = New-Object System.IO.MemoryStream
    # Standard zlib header (CMF=0x78, FLG=0x9C)
    $ms.WriteByte(0x78)
    $ms.WriteByte(0x9C)

    $deflate = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Compress, $true)
    $deflate.Write($RawData, 0, $RawData.Length)
    $deflate.Dispose()

    # Adler-32 checksum over uncompressed scanlines
    [int64]$s1 = 1L
    [int64]$s2 = 0L
    [int64]$modAdler = 65521L
    for ($i = 0; $i -lt $RawData.Length; $i++) {
        $s1 = ($s1 + [int64]$RawData[$i]) % $modAdler
        $s2 = ($s2 + $s1) % $modAdler
    }
    [int64]$adler = (($s2 -shl 16) -bor $s1) -band $mask32
    $adlerBytes = Get-BigEndianUInt32Bytes -Value $adler
    $ms.Write($adlerBytes, 0, 4)

    $result = $ms.ToArray()
    $ms.Dispose()
    return ,$result
}

# 16x16 pixel-art Hardcore emblem scaled 16x to 256x256
$grid = @(
    "GGGGGGGGGGGGGGGG",
    "GTTTTTTTTTTTTTTG",
    "GT............TG",
    "GT.OOO....OOO.TG",
    "GTORWRO..ORRROTG",
    "GTORWRROORRRROTG",
    "GTORDDRRRRDDROTG",
    "GTORRRRRRRRRROTG",
    "GT.ORRRRRRRRO.TG",
    "GT..ORRRRRRO..TG",
    "GT...ORRRRO...TG",
    "GT....ORRO....TG",
    "GT.....OO.....TG",
    "GT............TG",
    "GTTTTTTTTTTTTTTG",
    "GGGGGGGGGGGGGGGG"
)

$palette = @{
    'G' = [byte[]]@(0xF5, 0xCB, 0x42, 0xFF) # Bright gold border
    'T' = [byte[]]@(0xA8, 0x76, 0x1A, 0xFF) # Inner gold trim
    '.' = [byte[]]@(0x19, 0x13, 0x26, 0xFF) # Obsidian background
    'O' = [byte[]]@(0x0E, 0x09, 0x12, 0xFF) # Hardcore outline
    'R' = [byte[]]@(0xD1, 0x1D, 0x33, 0xFF) # Crimson heart
    'W' = [byte[]]@(0xFF, 0xE6, 0xEA, 0xFF) # Specular highlight
    'D' = [byte[]]@(0x6B, 0x0A, 0x16, 0xFF) # Hardcore brow accent
}

$width = 256
$height = 256
$scale = 16
$stride = 1 + ($width * 4)
$rawScanlines = New-Object 'byte[]' ($height * $stride)

for ($y = 0; $y -lt $height; $y++) {
    $gy = [int]([Math]::Floor($y / $scale))
    $rowStr = $grid[$gy]
    $rowOffset = $y * $stride
    $rawScanlines[$rowOffset] = 0 # Filter type 0 (None)

    for ($x = 0; $x -lt $width; $x++) {
        $gx = [int]([Math]::Floor($x / $scale))
        $ch = [string]$rowStr[$gx]
        $rgba = $palette[$ch]

        # Subtle checkerboard texture on background pixels
        $r = $rgba[0]
        $g = $rgba[1]
        $b = $rgba[2]
        $a = $rgba[3]
        if ($ch -eq '.' -and ((($gx + $gy) % 2) -eq 1)) {
            $r = [byte]0x22
            $g = [byte]0x1B
            $b = [byte]0x34
        }

        $pxOffset = $rowOffset + 1 + ($x * 4)
        $rawScanlines[$pxOffset] = $r
        $rawScanlines[$pxOffset + 1] = $g
        $rawScanlines[$pxOffset + 2] = $b
        $rawScanlines[$pxOffset + 3] = $a
    }
}

$ihdr = New-Object 'byte[]' 13
[System.Buffer]::BlockCopy((Get-BigEndianUInt32Bytes -Value ([int64]$width)), 0, $ihdr, 0, 4)
[System.Buffer]::BlockCopy((Get-BigEndianUInt32Bytes -Value ([int64]$height)), 0, $ihdr, 4, 4)
$ihdr[8] = 8  # Bit depth: 8
$ihdr[9] = 6  # Color type: 6 (RGBA)
$ihdr[10] = 0 # Compression method: 0
$ihdr[11] = 0 # Filter method: 0
$ihdr[12] = 0 # Interlace method: 0

$idat = Compress-Zlib -RawData $rawScanlines

$outDir = Split-Path -Parent $outputPath
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$pngStream = New-Object System.IO.MemoryStream
$pngSignature = [byte[]]@(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
$pngStream.Write($pngSignature, 0, 8)
Write-PngChunk -Stream $pngStream -ChunkType "IHDR" -Payload $ihdr
Write-PngChunk -Stream $pngStream -ChunkType "IDAT" -Payload $idat
Write-PngChunk -Stream $pngStream -ChunkType "IEND" -Payload ([byte[]]@())

[System.IO.File]::WriteAllBytes($outputPath, $pngStream.ToArray())
$pngStream.Dispose()

Write-Host "[generate_icon] Generated 256x256 RGBA PNG at: $outputPath"
