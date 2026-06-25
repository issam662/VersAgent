const https = require('https');

async function testFetch() {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const pubStartDate = sevenDaysAgo.toISOString().replace(/\.\d+Z$/, '.000');
    const pubEndDate = now.toISOString().replace(/\.\d+Z$/, '.000');

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${pubStartDate}&pubEndDate=${pubEndDate}`;
    console.log("Fetching: " + url);

    try {
        const response = await fetch(url);
        console.log("Status:", response.status, response.statusText);

        if (response.ok) {
            const data = await response.json();
            console.log("Results per page:", data.resultsPerPage);
            console.log("Total results:", data.totalResults);
            console.log("Vulnerabilities count:", data.vulnerabilities ? data.vulnerabilities.length : 0);
            if (data.vulnerabilities && data.vulnerabilities.length > 0) {
                console.log("Sample CVE:", data.vulnerabilities[0].cve.id);
            }
        } else {
            const text = await response.text();
            console.log("Error body:", text.substring(0, 500));
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testFetch();
