<#
.SYNOPSIS
  Pulls ELEARNING_CampusCE from the ADS SQL Server (read-only) into gzipped CSV batches on this laptop.

.DESCRIPTION
  - Run while OFF the VPN (ADS reachable). Uses Windows Integrated auth, ApplicationIntent=ReadOnly, SELECT only.
  - Output: staging\runs\<runId>\data\<table>\000001.csv.gz ... plus schema\<table>.json, state\<table>.json,
    manifest.json and a DONE marker once every table is complete.
  - Resumable: an unfinished run is continued from the last fully written batch of each table.
  - Throttled: pauses between batches (-BatchSize / -PauseMs).
  - CSV is in PostgreSQL COPY ... CSV format: NULL = unquoted empty field, text is always quoted.
#>
[CmdletBinding()]
param(
    [string]$Server    = 'appdata.ads.ttu.edu',
    [string]$Database  = 'ELEARNING_CampusCE',
    [string]$StageRoot = (Join-Path $PSScriptRoot 'staging'),
    [int]$BatchSize    = 20000,
    [int]$PauseMs      = 1500,
    [int]$MaxRetries   = 5,
    [string[]]$OnlyTables,                       # optional: restrict to these tables (testing)
    [string[]]$OnceTables = @('BB_CCFC_UniqueUsers_20220523'),   # pulled a single time, never re-synced
    [int]$MaxBatchesPerTable = 0,                # 0 = unlimited; >0 only for smoke tests
    [double]$MinHours  = 0                       # >0: skip unless this long has passed since the last finished run (used by the scheduler)
)

