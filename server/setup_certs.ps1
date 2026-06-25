$cert = New-SelfSignedCertificate -DnsName "10.71.12.59", "localhost" -CertStoreLocation "Cert:\CurrentUser\My" -FriendlyName "VersAgent-SSL"
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
$path = "c:\Users\Public\Documents\App\PFE PROJECT\server\certs.pfx"
Export-PfxCertificate -Cert $cert -FilePath $path -Password $pwd
Write-Host "Certificate exported to $path"
