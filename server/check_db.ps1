
$server = "EUMOOUJ-DB01"
$database = "IT_Applications"
$user = "Issam_IT"
$password = "issam123"

$connectionString = "Server=$server;Database=$database;User Id=$user;Password=$password;"

$query = "SELECT id, hostname, agent_id FROM machines WHERE hostname = 'DLD9VW9Q3'"
$machine = Invoke-Sqlcmd -ConnectionString $connectionString -Query $query -TrustServerCertificate

if ($machine) {
    Write-Host "Machine Found: $($machine.hostname) (ID: $($machine.id))"
    $countQuery = "SELECT count(*) as count FROM installed_apps WHERE machine_id = '$($machine.id)'"
    $count = Invoke-Sqlcmd -ConnectionString $connectionString -Query $countQuery -TrustServerCertificate
    Write-Host "Installed Apps Count: $($count.count)"
    
    if ($count.count -gt 0) {
        $appsQuery = "SELECT TOP 5 app_name, version FROM installed_apps WHERE machine_id = '$($machine.id)'"
        $apps = Invoke-Sqlcmd -ConnectionString $connectionString -Query $appsQuery -TrustServerCertificate
        $apps | Format-Table
    } else {
        Write-Host "No apps found for this machine."
    }
} else {
    Write-Host "Machine 'DLD9VW9Q3' NOT FOUND in database."
    # List all machines just in case
    $all = Invoke-Sqlcmd -ConnectionString $connectionString -Query "SELECT hostname FROM machines" -TrustServerCertificate
    Write-Host "Available machines: $($all.hostname -join ', ')"
}