$ErrorActionPreference = 'Stop'
$inv = [System.Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $StageRoot, (Join-Path $StageRoot 'runs'), (Join-Path $StageRoot 'logs') | Out-Null
$logFile = Join-Path $StageRoot ("logs\pull_{0:yyyyMMdd}.log" -f (Get-Date))

function Log([string]$msg) {
    $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $msg
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

# ---- single-instance lock (released automatically if the process dies) ----
$lockPath = Join-Path $StageRoot 'pull.lock'
try {
    $lock = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
} catch {
    Log 'Another pull is already running; exiting.'
    exit 3
}

# ---- type mapping SQL Server -> PostgreSQL ----
function Get-PgType($c) {
    switch ($c.type) {
        'int'              { 'integer' }
        'bigint'           { 'bigint' }
        'smallint'         { 'smallint' }
        'tinyint'          { 'smallint' }
        'bit'              { 'boolean' }
        { $_ -in 'decimal','numeric' } { "numeric($($c.precision),$($c.scale))" }
        'money'            { 'numeric(19,4)' }
        'smallmoney'       { 'numeric(10,4)' }
        'float'            { 'double precision' }
        'real'             { 'real' }
        { $_ -in 'char','varchar','nchar','nvarchar' } {
            $len = if ($c.type.StartsWith('n')) { [int]($c.max_length / 2) } else { [int]$c.max_length }
            if ($c.max_length -eq -1) { 'text' } else { "varchar($len)" }
        }
        { $_ -in 'text','ntext','xml','sql_variant' } { 'text' }
        'date'             { 'date' }
        { $_ -in 'datetime','smalldatetime' } { 'timestamp(3)' }
        'datetime2'        { "timestamp($([Math]::Min([int]$c.scale,6)))" }
        'datetimeoffset'   { "timestamptz($([Math]::Min([int]$c.scale,6)))" }
        'time'             { "time($([Math]::Min([int]$c.scale,6)))" }
        'uniqueidentifier' { 'uuid' }
        { $_ -in 'binary','varbinary','image','timestamp','rowversion' } { 'bytea' }
        default            { 'text' }
    }
}
$lobTypes = @('text','ntext','image','xml','sql_variant')

function New-Conn {
    $cs = "Server=$Server;Database=$Database;Integrated Security=SSPI;Encrypt=True;TrustServerCertificate=True;" +
          "ApplicationIntent=ReadOnly;Connect Timeout=20;Application Name=campusce-pull"
    $c = New-Object System.Data.SqlClient.SqlConnection $cs
    $c.Open()
    $c
}

function Write-Json($obj, $path) {
    $tmp = "$path.tmp"
    $obj | ConvertTo-Json -Depth 8 | Set-Content -Path $tmp -Encoding UTF8
    Move-Item -Force $tmp $path
}

function Format-Field($v) {
    if ($v -is [System.DBNull]) { return '' }
    if ($v -is [string])  { return '"' + $v.Replace([string][char]0, '').Replace('"', '""') + '"' }
    if ($v -is [bool])    { if ($v) { return 't' } else { return 'f' } }
    if ($v -is [byte[]])  { return '\x' + [BitConverter]::ToString($v).Replace('-', '').ToLowerInvariant() }
    if ($v -is [datetime])        { return $v.ToString('yyyy-MM-dd HH:mm:ss.FFFFFFF', $inv) }
    if ($v -is [datetimeoffset])  { return $v.ToString('yyyy-MM-dd HH:mm:ss.FFFFFFFzzz', $inv) }
    if ($v -is [timespan])        { return $v.ToString('hh\:mm\:ss\.FFFFFFF', $inv) }
    if ($v -is [guid])    { return $v.ToString('D') }
    if ($v -is [double] -or $v -is [single]) { return $v.ToString('R', $inv) }
    if ($v -is [decimal] -or $v -is [int16] -or $v -is [int32] -or $v -is [int64] -or $v -is [byte]) { return $v.ToString($inv) }
    return '"' + ([string]$v).Replace([string][char]0, '').Replace('"', '""') + '"'
}

# ---- is a run due? (an unfinished run always is; otherwise wait MinHours after the last finished run) ----
$runsDir = Join-Path $StageRoot 'runs'
if ($MinHours -gt 0) {
    $unfinished = Get-ChildItem $runsDir -Directory -ErrorAction SilentlyContinue |
                  Where-Object { -not (Test-Path (Join-Path $_.FullName 'DONE')) }
    $lastDone = Get-ChildItem $runsDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { Test-Path (Join-Path $_.FullName 'DONE') } |
                ForEach-Object { (Get-Item (Join-Path $_.FullName 'DONE')).LastWriteTime } | Sort-Object | Select-Object -Last 1
    if (-not $unfinished -and $lastDone -and ((Get-Date) - $lastDone).TotalHours -lt $MinHours) {
        $lock.Dispose(); exit 0     # not due yet; stay quiet so hourly scheduling doesn't spam the log
    }
}
# quick reachability probe so being on the VPN doesn't cost minutes of retries
$tcp = New-Object System.Net.Sockets.TcpClient
$reach = $false
try { $reach = $tcp.ConnectAsync($Server, 1433).Wait(5000) } catch {}
$tcp.Close()
if (-not $reach) { Log 'ADS not reachable right now (VPN on?); will try again next time.'; $lock.Dispose(); exit 2 }

# ---- choose / resume run ----
$runDir = Get-ChildItem $runsDir -Directory -ErrorAction SilentlyContinue |
          Where-Object { -not (Test-Path (Join-Path $_.FullName 'DONE')) } |
          Sort-Object Name | Select-Object -Last 1
if ($runDir) { $runDir = $runDir.FullName; Log "Resuming unfinished run $(Split-Path $runDir -Leaf)" }
else {
    $runDir = Join-Path $runsDir (Get-Date -Format 'yyyyMMdd_HHmmss')
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null
    Log "Starting new run $(Split-Path $runDir -Leaf)"
}
foreach ($d in 'data','schema','state') { New-Item -ItemType Directory -Force -Path (Join-Path $runDir $d) | Out-Null }
$onceFile = Join-Path $StageRoot 'once_done.json'
$onceDone = @(); if (Test-Path $onceFile) { $onceDone = @(Get-Content $onceFile -Raw | ConvertFrom-Json) }

# ---- connect with retry ----
function Connect-Retry {
    for ($i = 1; $i -le $MaxRetries; $i++) {
        try { return New-Conn } catch {
            Log "Connect attempt $i/$MaxRetries failed: $($_.Exception.Message)"
            if ($i -eq $MaxRetries) { throw }
            Start-Sleep -Seconds ([Math]::Min(300, 5 * [Math]::Pow(2, $i)))
        }
    }
}
try { $conn = Connect-Retry } catch { Log 'Cannot reach ADS (are you on the VPN?). Exiting.'; exit 2 }

# ---- discover schema (read-only catalog queries) ----
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
SELECT s.name AS sch, t.name AS tbl, c.column_id, c.name AS col, ty.name AS typ,
       c.max_length, c.precision, c.scale, c.is_nullable
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.system_type_id
ORDER BY s.name, t.name, c.column_id
"@
$tables = [ordered]@{}
$r = $cmd.ExecuteReader()
while ($r.Read()) {
    $key = "$($r['sch']).$($r['tbl'])"
    if (-not $tables.Contains($key)) { $tables[$key] = [ordered]@{ schema = $r['sch']; table = $r['tbl']; columns = New-Object System.Collections.ArrayList; pk = @() } }
    [void]$tables[$key].columns.Add([pscustomobject]@{
        name = $r['col']; type = $r['typ']; max_length = [int]$r['max_length']; precision = [int]$r['precision']
        scale = [int]$r['scale']; nullable = [bool]$r['is_nullable'] })
}
$r.Close()
$cmd.CommandText = @"
SELECT s.name AS sch, t.name AS tbl, c.name AS col, ic.key_ordinal
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = t.object_id AND i.is_primary_key = 1
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
ORDER BY s.name, t.name, ic.key_ordinal
"@
$r = $cmd.ExecuteReader()
while ($r.Read()) { $tables["$($r['sch']).$($r['tbl'])"].pk += $r['col'] }
$r.Close()
$conn.Close()
Log "Discovered $($tables.Count) tables."

# ---- pull each table ----
$failed = @()
foreach ($key in $tables.Keys) {
    $t = $tables[$key]
    if ($OnlyTables -and ($t.table -notin $OnlyTables)) { continue }
    if ($t.table -in $OnceTables -and $t.table -in $onceDone) { Log "Skip $key (one-time table already pulled)"; continue }

    $stateFile = Join-Path $runDir "state\$($t.table).json"
    $state = [pscustomobject]@{ offset = 0; batches = 0; rows = 0; done = $false }
    if (Test-Path $stateFile) { $state = Get-Content $stateFile -Raw | ConvertFrom-Json }
    if ($state.done) { Log "Skip $key (already complete in this run)"; continue }

    # schema + ordering
    $cols = $t.columns
    foreach ($c in $cols) { $c | Add-Member -NotePropertyName pgtype -NotePropertyValue (Get-PgType $c) -Force }
    $orderCols = if ($t.pk.Count -gt 0) { $t.pk } else { @($cols | Where-Object { $_.type -notin $lobTypes -and $_.max_length -ne -1 } | ForEach-Object { $_.name }) }
    Write-Json ([ordered]@{ schema = $t.schema; table = $t.table; pk = $t.pk; columns = $cols }) (Join-Path $runDir "schema\$($t.table).json")
    $colList   = ($cols | ForEach-Object { "[$($_.name)]" }) -join ', '
    $orderList = if ($orderCols.Count -gt 0) { ($orderCols | ForEach-Object { "[$_]" }) -join ', ' } else { '(SELECT NULL)' }
    $sql = "SELECT $colList FROM [$($t.schema)].[$($t.table)] ORDER BY $orderList OFFSET @o ROWS FETCH NEXT @n ROWS ONLY"
    $tblDir = Join-Path $runDir "data\$($t.table)"
    New-Item -ItemType Directory -Force -Path $tblDir | Out-Null
    Log "Pulling $key (resume at offset $($state.offset))"

    $batchesThisSession = 0
    try {
        while (-not $state.done) {
            $rowsInBatch = -1; $attempt = 0
            while ($rowsInBatch -lt 0) {
                $attempt++
                $tmpFile = Join-Path $tblDir ('{0:D6}.csv.gz.tmp' -f ($state.batches + 1))
                try {
                    if (-not $conn -or $conn.State -ne 'Open') { $conn = Connect-Retry }
                    $q = $conn.CreateCommand(); $q.CommandText = $sql; $q.CommandTimeout = 180
                    [void]$q.Parameters.AddWithValue('@o', [int64]$state.offset)
                    [void]$q.Parameters.AddWithValue('@n', [int]$BatchSize)
                    $rd = $q.ExecuteReader()
                    $fs = [System.IO.File]::Create($tmpFile)
                    $gz = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Compress)
                    $sw = New-Object System.IO.StreamWriter($gz, (New-Object System.Text.UTF8Encoding($false)))
                    $sw.NewLine = "`n"
                    $n = 0; $fc = $rd.FieldCount
                    $sb = New-Object System.Text.StringBuilder
                    while ($rd.Read()) {
                        [void]$sb.Clear()
                        for ($i = 0; $i -lt $fc; $i++) {
                            if ($i -gt 0) { [void]$sb.Append(',') }
                            [void]$sb.Append((Format-Field $rd.GetValue($i)))
                        }
                        $sw.WriteLine($sb.ToString()); $n++
                    }
                    $rd.Close(); $sw.Dispose()
                    $rowsInBatch = $n
                } catch {
                    foreach ($o in 'rd','sw') { try { (Get-Variable $o -ValueOnly -ErrorAction SilentlyContinue).Dispose() } catch {} }
                    Remove-Item -Force $tmpFile -ErrorAction SilentlyContinue
                    Log "  $($t.table) batch failed (attempt $attempt/$MaxRetries): $($_.Exception.Message)"
                    try { $conn.Close() } catch {}; $conn = $null
                    if ($attempt -ge $MaxRetries) { throw }
                    Start-Sleep -Seconds ([Math]::Min(300, 5 * [Math]::Pow(2, $attempt)))
                }
            }
            if ($rowsInBatch -gt 0) {
                Move-Item -Force $tmpFile ($tmpFile -replace '\.tmp$', '')
                $state.batches++; $state.offset += $rowsInBatch; $state.rows += $rowsInBatch
            } else { Remove-Item -Force $tmpFile -ErrorAction SilentlyContinue }
            $batchesThisSession++
            if ($rowsInBatch -lt $BatchSize) { $state.done = $true }
            if ($MaxBatchesPerTable -gt 0 -and $batchesThisSession -ge $MaxBatchesPerTable -and -not $state.done) {
                Write-Json $state $stateFile; Log "  $($t.table): stopped after $batchesThisSession batch(es) (smoke test)"; break
            }
            Write-Json $state $stateFile
            if (-not $state.done) { Start-Sleep -Milliseconds $PauseMs }
        }
        if ($state.done) { Log "  $($t.table): complete, $($state.rows) rows in $($state.batches) batch(es)" }
    } catch {
        Log "FAILED $key : $($_.Exception.Message) (will resume from offset $($state.offset) next run)"
        $failed += $key
    }
}
try { if ($conn) { $conn.Close() } } catch {}

# ---- finish run ----
$allDone = $true; $manifestTables = @()
foreach ($key in $tables.Keys) {
    $t = $tables[$key]
    if ($OnlyTables -and ($t.table -notin $OnlyTables)) { continue }
    if ($t.table -in $OnceTables -and $t.table -in $onceDone) { continue }
    $sf = Join-Path $runDir "state\$($t.table).json"
    $st = if (Test-Path $sf) { Get-Content $sf -Raw | ConvertFrom-Json } else { $null }
    if (-not $st -or -not $st.done) { $allDone = $false } else {
        $manifestTables += [pscustomobject]@{ schema = $t.schema; table = $t.table; rows = $st.rows; batches = $st.batches; once = ($t.table -in $OnceTables) }
    }
}
if ($allDone -and $failed.Count -eq 0 -and -not $MaxBatchesPerTable -and -not $OnlyTables) {
    Write-Json ([ordered]@{ run = (Split-Path $runDir -Leaf); finished = (Get-Date).ToString('s'); tables = $manifestTables }) (Join-Path $runDir 'manifest.json')
    Set-Content -Path (Join-Path $runDir 'DONE') -Value (Get-Date).ToString('s')
    $newOnce = @($onceDone) + @($manifestTables | Where-Object { $_.once } | ForEach-Object { $_.table }) | Select-Object -Unique
    Write-Json @($newOnce) $onceFile
    Log "Run complete: $(($manifestTables | Measure-Object rows -Sum).Sum) rows across $($manifestTables.Count) tables."
    $lock.Dispose(); exit 0
} else {
    Log "Run NOT complete (failed: $($failed -join ', ')). Re-run to resume."
    $lock.Dispose(); exit 1
}
