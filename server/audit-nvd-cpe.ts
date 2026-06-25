async function checkNvd() {
    const res = await fetch('https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-3542');
    const data = await res.json();
    console.log(JSON.stringify(data.vulnerabilities[0].cve.configurations, null, 2));
}
checkNvd().catch(console.error);
